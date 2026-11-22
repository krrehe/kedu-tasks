import { getState, mergeRemote, onMutate, setSyncState } from '../store'
import { apiBase } from './api'
import { debounce } from './utils'

let inFlight = false

export function syncEnabled(): boolean {
  const { sync } = getState().settings
  return !!sync.url.trim()
}

export async function syncNow(): Promise<boolean> {
  const { settings, data, sync } = getState()
  const base = settings.sync.url.trim().replace(/\/+$/, '')
  if (!base) {
    setSyncState({ status: 'error', error: '未配置同步服务器地址' })
    return false
  }
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    setSyncState({ status: 'error', error: '当前设备离线' })
    return false
  }
  if (inFlight) return false

  inFlight = true
  setSyncState({ status: 'syncing', error: null })

  try {
    const response = await fetch(base + '/api/sync', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        code: settings.sync.code,
        since: sync.lastSeq,
        entities: {
          tasks: Object.values(data.tasks),
          lists: Object.values(data.lists),
          filters: Object.values(data.filters),
          habits: Object.values(data.habits),
          focus: Object.values(data.focus)
        }
      })
    })

    if (!response.ok) throw new Error(`服务器返回 ${response.status}`)
    const result = await response.json()
    if (!result?.ok) throw new Error(result?.error || '同步失败')

    mergeRemote(result.entities || {})
    setSyncState({
      status: 'ok',
      lastSeq: Number(result.seq) || 0,
      lastSyncAt: Date.now(),
      error: null
    })
    return true
  } catch (err) {
    const message = err instanceof Error ? err.message : '同步失败'
    setSyncState({ status: 'error', error: message })
    return false
  } finally {
    inFlight = false
  }
}

export const syncSoon = debounce(() => {
  if (!getState().settings.sync.auto) return
  void syncNow()
}, 2500)

export function initSync() {
  onMutate(() => {
    if (getState().settings.sync.auto) syncSoon()
  })
  window.addEventListener('online', () => {
    if (getState().settings.sync.auto) void syncNow()
  })
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && getState().settings.sync.auto) {
      void syncNow()
    }
  })
  window.setTimeout(() => {
    if (getState().settings.sync.auto && syncEnabled()) void syncNow()
  }, 1500)
  window.setInterval(() => {
    if (getState().settings.sync.auto && syncEnabled()) void syncNow()
  }, 120000)
}

export function syncSummary(): string {
  const { sync, settings } = getState()
  if (!settings.sync.url.trim()) return '未开启同步'
  if (sync.status === 'syncing') return '同步中…'
  if (sync.status === 'error') return sync.error || '同步失败'
  if (sync.lastSyncAt) {
    const d = new Date(sync.lastSyncAt)
    return `已同步 ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  }
  return '等待同步'
}
