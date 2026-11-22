import type { AiAction, AiMessage, ChatMessage, Habit, PlanItem, Task } from '../types'
import { getState } from '../store'
import {
  addHabit,
  addSubtasks,
  addTask,
  deleteTask,
  ensureList,
  toast,
  toggleTask,
  updateHabit,
  updateTask
} from '../actions'
import {
  aiChat,
  buildTaskContext,
  extractJson,
  normalizePriority,
  parseAiDue
} from './ai'
import { dayKey, formatDue } from './date'
import { fuzzyMatch, uid } from './utils'
import { sortedLists } from './selectors'
import { LIST_COLORS } from '../seed'

export interface AssistantResult {
  text: string
  actions: string[]
  plan?: PlanItem[]
  summary?: string
}

export function resolveTask(match: string, pool?: Task[]): Task | null {
  const q = (match || '').trim().toLowerCase()
  if (!q) return null
  const tasks =
    pool ||
    Object.values(getState().data.tasks).filter((t) => !t.deletedAt && !t.completed)
  return (
    tasks.find((t) => t.title.toLowerCase() === q) ||
    tasks.find((t) => t.title.toLowerCase().includes(q)) ||
    tasks.find((t) => q.includes(t.title.toLowerCase())) ||
    tasks.find((t) => fuzzyMatch(q, t.title)) ||
    null
  )
}

function normalizeHabitReminder(value: unknown): string | null {
  const text = typeof value === 'string' ? value.trim() : ''
  const match = text.match(/^(\d{1,2}):(\d{2})$/)
  if (!match) return null
  const hour = Number(match[1])
  const minute = Number(match[2])
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
}

function resolveHabit(match: string, allowFuzzy = true): Habit | null {
  const q = (match || '').trim().toLowerCase()
  if (!q) return null
  const habits = Object.values(getState().data.habits).filter((habit) => !habit.deletedAt)
  const found =
    habits.find((habit) => habit.name.toLowerCase() === q) ||
    habits.find((habit) => habit.name.toLowerCase().includes(q)) ||
    habits.find((habit) => q.includes(habit.name.toLowerCase()))
  if (found) return found
  return allowFuzzy ? habits.find((habit) => fuzzyMatch(q, habit.name)) || null : null
}

function buildSystemPrompt(): string {
  const state = getState()
  const lists = sortedLists(state)
  const today = dayKey(Date.now())
  const habits = Object.values(state.data.habits).filter((habit) => !habit.deletedAt)
  const habitContext = habits.length
    ? habits
        .map(
          (habit) =>
            `${habit.name}（今日${habit.records.includes(today) ? '已' : '未'}打卡，累计${habit.records.length}次${
              habit.reminder ? `，每天${habit.reminder}提醒` : ''
            }）`
        )
        .join('、')
    : '无'
  return [
    '你是「刻度清单」里的 AI 助理。用户用中文与你对话，你可以查看并直接操作用户的真实任务和习惯。',
    buildTaskContext(),
    `现有习惯：${habitContext}`,
    '',
    '只输出 JSON 对象，不要输出任何额外文字，格式：',
    '{"reply":"给用户的简洁回复（中文，最多 60 字）","actions":[]}',
    'actions 支持以下类型：',
    '- {"type":"create_task","title":"任务标题","due":"YYYY-MM-DD HH:mm 或 YYYY-MM-DD 或 null","allDay":true,"priority":0|1|3|5,"listName":"已有清单名","tags":["标签"],"notes":"说明","subtasks":["子任务"],"reminder":0|5|15|30|60|null}',
    '- {"type":"complete_task","match":"任务标题关键词"}',
    '- {"type":"update_task","match":"任务标题关键词","due":"YYYY-MM-DD HH:mm","priority":0|1|3|5,"listName":"清单名","reminder":0|5|15|30|60|null}',
    '- {"type":"delete_task","match":"任务标题关键词"}',
    '- {"type":"add_subtasks","match":"任务标题关键词","subtasks":["子任务"]}',
    '- {"type":"create_habit","name":"习惯名称","color":"#4C6FFF","reminder":"HH:mm 或 null"}',
    '- {"type":"check_habit","match":"习惯名称关键词","date":"YYYY-MM-DD 或 null","done":true}',
    '- {"type":"plan","summary":"整体建议","items":[{"match":"任务标题关键词","time":"09:00","reason":"原因"}]}',
    '规则：',
    `1. 清单只能用这些：${lists.map((l) => l.name).join('、')}；`,
    '2. match 要使用能唯一定位任务或习惯的关键词，不要编造不存在的内容；',
    '3. 用户只是提问时 actions 返回空数组，不要擅自修改数据；',
    '4. 用户说「把今天没做完的移到明天」时，对每个相关任务生成 update_task，due 设为明天；',
    '5. 涉及今天/明天等相对时间时，请结合给定的当前时间换算成具体日期；',
    '6. reminder 是提前多少分钟提醒，用户说「提醒我」用 0，「提前半小时」用 30，取消提醒用 null；',
    '7. 用户想「养成/建立/坚持/每天做某件事」（例如“每天读书 30 分钟”“帮我建立一个早起习惯”）时，必须用 create_habit，不要创建任务；任务是一次性的事，习惯是长期重复的事；',
    '8. 用户说「今天打卡/完成了习惯」时用 check_habit，取消打卡用 done:false；date 省略或 null 表示今天；',
    '9. 习惯名称要简洁，去掉「每天」「我要」「帮我建立」等词；已有相似习惯时不要重复创建；',
    '10. 用户说「每天几点提醒」时，reminder 用 24 小时制 HH:mm（例如早上 8 点用 "08:00"），没有提到用 null。'
  ].join('\n')
}

