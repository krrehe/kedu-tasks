import { pad2 } from './date'

/** 给模型看的紧凑时间格式：2026-11-21 或 2026-11-21 15:30 */
export function formatDueIso(ts: number, allDay = false): string {
  const d = new Date(ts)
  const date = `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
  return allDay ? date : `${date} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`
}

export function percent(value: number, total: number): number {
  if (!total) return 0
  return Math.round((value / total) * 100)
}
