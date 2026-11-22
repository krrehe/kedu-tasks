import type { LocalNotificationSchema } from '@capacitor/local-notifications'
import { getState, onMutate, subscribe } from '../store'
import { navigate, openTask } from '../actions'
import { dayKey, formatDue } from './date'
import { isNativeApp } from './pwa'

const CHANNEL_ID = 'kedu-reminders'
const CHANNEL_NAME = '任务提醒'

let initialized = false
let syncing = false
let resyncRequested = false
let debounceTimer: number | undefined

function hashId(key: string): number {
  let hash = 2166136261
  for (let i = 0; i < key.length; i++) {
    hash ^= key.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return ((hash >>> 0) % 2147483000) + 1
}

async function getPlugin() {
  const { LocalNotifications } = await import('@capacitor/local-notifications')
  return LocalNotifications
}

export async function nativeCheckPermission(): Promise<boolean> {
  try {
    const plugin = await getPlugin()
    const permission = await plugin.checkPermissions()
    return permission.display === 'granted'
  } catch {
    return false
  }
}

export async function nativeRequestPermission(): Promise<boolean> {
  try {
    const plugin = await getPlugin()
    let permission = await plugin.checkPermissions()
    if (permission.display !== 'granted') {
      permission = await plugin.requestPermissions()
    }
    if (permission.display === 'granted') {
      await scheduleReminders()
      return true
    }
    return false
  } catch {
    return false
  }
}

/** 原生端的即时通知：专注结束、测试通知等 */
export async function nativeNotify(title: string, body: string): Promise<boolean> {
  try {
    const plugin = await getPlugin()
    await plugin.schedule({
      notifications: [
        {
          id: hashId(`immediate:${Date.now()}`),
          title,
          body,
          channelId: CHANNEL_ID,
          schedule: { at: new Date(Date.now() + 800) }
        }
      ]
    })
    return true
  } catch {
    return false
  }
}

async function scheduleReminders() {
  if (!isNativeApp()) return
  if (syncing) {
    resyncRequested = true
    return
  }
  syncing = true
  try {
    const plugin = await getPlugin()
    const permission = await plugin.checkPermissions()
    if (permission.display !== 'granted') return

    const pending = await plugin.getPending()
    const owned = pending.notifications.filter((item) => {
      const kind = (item as unknown as { extra?: { kind?: string } }).extra?.kind
      return kind === 'reminder' || kind === 'habit-reminder'
    })
    if (owned.length) {
      await plugin.cancel({ notifications: owned.map((item) => ({ id: item.id })) })
    }

    const now = Date.now()
    const horizon = now + 30 * 86400000
    const taskNotifications = Object.values(getState().data.tasks)
      .filter(
        (task) =>
          !task.deletedAt &&
          !task.completed &&
          task.due !== null &&
          task.reminder !== null &&
          task.reminder !== undefined
      )
      .map((task) => {
        const base = task.allDay ? (task.due as number) + 9 * 3600000 : (task.due as number)
        return { task, fireAt: base - (task.reminder as number) * 60000 }
      })
      .filter(({ fireAt }) => fireAt > now + 800 && fireAt <= horizon)
      .sort((a, b) => a.fireAt - b.fireAt)
      .slice(0, 50)
      .map(({ task, fireAt }) => ({
        id: hashId(`${task.id}:${task.due}:${task.reminder}`),
        title: '任务提醒',
        body: task.allDay
          ? task.title
          : `${task.title}\n${formatDue(task.due as number, false)}`,
        channelId: CHANNEL_ID,
        schedule: { at: new Date(fireAt), allowWhileIdle: true },
        extra: { kind: 'reminder', taskId: task.id }
      }))

    const habitNotifications: LocalNotificationSchema[] = []
    for (const habit of Object.values(getState().data.habits)) {
      if (habit.deletedAt || !habit.reminder) continue
      const [hour, minute] = String(habit.reminder).split(':').map(Number)
      if (!Number.isFinite(hour) || !Number.isFinite(minute)) continue
      // 逐天排期最近 7 天，已经打卡的日期自动跳过；应用再次打开或数据变化时会重新计算
      for (let offset = 0; offset < 7; offset++) {
        const fireAt = new Date()
        fireAt.setDate(fireAt.getDate() + offset)
        fireAt.setHours(hour, minute, 0, 0)
        if (fireAt.getTime() <= now + 800) continue
        const key = dayKey(fireAt.getTime())
        if (habit.records.includes(key)) continue
        habitNotifications.push({
          id: hashId(`habit:${habit.id}:${key}:${habit.reminder}`),
          title: '习惯提醒',
          body: `今天别忘了：${habit.name}`,
          channelId: CHANNEL_ID,
          schedule: { at: fireAt, allowWhileIdle: true },
          extra: { kind: 'habit-reminder', habitId: habit.id }
        })
      }
    }

    const notifications = [...taskNotifications, ...habitNotifications].slice(0, 200)
    if (notifications.length) {
      await plugin.schedule({ notifications })
    }
  } catch (err) {
    console.warn('[notifications] 同步失败', err)
  } finally {
    syncing = false
    if (resyncRequested) {
      resyncRequested = false
      window.setTimeout(() => void scheduleReminders(), 800)
    }
  }
}

function scheduleSyncSoon() {
  if (debounceTimer) window.clearTimeout(debounceTimer)
  debounceTimer = window.setTimeout(() => void scheduleReminders(), 2500)
}

export async function initNativeNotifications() {
  if (!isNativeApp() || initialized) return
  initialized = true

  try {
    const plugin = await getPlugin()
    await plugin.createChannel({
      id: CHANNEL_ID,
      name: CHANNEL_NAME,
      description: '任务到期、习惯打卡和专注结束提醒',
      importance: 4,
      visibility: 1,
      vibration: true
    })
    await plugin.addListener('localNotificationActionPerformed', (event) => {
      const extra = event.notification.extra as Record<string, unknown> | undefined
      if (typeof extra?.taskId === 'string') openTask(extra.taskId)
      else if (typeof extra?.habitId === 'string') navigate('habits')
    })
  } catch (err) {
    console.warn('[notifications] 初始化失败', err)
  }

  await scheduleReminders()

  onMutate(scheduleSyncSoon)

  let lastData = getState().data
  subscribe(() => {
    const current = getState().data
    if (current !== lastData) {
      lastData = current
      scheduleSyncSoon()
    }
  })

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') scheduleSyncSoon()
  })
}

export async function syncNativeNotifications() {
  await scheduleReminders()
}