function summaryForAction(
  action: AiAction,
  result: { task?: Task | null; created?: Task; count?: number; habit?: Habit; done?: boolean }
): string {
  switch (action.type) {
    case 'create_task':
      return `已创建「${result.created?.title || action.title}」${result.created?.due ? ' · ' + formatDue(result.created.due, result.created.allDay) : ''}`
    case 'complete_task':
      return `已完成「${result.task?.title || action.match}」`
    case 'update_task':
      return `已更新「${result.task?.title || action.match}」`
    case 'delete_task':
      return `已删除「${result.task?.title || action.match}」`
    case 'add_subtasks':
      return `已为「${result.task?.title || action.match}」添加 ${result.count || 0} 个子任务`
    case 'create_habit':
      return `已建立习惯「${result.habit?.name || action.name}」${
        result.habit?.reminder ? ` · 每天 ${result.habit.reminder} 提醒` : ''
      }`
    case 'check_habit':
      return `${result.done === false ? '已取消' : '已完成'}「${result.habit?.name || action.match}」打卡`
    case 'plan':
      return `已生成 ${result.count || 0} 项计划`
    default:
      return '已完成操作'
  }
}

export function executeActions(actions: AiAction[]): { notes: string[]; plan?: PlanItem[]; summary?: string } {
  const notes: string[] = []
  let plan: PlanItem[] | undefined
  let summary: string | undefined

  for (const action of actions.slice(0, 8)) {
    if (!action || typeof action !== 'object' || !('type' in action)) continue
    switch (action.type) {
      case 'create_task': {
        const title = String(action.title || '').trim()
        if (!title) continue
        const dueInfo = parseAiDue(action.due)
        const list = action.listName ? ensureList(action.listName) : null
        const created = addTask({
          title,
          listId: list?.id ?? null,
          due: dueInfo.ts,
          allDay: typeof action.allDay === 'boolean' ? action.allDay : dueInfo.allDay,
          priority: normalizePriority(action.priority),
          tags: Array.isArray(action.tags) ? action.tags.map(String) : [],
          notes: typeof action.notes === 'string' ? action.notes : '',
          subtasks: Array.isArray(action.subtasks) ? action.subtasks.map(String) : [],
          reminder: typeof action.reminder === 'number' ? action.reminder : null,
          aiCreated: true
        })
        notes.push(summaryForAction(action, { created }))
        break
      }
      case 'complete_task': {
        const task = resolveTask(action.match)
        if (!task) {
          notes.push(`没找到「${action.match}」`)
          break
        }
        if (!task.completed) toggleTask(task.id)
        notes.push(summaryForAction(action, { task }))
        break
      }
      case 'update_task': {
        const task = resolveTask(action.match)
        if (!task) {
          notes.push(`没找到「${action.match}」`)
          break
        }
        const patch: Partial<Task> = {}
        if ('due' in action && action.due !== undefined) {
          const dueInfo = parseAiDue(action.due)
          patch.due = dueInfo.ts
          patch.allDay = dueInfo.allDay
        }
        if (action.priority !== undefined) patch.priority = normalizePriority(action.priority)
        if (action.reminder !== undefined) patch.reminder = action.reminder
        if (action.listName) {
          const list = ensureList(String(action.listName))
          if (list) patch.listId = list.id
        }
        updateTask(task.id, patch)
        notes.push(summaryForAction(action, { task }))
        break
      }
      case 'delete_task': {
        const task = resolveTask(action.match)
        if (!task) {
          notes.push(`没找到「${action.match}」`)
          break
        }
        deleteTask(task.id)
        notes.push(summaryForAction(action, { task }))
        break
      }
      case 'add_subtasks': {
        const task = resolveTask(action.match)
        if (!task) {
          notes.push(`没找到「${action.match}」`)
          break
        }
        const subtasks = Array.isArray(action.subtasks) ? action.subtasks.map(String).filter(Boolean) : []
        addSubtasks(task.id, subtasks)
        notes.push(summaryForAction(action, { task, count: subtasks.length }))
        break
      }
      case 'create_habit': {
        const rawName = String(action.name || '').trim()
        if (!rawName) continue
        const name = rawName.replace(/^(每天|每日)/, '').trim() || rawName
        const existing = resolveHabit(name, false)
        if (existing) {
          notes.push(`习惯「${existing.name}」已存在`)
          break
        }
        const habits = Object.values(getState().data.habits).filter((habit) => !habit.deletedAt)
        const color = /^#[0-9a-f]{6}$/i.test(String(action.color || ''))
          ? String(action.color)
          : LIST_COLORS[habits.length % LIST_COLORS.length]
        const habit = addHabit(name, color, 1, normalizeHabitReminder(action.reminder))
        if (habit) notes.push(summaryForAction(action, { habit }))
        break
      }
      case 'check_habit': {
        const habit = resolveHabit(action.match)
        if (!habit) {
          notes.push(`没找到习惯「${action.match}」`)
          break
        }
        const rawDate = typeof action.date === 'string' ? action.date.trim().toLowerCase() : ''
        let key = dayKey(Date.now())
        if (rawDate === '昨天' || rawDate === 'yesterday') {
          key = dayKey(Date.now() - 86400000)
        } else if (rawDate === '今天' || rawDate === 'today') {
          key = dayKey(Date.now())
        } else if (/^\d{4}-\d{2}-\d{2}$/.test(rawDate)) {
          key = rawDate
        } else if (rawDate) {
          const parsed = parseAiDue(rawDate)
          if (parsed.ts) key = dayKey(parsed.ts)
        }
        const done = action.done !== false
        const has = habit.records.includes(key)
        if (has === done) {
          notes.push(`「${habit.name}」${done ? '该日期已打卡' : '该日期还没有打卡'}`)
          break
        }
        updateHabit(habit.id, {
          records: done
            ? [...habit.records, key].sort()
            : habit.records.filter((record) => record !== key)
        })
        notes.push(summaryForAction(action, { habit, done }))
        break
      }
      case 'plan': {
        const items: PlanItem[] = []
        for (const raw of action.items || []) {
          const task = raw.taskId
            ? getState().data.tasks[raw.taskId]
            : resolveTask(raw.match || '')
          if (!task || task.deletedAt) continue
          items.push({
            taskId: task.id,
            title: task.title,
            time: typeof raw.time === 'string' ? raw.time : '09:00',
            reason: raw.reason || ''
          })
        }
        plan = items
        summary = action.summary || ''
        notes.push(summaryForAction(action, { count: items.length }))
        break
      }
      default:
        break
    }
  }

  return { notes, plan, summary }
}

