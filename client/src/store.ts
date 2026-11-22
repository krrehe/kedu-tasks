import { useSyncExternalStore } from 'react'
import type {
  AccentKey,
  AppState,
  DataState,
  FocusSession,
  Habit,
  Settings,
  SmartFilter,
  SyncState,
  Task,
  TaskList,
  UIState
} from './types'
import { createSeedData, INBOX_ID } from './seed'
import { idbGet, idbSet } from './db'
import { isNativeApp } from './lib/pwa'

const SNAPSHOT_KEY = 'kedu-snapshot-v1'

interface Persisted {
  version?: number
  data?: DataState
  settings?: Partial<Settings>
  sync?: { lastSeq?: number; lastSyncAt?: number | null }
}

function defaultSyncUrl(): string {
  // 安卓 App 的页面来自本地 WebView，必须手动填写电脑端地址
  if (isNativeApp()) return ''
  if (typeof location === 'undefined') return 'http://localhost:8787'
  // Capacitor 内置页面的 origin 是 http://localhost（无端口）
  if (location.hostname === 'localhost' && !location.port) return ''
  if (location.port === '5173' || location.port === '4173') {
    return `${location.protocol}//${location.hostname}:8787`
  }
  return location.origin
}

export const ACCENTS: Record<
  AccentKey,
  {
    main: string
    strong: string
    soft: string
    darkMain: string
    darkStrong: string
    darkSoft: string
  }
> = {
  blue: {
    main: '#4C6FFF',
    strong: '#3B5BF5',
    soft: '#EDF1FF',
    darkMain: '#6C8AFF',
    darkStrong: '#7F99FF',
    darkSoft: '#1C2540'
  },
  violet: {
    main: '#8B5CF6',
    strong: '#7C3AED',
    soft: '#F3EEFF',
    darkMain: '#A78BFA',
    darkStrong: '#C4B5FD',
    darkSoft: '#261D3D'
  },
  green: {
    main: '#16A34A',
    strong: '#15803D',
    soft: '#E9F8EF',
    darkMain: '#4ADE80',
    darkStrong: '#86EFAC',
    darkSoft: '#13291D'
  },
  orange: {
    main: '#EA7A1B',
    strong: '#C2620A',
    soft: '#FFF3E7',
    darkMain: '#FB923C',
    darkStrong: '#FDBA74',
    darkSoft: '#2E1F12'
  },
  rose: {
    main: '#E5484D',
    strong: '#C93A3F',
    soft: '#FFEDEE',
    darkMain: '#FB7185',
    darkStrong: '#FDA4AF',
    darkSoft: '#31171B'
  }
}

export const defaultSettings: Settings = {
  theme: 'auto',
  accent: 'blue',
  taskSort: 'default',
  ai: {
    enabled: true,
    baseUrl: 'https://api.deepseek.com/v1',
    apiKey: '',
    model: 'deepseek-chat'
  },
  sync: {
    url: defaultSyncUrl(),
    code: 'kedu',
    auto: true
  }
}

const initialUI: UIState = {
  view: 'overview',
  listId: null,
  filterId: null,
  filterEditorOpen: false,
  filterEditorId: null,
  organizeOpen: false,
  trashOpen: false,
  selectedTaskId: null,
  aiOpen: false,
  settingsOpen: false,
  searchOpen: false,
  drawerOpen: false,
  quickAddOpen: false,
  quickAddDue: null,
  quickAddText: null,
  quickAddListId: null,
  toast: null
}

const emptyData: DataState = { tasks: {}, lists: {}, filters: {}, habits: {}, focus: {} }

let state: AppState = {
  data: emptyData,
  ui: initialUI,
  settings: defaultSettings,
  sync: { lastSeq: 0, lastSyncAt: null, status: 'idle', error: null }
}

const listeners = new Set<() => void>()
const mutateListeners = new Set<() => void>()

export function getState(): AppState {
  return state
}

export function subscribe(fn: () => void): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

export function useApp(): AppState {
  return useSyncExternalStore(subscribe, getState, getState)
}

export function emit() {
  for (const fn of listeners) fn()
}

/** 数据变更（用于触发自动同步），远端合并不会触发 */
export function onMutate(fn: () => void): () => void {
  mutateListeners.add(fn)
  return () => mutateListeners.delete(fn)
}

function notifyMutate() {
  for (const fn of mutateListeners) fn()
}

let persistTimer: number | undefined

function persist() {
  if (typeof window === 'undefined') return
  if (persistTimer) window.clearTimeout(persistTimer)
  persistTimer = window.setTimeout(persistNow, 300)
}

export function persistNow() {
  const snapshot: Persisted = {
    version: 1,
    data: state.data,
    settings: state.settings,
    sync: { lastSeq: state.sync.lastSeq, lastSyncAt: state.sync.lastSyncAt }
  }
  void idbSet(SNAPSHOT_KEY, snapshot)
}

