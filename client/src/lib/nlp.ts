import type { Priority, Repeat, TaskList } from '../types'
import { addDays, startOfDay } from './date'
import { escapeRegExp } from './utils'

export interface ParsedInput {
  title: string
  due: number | null
  allDay: boolean
  priority: Priority
  tags: string[]
  listId: string | null
  listName: string | null
  repeat: Repeat | null
  reminder: number | null
}

const WEEKDAY_MAP: Record<string, number> = {
  一: 1,
  二: 2,
  三: 3,
  四: 4,
  五: 5,
  六: 6,
  日: 0,
  天: 0
}

const CN_NUM: Record<string, number> = {
  一: 1,
  二: 2,
  两: 2,
  三: 3,
  四: 4,
  五: 5,
  六: 6,
  七: 7,
  八: 8,
  九: 9,
  十: 10
}

function cnNumber(text: string): number | null {
  if (/^\d+$/.test(text)) return Number(text)
  if (text === '十') return 10
  if (text.startsWith('十')) return 10 + (CN_NUM[text[1]] || 0)
  if (text.endsWith('十')) return (CN_NUM[text[0]] || 0) * 10
  if (text.includes('十')) {
    const [a, b] = text.split('十')
    return (CN_NUM[a] || 0) * 10 + (CN_NUM[b] || 0)
  }
  return CN_NUM[text] ?? null
}

/**
 * 离线自然语言解析：从「明天下午 3 点 产品评审 高优先级 #设计」这类输入里
 * 抽取出标题、日期、优先级、标签、清单与重复规则。
 */
