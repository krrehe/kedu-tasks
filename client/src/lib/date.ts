export const DAY_MS = 86400000

export const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六']

export function startOfDay(ts: number): number {
  const d = new Date(ts)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

export function endOfDay(ts: number): number {
  const d = new Date(ts)
  d.setHours(23, 59, 59, 999)
  return d.getTime()
}

export function addDays(ts: number, days: number): number {
  const d = new Date(ts)
  d.setDate(d.getDate() + days)
  return d.getTime()
}

export function isSameDay(a: number, b: number): boolean {
  return startOfDay(a) === startOfDay(b)
}

export function isToday(ts: number): boolean {
  return isSameDay(ts, Date.now())
}

export function isOverdue(ts: number): boolean {
  return ts < Date.now() && !isToday(ts)
}

export function dayKey(ts: number): string {
  const d = new Date(ts)
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

export function parseDayKey(key: string): number {
  const [y, m, d] = key.split('-').map(Number)
  return new Date(y, (m || 1) - 1, d || 1).getTime()
}

export function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

export function formatTime(ts: number): string {
  const d = new Date(ts)
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`
}

export function formatClock(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60)
  const s = totalSeconds % 60
  return `${pad2(m)}:${pad2(s)}`
}

export function formatMonthDay(ts: number): string {
  const d = new Date(ts)
  return `${d.getMonth() + 1}月${d.getDate()}日`
}

export function formatDate(ts: number): string {
  const d = new Date(ts)
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`
}

export function weekdayLabel(ts: number): string {
  return '周' + WEEKDAYS[new Date(ts).getDay()]
}

/** 今天 / 明天 / 昨天 / 周三 / 11月25日（跨年带年份） */
export function relativeDay(ts: number): string {
  const today = startOfDay(Date.now())
  const target = startOfDay(ts)
  const diff = Math.round((target - today) / DAY_MS)
  if (diff === 0) return '今天'
  if (diff === 1) return '明天'
  if (diff === 2) return '后天'
  if (diff === -1) return '昨天'
  if (diff > 2 && diff < 7) return weekdayLabel(ts)
  const d = new Date(ts)
  const sameYear = d.getFullYear() === new Date().getFullYear()
  return sameYear ? formatMonthDay(ts) : formatDate(ts)
}

export function formatDue(ts: number, allDay: boolean): string {
  if (allDay) return relativeDay(ts)
  return `${relativeDay(ts)} ${formatTime(ts)}`
}

export function formatDateTime(ts: number): string {
  return `${formatMonthDay(ts)} ${formatTime(ts)}`
}

/** 生成月历矩阵（周一开头），固定 6 行 */
export function monthMatrix(year: number, month: number): number[][] {
  const first = new Date(year, month, 1)
  const offset = (first.getDay() + 6) % 7
  const start = addDays(first.getTime(), -offset)
  const weeks: number[][] = []
  for (let w = 0; w < 6; w++) {
    const row: number[] = []
    for (let d = 0; d < 7; d++) row.push(addDays(start, w * 7 + d))
    weeks.push(row)
  }
  return weeks
}

export function startOfWeek(ts: number): number {
  const d = new Date(ts)
  const offset = (d.getDay() + 6) % 7
  return startOfDay(addDays(ts, -offset))
}

export function humanDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} 分钟`
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return m ? `${h} 小时 ${m} 分` : `${h} 小时`
}

export function greeting(): string {
  const h = new Date().getHours()
  if (h < 6) return '夜深了'
  if (h < 11) return '早上好'
  if (h < 14) return '中午好'
  if (h < 18) return '下午好'
  return '晚上好'
}

/** 0 表示准时，其余是提前的分钟数 */
export function formatReminder(minutes: number): string {
  if (minutes <= 0) return '准时提醒'
  if (minutes < 60) return `提前 ${minutes} 分钟`
  if (minutes < 1440) {
    const hours = minutes / 60
    return `提前 ${Number.isInteger(hours) ? hours : hours.toFixed(1)} 小时`
  }
  const days = minutes / 1440
  return `提前 ${Number.isInteger(days) ? days : days.toFixed(1)} 天`
}