function normalizeData(raw: Partial<DataState> | undefined): DataState {
  const now = Date.now()
  const lists = { ...(raw?.lists || {}) } as Record<string, TaskList>
  if (!lists[INBOX_ID]) {
    lists[INBOX_ID] = {
      id: INBOX_ID,
      name: '收件箱',
      color: '#8B95A7',
      order: 0,
      updatedAt: now,
      deletedAt: null
    }
  }
  return {
    tasks: raw?.tasks || {},
    lists,
    filters: raw?.filters || {},
    habits: raw?.habits || {},
    focus: raw?.focus || {}
  }
}

function mergeSettings(raw: Partial<Settings> | undefined): Settings {
  return {
    theme: raw?.theme === 'light' || raw?.theme === 'dark' ? raw.theme : 'auto',
    accent:
      raw?.accent && raw.accent in ACCENTS ? (raw.accent as AccentKey) : 'blue',
    taskSort:
      raw?.taskSort === 'due' || raw?.taskSort === 'priority' || raw?.taskSort === 'created'
        ? raw.taskSort
        : 'default',
    ai: { ...defaultSettings.ai, ...(raw?.ai || {}) },
    sync: { ...defaultSettings.sync, ...(raw?.sync || {}) }
  }
}

export function applyTheme() {
  if (typeof document === 'undefined') return
  const mode = state.settings.theme
  const dark =
    mode === 'dark' ||
    (mode === 'auto' && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches)
  const root = document.documentElement
  root.dataset.theme = dark ? 'dark' : 'light'
  root.style.colorScheme = dark ? 'dark' : 'light'

  const accent = ACCENTS[state.settings.accent] || ACCENTS.blue
  root.style.setProperty('--accent', dark ? accent.darkMain : accent.main)
  root.style.setProperty('--accent-strong', dark ? accent.darkStrong : accent.strong)
  root.style.setProperty('--accent-soft', dark ? accent.darkSoft : accent.soft)

  const meta = document.querySelector('meta[name="theme-color"]')
  if (meta) meta.setAttribute('content', dark ? '#121419' : accent.main)
}

export async function hydrate(): Promise<void> {
  let snap: Persisted | null = null
  try {
    snap = await idbGet<Persisted>(SNAPSHOT_KEY)
  } catch {
    snap = null
  }

  state = {
    ...state,
    data: snap?.data ? normalizeData(snap.data) : createSeedData(),
    settings: mergeSettings(snap?.settings),
    sync: {
      ...state.sync,
      lastSeq: snap?.sync?.lastSeq || 0,
      lastSyncAt: snap?.sync?.lastSyncAt || null
    }
  }

  applyTheme()
  emit()
  if (!snap?.data) persistNow()

  // 跟随系统深浅色切换
  try {
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    media.addEventListener('change', () => {
      if (getState().settings.theme === 'auto') applyTheme()
    })
  } catch {
    /* 旧浏览器忽略 */
  }
}

export function setUI(patch: Partial<UIState>) {
  state = { ...state, ui: { ...state.ui, ...patch } }
  emit()
}

export function updateSettings(patch: Partial<Settings>) {
  state = { ...state, settings: { ...state.settings, ...patch } }
  applyTheme()
  persist()
  emit()
}

export function setSyncState(patch: Partial<SyncState>) {
  state = { ...state, sync: { ...state.sync, ...patch } }
  persist()
  emit()
}

export function mutate(fn: (data: DataState) => void) {
  const next: DataState = {
    tasks: { ...state.data.tasks },
    lists: { ...state.data.lists },
    filters: { ...state.data.filters },
    habits: { ...state.data.habits },
    focus: { ...state.data.focus }
  }
  fn(next)
  state = { ...state, data: next }
  persist()
  emit()
  notifyMutate()
}

export function replaceData(data: DataState) {
  state = { ...state, data: normalizeData(data) }
  persist()
  emit()
  notifyMutate()
}

type RemoteEntities = Partial<{
  tasks: Task[]
  lists: TaskList[]
  filters: SmartFilter[]
  habits: Habit[]
  focus: FocusSession[]
}>

function mergeMap<T extends { id: string; updatedAt: number }>(
  local: Record<string, T>,
  remote: T[] | undefined
): { map: Record<string, T>; changed: boolean } {
  if (!remote || !remote.length) return { map: local, changed: false }
  let changed = false
  const map = { ...local }
  for (const item of remote) {
    if (!item || typeof item.id !== 'string' || typeof item.updatedAt !== 'number') continue
    const cur = map[item.id]
    if (!cur || item.updatedAt > cur.updatedAt) {
      map[item.id] = item
      changed = true
    }
  }
  return { map, changed }
}

export function mergeRemote(entities: RemoteEntities) {
  const tasks = mergeMap(state.data.tasks, entities.tasks)
  const lists = mergeMap(state.data.lists, entities.lists)
  const filters = mergeMap(state.data.filters, entities.filters)
  const habits = mergeMap(state.data.habits, entities.habits)
  const focus = mergeMap(state.data.focus, entities.focus)

  if (!tasks.changed && !lists.changed && !filters.changed && !habits.changed && !focus.changed) return

  state = {
    ...state,
    data: {
      tasks: tasks.map,
      lists: lists.map,
      filters: filters.map,
      habits: habits.map,
      focus: focus.map
    }
  }
  persist()
  emit()
}