export function parseNatural(input: string, lists: TaskList[], now: Date = new Date()): ParsedInput {
  const original = input.trim()
  let rest = ' ' + original + ' '
  const tags: string[] = []
  let priority: Priority = 0
  let listId: string | null = null
  let listName: string | null = null
  let repeat: Repeat | null = null
  let dateTs: number | null = null
  let hour: number | null = null
  let minute = 0
  let period = ''

  const drop = (re: RegExp) => {
    rest = rest.replace(re, ' ')
  }

  // 1. 标签
  rest = rest.replace(/#([^\s#，,。.!！?？]+)/g, (_match, tag: string) => {
    if (tag) tags.push(tag)
    return ' '
  })

  // 2. 清单
  for (const list of lists) {
    if (!list.name || list.id === 'inbox' || list.deletedAt) continue
    const name = escapeRegExp(list.name)
    const patterns = [
      new RegExp(`(?:放到|加入|放进|归到|移到|移至|在)\\s*${name}\\s*(?:清单|列表)?`),
      new RegExp(`${name}\\s*(?:清单|列表)`)
    ]
    for (const re of patterns) {
      if (re.test(rest)) {
        rest = rest.replace(re, ' ')
        listId = list.id
        listName = list.name
        break
      }
    }
    if (listId) break
  }

  // 3. 重复规则
  const repeatRules: Array<[RegExp, Repeat]> = [
    [/(每个?工作日|工作日每天|每个工作日)/, 'weekdays'],
    [/(每天|每日|天天|every day|daily)/i, 'daily'],
    [/(每周(?!一|二|三|四|五|六|日|天)|每星期|每礼拜|weekly)/i, 'weekly'],
    [/(每月|每个月|monthly)/i, 'monthly'],
    [/(每年|每一年|yearly)/i, 'yearly']
  ]
  for (const [re, value] of repeatRules) {
    if (re.test(rest)) {
      repeat = value
      drop(re)
      break
    }
  }

  // 4. 优先级
  const setPriority = (re: RegExp, value: Priority) => {
    if (priority !== 0) return
    if (re.test(rest)) {
      priority = value
      drop(re)
    }
  }
  setPriority(/(不重要|不紧急|低优先级|优先级低|low priority|\bp3\b)/i, 1)
  setPriority(/(高优先级|优先级高|重要且紧急|非常紧急|紧急|重要|high priority|\bp1\b|(?:!!+|！{2,}))/i, 5)
  setPriority(/(中优先级|优先级中|medium priority|\bp2\b)/i, 3)

  // 5. 提醒：提前 30 分钟 / 提前半小时 / 提醒我
  let reminder: number | null = null
  const remindRelative = rest.match(/提前\s*(半|一|两|\d{1,3})\s*(分钟|小时|天)\s*(?:提醒)?/)
  if (remindRelative) {
    const raw = remindRelative[1]
    const count = raw === '半' ? 0.5 : cnNumber(raw) ?? 0
    const unit = remindRelative[2]
    reminder = Math.round(count * (unit === '小时' ? 60 : unit === '天' ? 1440 : 1))
    rest = rest.replace(remindRelative[0], ' ')
  } else if (/(提醒我|提醒一下)/.test(rest)) {
    reminder = 0
    rest = rest.replace(/(提醒我|提醒一下)/g, ' ')
  }

  const today = startOfDay(now.getTime())

  // 5. 日期：ISO → 相对日 → 周几 → 月日 → N 天后
  const iso = rest.match(/(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/)
  if (iso) {
    dateTs = new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3])).getTime()
    drop(new RegExp(escapeRegExp(iso[0])))
  }

  if (dateTs === null) {
    if (/大后天/.test(rest)) {
      dateTs = addDays(today, 3)
      rest = rest.replace(/大后天/g, ' ')
    } else if (/后天/.test(rest)) {
      dateTs = addDays(today, 2)
      rest = rest.replace(/后天/g, ' ')
    } else if (/(明天|明日|tomorrow)/i.test(rest)) {
      dateTs = addDays(today, 1)
      drop(/(明天|明日|tomorrow)/i)
    } else if (/(今天|今日|today)/i.test(rest)) {
      dateTs = today
      drop(/(今天|今日|today)/i)
    }
  }

  if (dateTs === null) {
    const nextWeek = rest.match(/下(?:个)?(?:周|星期|礼拜)([一二三四五六日天])/)
    if (nextWeek && WEEKDAY_MAP[nextWeek[1]] !== undefined) {
      const target = WEEKDAY_MAP[nextWeek[1]]
      const dow = new Date(today).getDay()
      const offsetFromMonday = (dow + 6) % 7
      const nextMonday = addDays(today, 7 - offsetFromMonday)
      dateTs = addDays(nextMonday, (target + 6) % 7)
      rest = rest.replace(nextWeek[0], ' ')
    }
  }

  if (dateTs === null) {
    const thisWeek = rest.match(/(?:(?:这|本)(?:周|星期|礼拜)|(?:周|星期|礼拜))([一二三四五六日天])/)
    if (thisWeek && WEEKDAY_MAP[thisWeek[1]] !== undefined) {
      const target = WEEKDAY_MAP[thisWeek[1]]
      const dow = new Date(today).getDay()
      dateTs = addDays(today, (target - dow + 7) % 7)
      rest = rest.replace(thisWeek[0], ' ')
    }
  }

  if (dateTs === null) {
    const monthDay = rest.match(/(?:(\d{4})年)?(\d{1,2})月(\d{1,2})[日号]?/)
    if (monthDay) {
      const explicitYear = monthDay[1] ? Number(monthDay[1]) : null
      let year = explicitYear ?? now.getFullYear()
      let ts = new Date(year, Number(monthDay[2]) - 1, Number(monthDay[3])).getTime()
      if (!explicitYear && ts < today) ts = new Date(year + 1, Number(monthDay[2]) - 1, Number(monthDay[3])).getTime()
      dateTs = ts
      rest = rest.replace(monthDay[0], ' ')
    }
  }

  if (dateTs === null) {
    const nextMonth = rest.match(/下个?月(\d{1,2})[日号]?/)
    if (nextMonth) {
      const d = new Date(now.getFullYear(), now.getMonth() + 1, Number(nextMonth[1]))
      dateTs = d.getTime()
      rest = rest.replace(nextMonth[0], ' ')
    }
  }

  if (dateTs === null) {
    const inDays = rest.match(/(\d{1,3})\s*天(?:之)?后/) || rest.match(/in\s+(\d{1,3})\s*days?/i)
    if (inDays) {
      dateTs = addDays(today, Number(inDays[1]))
      rest = rest.replace(inDays[0], ' ')
    }
  }

  // 6. 时间
  const periodMatch = rest.match(/(凌晨|清晨|早晨|早上|上午|中午|下午|傍晚|晚上|夜里|晚间)/)
  if (periodMatch) {
    period = periodMatch[1]
    rest = rest.replace(periodMatch[0], ' ')
  }

  const colon = rest.match(/(\d{1,2})\s*[:：]\s*(\d{2})/)
  const ampm = rest.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)/i)
  const point = rest.match(/(\d{1,2})\s*[点时]\s*(?:(半)|(\d{1,2})\s*分?)?/)

  if (colon) {
    hour = Number(colon[1])
    minute = Number(colon[2])
    rest = rest.replace(colon[0], ' ')
  } else if (ampm) {
    hour = Number(ampm[1])
    minute = ampm[2] ? Number(ampm[2]) : 0
    if (ampm[3].toLowerCase() === 'pm' && hour < 12) hour += 12
    if (ampm[3].toLowerCase() === 'am' && hour === 12) hour = 0
    rest = rest.replace(ampm[0], ' ')
  } else if (point) {
    hour = Number(point[1])
    minute = point[2] ? 30 : point[3] ? Number(point[3]) : 0
    rest = rest.replace(point[0], ' ')
  }

  if (hour !== null) {
    if (['下午', '傍晚', '晚上', '夜里', '晚间'].includes(period) && hour < 12) hour += 12
    if (period === '中午' && hour < 11) hour += 12
    if (period === '凌晨' && hour === 12) hour = 0
    hour = ((hour % 24) + 24) % 24
  }

  let due: number | null = null
  let allDay = true

  if (dateTs !== null && hour !== null) {
    const d = new Date(dateTs)
    d.setHours(hour, minute, 0, 0)
    due = d.getTime()
    allDay = false
  } else if (dateTs !== null) {
    due = startOfDay(dateTs)
    allDay = true
  } else if (hour !== null) {
    const d = new Date()
    d.setHours(hour, minute, 0, 0)
    if (d.getTime() < now.getTime() - 60000) d.setDate(d.getDate() + 1)
    due = d.getTime()
    allDay = false
  }

  // 7. 清理标题
  let title = rest
    .replace(/\s+/g, ' ')
    .replace(/^[\s,，。;；:：、\-—~～]+|[\s,，。;；:：、\-—~～]+$/g, '')
    .replace(/^(帮我|请|麻烦|记得|提醒我|添加任务|添加|新增|创建|安排|记一下)/, '')
    .replace(/(提醒我|吧)$/, '')
    .replace(/^[在于是]/, '')
    .replace(/\s+/g, ' ')
    .trim()

  if (!title) title = original

  return { title, due, allDay, priority, tags, listId, listName, repeat, reminder }
}
