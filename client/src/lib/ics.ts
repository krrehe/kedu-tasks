import { getState } from '../store'
import { addDays, dayKey } from './date'
import { download } from './utils'

function pad(value: number): string {
  return String(value).padStart(2, '0')
}

function dateStamp(ts: number): string {
  const date = new Date(ts)
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}`
}

function dateTimeStamp(ts: number): string {
  const date = new Date(ts)
  return `${dateStamp(ts)}T${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`
}

function utcStamp(ts: number = Date.now()): string {
  return new Date(ts).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
}

function escapeIcs(text: string): string {
  return String(text)
    .replace(/\\/g, '\\\\')
    .replace(/\n/g, '\\n')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;')
}

export function buildCalendarIcs(): string {
  const state = getState()
  const lists = state.data.lists
  const tasks = Object.values(state.data.tasks)
    .filter((task) => !task.deletedAt && task.due !== null)
    .sort((a, b) => (a.due as number) - (b.due as number))

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Kedu Tasks//TickDone//CN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:刻度清单',
    `X-WR-TIMEZONE:${Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Shanghai'}`
  ]

  const stamp = utcStamp()

  for (const task of tasks) {
    const due = task.due as number
    const listName = lists[task.listId]?.name || '收件箱'
    lines.push('BEGIN:VEVENT')
    lines.push(`UID:${task.id}@kedu.local`)
    lines.push(`DTSTAMP:${stamp}`)
    if (task.allDay) {
      lines.push(`DTSTART;VALUE=DATE:${dateStamp(due)}`)
      lines.push(`DTEND;VALUE=DATE:${dateStamp(addDays(due, 1))}`)
    } else {
      lines.push(`DTSTART:${dateTimeStamp(due)}`)
      lines.push(`DTEND:${dateTimeStamp(due + 30 * 60000)}`)
    }
    lines.push(`SUMMARY:${escapeIcs(task.title)}`)
    const description = [task.notes, `清单：${listName}`].filter(Boolean).join('\n')
    if (description) lines.push(`DESCRIPTION:${escapeIcs(description)}`)
    if (task.priority) {
      lines.push(`PRIORITY:${task.priority === 5 ? 1 : task.priority === 3 ? 5 : 9}`)
    }
    if (task.completed) lines.push('STATUS:COMPLETED')
    lines.push('END:VEVENT')
  }

  lines.push('END:VCALENDAR')
  return lines.join('\r\n')
}

export function exportCalendar() {
  download(
    `kedu-tasks-${dayKey(Date.now())}.ics`,
    buildCalendarIcs(),
    'text/calendar;charset=utf-8'
  )
}
