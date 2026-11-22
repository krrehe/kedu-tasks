import { getState } from '../store'
import { toast } from '../actions'
import { dayKey, formatDue } from './date'
import { showNotification } from './notify'
import { isNativeApp } from './pwa'

const FIRED_KEY = 'kedu-fired-reminders'
const MAX_AGE = 30 * 86400000
/** 只补发最近 10 分钟内错过的提醒，避免打开应用时被历史提醒刷屏 */
const GRACE = 10 * 60000

function readFired(): Record<string, number> {
  try {
    const raw = localStorage.getItem(FIRED_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, number>) : {}
  } catch {
    return {}
  }
}

function writeFired(map: Record<string, number>) {
  try {
    localStorage.setItem(FIRED_KEY, JSON.stringify(map))
  } catch {
    /* 忽略存储异常 */
  }
}

export function checkReminders() {
  const now = Date.now()
  const tasks = Object.values(getState().data.tasks)
  const fired = readFired()
  let changed = false

  for (const task of tasks) {
    if (task.deletedAt || task.completed) continue
    if (task.due === null || task.reminder === null || task.reminder === undefined) continue

    const fireAt = task.due - task.reminder * 60000
    // 全天任务的「准时」按当天 09:00 提醒，而不是午夜
    const adjusted = task.allDay ? fireAt + 9 * 3600000 : fireAt
    if (adjusted > now || now - adjusted > GRACE) continue

    const key = `${task.id}:${task.due}:${task.reminder}`
    if (fired[key]) continue

    fired[key] = now
    changed = true
    toast(`提醒：${task.title}`)
    const body = task.allDay ? task.title : `${task.title}\n${formatDue(task.due, false)}`
    void showNotification('任务提醒', body, `task-${task.id}`)
    try {
      if ('vibrate' in navigator) navigator.vibrate(40)
    } catch {
      /* 忽略震动异常 */
    }
  }

  const todayKey = dayKey(now)
  for (const habit of Object.values(getState().data.habits)) {
    if (habit.deletedAt || !habit.reminder) continue
    if (habit.records.includes(todayKey)) continue
    const [hour, minute] = String(habit.reminder).split(':').map(Number)
    if (!Number.isFinite(hour) || !Number.isFinite(minute)) continue
    const fire = new Date(now)
    fire.setHours(hour, minute, 0, 0)
    const fireAt = fire.getTime()
    if (fireAt > now || now - fireAt > GRACE) continue

    const key = `habit:${habit.id}:${todayKey}:${habit.reminder}`
    if (fired[key]) continue

    fired[key] = now
    changed = true
    toast(`习惯提醒：${habit.name}`)
    void showNotification('习惯提醒', `今天别忘了：${habit.name}`, `habit-${habit.id}`)
    try {
      if ('vibrate' in navigator) navigator.vibrate(40)
    } catch {
      /* 忽略震动异常 */
    }
  }

  if (changed) {
    const cutoff = now - MAX_AGE
    for (const key of Object.keys(fired)) {
      if (fired[key] < cutoff) delete fired[key]
    }
    writeFired(fired)
  }
}

export function initReminders() {
  if (isNativeApp()) return
  window.setTimeout(checkReminders, 2500)
  window.setInterval(checkReminders, 30000)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') checkReminders()
  })
}