export async function sendAssistant(
  text: string,
  history: ChatMessage[],
  signal?: AbortSignal
): Promise<AssistantResult> {
  const messages: AiMessage[] = [{ role: 'system', content: buildSystemPrompt() }]
  for (const msg of history.slice(-8)) {
    if (!msg.text || msg.pending || msg.error) continue
    messages.push({ role: msg.role, content: msg.text })
  }
  messages.push({ role: 'user', content: text })

  const raw = await aiChat(messages, { json: true, temperature: 0.4, signal })
  const data = extractJson<{ reply?: string; actions?: AiAction[] }>(raw)

  if (!data) {
    return { text: raw.trim() || '我没太理解，可以换个说法吗？', actions: [] }
  }

  const executed = executeActions(Array.isArray(data.actions) ? data.actions : [])
  const reply = String(data.reply || '').trim()
  return {
    text: reply || executed.notes.join('；') || '我在这里，有什么可以帮你？',
    actions: executed.notes,
    plan: executed.plan,
    summary: executed.summary
  }
}

export function applyPlan(items: PlanItem[]) {
  let count = 0
  const today = new Date()
  for (const item of items) {
    if (!item.taskId) continue
    const task = getState().data.tasks[item.taskId]
    if (!task || task.deletedAt) continue
    const match = item.time.match(/(\d{1,2}):(\d{2})/)
    if (!match) continue
    const base = task.due ? new Date(task.due) : new Date()
    if (Number.isNaN(base.getTime())) base.setTime(Date.now())
    // 逾期或未安排的任务统一排到今天
    if (!task.due || base.getTime() < new Date().setHours(0, 0, 0, 0)) {
      base.setFullYear(today.getFullYear(), today.getMonth(), today.getDate())
    }
    base.setHours(Number(match[1]), Number(match[2]), 0, 0)
    updateTask(task.id, { due: base.getTime(), allDay: false })
    count++
  }
  if (count) toast(`已把 ${count} 个任务排进日程`, 'success')
  else toast('没有可应用的计划')
}

export function welcomeMessage(): ChatMessage {
  return {
    id: uid('msg_'),
    role: 'assistant',
    text: '你好，我是刻度助手。概览页会汇总今天的任务、习惯和专注；你也可以说「明天下午 3 点和高远过一下方案」，或「帮我建立一个每天阅读 30 分钟的习惯」。',
    actions: []
  }
}
