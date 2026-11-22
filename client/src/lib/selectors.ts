import type { AppState, Priority, SmartFilter, Task, TaskList, View } from '../types'
import { addDays, endOfDay, isSameDay, startOfDay } from './date'

export const PRIORITY_COLOR: Record<Priority, string> = {
  0: '#C4CAD6',
  1: '#4C6FFF',
  3: '#F5A524',
  5: '#F04438'
}

export const PRIORITY_LABEL: Record<Priority, string> = {
  0: '无优先级',
  1: '低优先级',
  3: '中优先级',
  5: '高优先级'
}

export function sortedLists(state: AppState): TaskList[] {
  return Object.values(state.data.lists)
    .filter((l) => !l.deletedAt)
    .sort((a, b) => a.order - b.order)
}

export function sortedFilters(state: AppState): SmartFilter[] {
  return Object.values(state.data.filters)
    .filter((filter) => !filter.deletedAt)
    .sort((a, b) => a.order - b.order)
}

/** 判断任务是否符合智能筛选规则 */
export function matchesFilter(task: Task, filter: SmartFilter, now: number = Date.now()): boolean {
  if (task.deletedAt) return false

  const todayStart = startOfDay(now)
  const todayEnd = endOfDay(now)
  const weekEnd = endOfDay(addDays(now, 7))

  if (filter.due === 'today') {
    if (task.due === null || task.due < todayStart || task.due > todayEnd) return false
  } else if (filter.due === 'week') {
    if (task.due === null || task.due < todayStart || task.due > weekEnd) return false
  } else if (filter.due === 'overdue') {
    if (task.due === null || task.due >= todayStart) return false
  } else if (filter.due === 'none') {
    if (task.due !== null) return false
  }

  if (filter.priorities.length && !filter.priorities.includes(task.priority)) return false
  if (filter.tag && !task.tags.includes(filter.tag)) return false
  if (filter.listId && task.listId !== filter.listId) return false

  if (filter.search.trim()) {
    const haystack = [task.title, task.notes, task.tags.join(' ')].join(' ').toLowerCase()
    if (!haystack.includes(filter.search.trim().toLowerCase())) return false
  }

  return true
}

export function filterTaskCount(state: AppState, filter: SmartFilter): number {
  return allTasks(state).filter((task) => !task.completed && matchesFilter(task, filter)).length
}

export function listMap(state: AppState): Record<string, TaskList> {
  const map: Record<string, TaskList> = {}
  for (const l of sortedLists(state)) map[l.id] = l
  return map
}

export function isListId(state: AppState, id: string | null | undefined): id is string {
  return !!id && !!state.data.lists[id] && !state.data.lists[id].deletedAt
}

export function sortByPlan(a: Task, b: Task): number {
  const ad = a.due ?? Number.MAX_SAFE_INTEGER
  const bd = b.due ?? Number.MAX_SAFE_INTEGER
  if (ad !== bd) return ad - bd
  if (a.priority !== b.priority) return b.priority - a.priority
  return a.order - b.order
}

export function sortByCompleted(a: Task, b: Task): number {
  return (b.completedAt || 0) - (a.completedAt || 0)
}

export function allTasks(state: AppState): Task[] {
  return Object.values(state.data.tasks).filter((t) => !t.deletedAt)
}

export function counts(state: AppState) {
  const tasks = allTasks(state)
  const todayStart = startOfDay(Date.now())
  const todayEnd = endOfDay(Date.now())
  const active = tasks.filter((t) => !t.completed)
  return {
    today: active.filter((t) => t.due !== null && t.due <= todayEnd).length,
    overdue: active.filter((t) => t.due !== null && t.due < todayStart).length,
    week: active.filter((t) => t.due !== null && t.due <= endOfDay(addDays(Date.now(), 6))).length,
    inbox: active.filter((t) => t.listId === 'inbox').length,
    all: active.length,
    completed: tasks.filter((t) => t.completed).length,
    byList: (listId: string) => active.filter((t) => t.listId === listId).length
  }
}

export interface TaskGroup {
  key: string
  label: string
  tasks: Task[]
  tone?: 'danger'
}

export interface ViewContent {
  groups: TaskGroup[]
  emptyTitle: string
  emptyHint: string
}

const EMPTY_HINTS: Record<string, { emptyTitle: string; emptyHint: string }> = {
  today: { emptyTitle: '今天很清爽', emptyHint: '点击 + 或在上方输入一句话，就能添加任务' },
  week: { emptyTitle: '最近 7 天没有安排', emptyHint: '给未来几天的任务排个期吧' },
  inbox: { emptyTitle: '收件箱空了', emptyHint: '想到什么就先丢进来，稍后再整理' },
  all: { emptyTitle: '还没有任务', emptyHint: '用一句话描述你的任务，AI 会帮你解析时间' },
  list: { emptyTitle: '这个清单还是空的', emptyHint: '把相关的任务集中放在这里' },
  board: { emptyTitle: '看板还没有内容', emptyHint: '创建任务后，它们会按清单出现在对应列' },
  filter: { emptyTitle: '没有符合条件的任务', emptyHint: '可以调整筛选规则，或先添加几个任务' },
  completed: { emptyTitle: '还没有完成记录', emptyHint: '完成的任务会出现在这里' }
}

export function getViewContent(state: AppState): ViewContent {
  const { view, listId, filterId } = state.ui
  const tasks = allTasks(state)
  const active = tasks.filter((t) => !t.completed)
  const todayStart = startOfDay(Date.now())
  const todayEnd = endOfDay(Date.now())
  const weekEnd = endOfDay(addDays(Date.now(), 6))
  const tomorrowEnd = endOfDay(addDays(Date.now(), 1))

  if (view === 'completed') {
    return {
      groups: [{ key: 'done', label: `已完成 · ${tasks.filter((t) => t.completed).length}`, tasks: tasks.filter((t) => t.completed).sort(sortByCompleted) }],
      ...EMPTY_HINTS.completed
    }
  }

  if (view === 'today') {
    const due = active.filter((t) => t.due !== null && t.due <= todayEnd)
    const overdue = due.filter((t) => (t.due as number) < todayStart).sort(sortByPlan)
    const today = due.filter((t) => (t.due as number) >= todayStart).sort(sortByPlan)
    const doneToday = tasks.filter((t) => t.completed && t.completedAt && isSameDay(t.completedAt, Date.now())).sort(sortByCompleted)
    const groups: TaskGroup[] = [
      { key: 'overdue', label: `已逾期 · ${overdue.length}`, tasks: overdue, tone: 'danger' },
      { key: 'today', label: `今天 · ${today.length}`, tasks: today },
      { key: 'done', label: `今天已完成 · ${doneToday.length}`, tasks: doneToday }
    ]
    return {
      groups: groups.filter((g) => g.tasks.length > 0),
      ...EMPTY_HINTS.today
    }
  }

  if (view === 'week') {
    const due = active.filter((t) => t.due !== null && t.due <= weekEnd).sort(sortByPlan)
    const groups: TaskGroup[] = [
      { key: 'overdue', label: '已逾期', tasks: due.filter((t) => (t.due as number) < todayStart), tone: 'danger' },
      { key: 'today', label: '今天', tasks: due.filter((t) => (t.due as number) >= todayStart && (t.due as number) <= todayEnd) },
      { key: 'tomorrow', label: '明天', tasks: due.filter((t) => (t.due as number) > todayEnd && (t.due as number) <= tomorrowEnd) },
      { key: 'later', label: '未来几天', tasks: due.filter((t) => (t.due as number) > tomorrowEnd) }
    ]
    return { groups: groups.filter((g) => g.tasks.length > 0), ...EMPTY_HINTS.week }
  }

  if (view === 'filter') {
    const filter = filterId ? state.data.filters[filterId] : null
    if (!filter || filter.deletedAt) {
      return {
        groups: [],
        emptyTitle: '筛选器不存在',
        emptyHint: '它可能已在其他设备上被删除'
      }
    }
    const scoped = tasks.filter((task) => matchesFilter(task, filter))
    const todo = scoped.filter((task) => !task.completed).sort(sortByPlan)
    const done = filter.includeCompleted
      ? scoped.filter((task) => task.completed).sort(sortByCompleted).slice(0, 50)
      : []
    return {
      groups: [
        { key: 'todo', label: `待办 · ${todo.length}`, tasks: todo },
        { key: 'done', label: '已完成', tasks: done }
      ].filter((group) => group.tasks.length > 0),
      ...EMPTY_HINTS.filter
    }
  }

  if (view === 'inbox' || view === 'list') {
    const targetId = view === 'inbox' ? 'inbox' : listId
    const scoped = tasks.filter((t) => t.listId === targetId)
    const todo = scoped.filter((t) => !t.completed).sort(sortByPlan)
    const done = scoped.filter((t) => t.completed).sort(sortByCompleted).slice(0, 30)
    return {
      groups: [
        { key: 'todo', label: `待办 · ${todo.length}`, tasks: todo },
        { key: 'done', label: '已完成', tasks: done }
      ].filter((g) => g.tasks.length > 0),
      ...(view === 'inbox' ? EMPTY_HINTS.inbox : EMPTY_HINTS.list)
    }
  }

  if (view === 'all') {
    const sorted = active.slice().sort(sortByPlan)
    const groups: TaskGroup[] = [
      { key: 'overdue', label: '已逾期', tasks: sorted.filter((t) => t.due !== null && (t.due as number) < todayStart), tone: 'danger' },
      { key: 'today', label: '今天', tasks: sorted.filter((t) => t.due !== null && (t.due as number) >= todayStart && (t.due as number) <= todayEnd) },
      { key: 'upcoming', label: '即将到来', tasks: sorted.filter((t) => t.due !== null && (t.due as number) > todayEnd && (t.due as number) <= weekEnd) },
      { key: 'later', label: '以后', tasks: sorted.filter((t) => t.due !== null && (t.due as number) > weekEnd) },
      { key: 'none', label: '未安排日期', tasks: sorted.filter((t) => t.due === null) }
    ]
    return { groups: groups.filter((g) => g.tasks.length > 0), ...EMPTY_HINTS.all }
  }

  return { groups: [], ...EMPTY_HINTS.today }
}

export function viewTitle(state: AppState): { title: string; subtitle: string } {
  const { view, listId, filterId } = state.ui
  const c = counts(state)
  const today = new Date()
  const dateText = `${today.getMonth() + 1}月${today.getDate()}日 周${'日一二三四五六'[today.getDay()]}`

  switch (view) {
    case 'overview':
      return {
        title: '概览',
        subtitle: `${dateText} · 今天 ${c.today} 个待办${c.overdue ? `，${c.overdue} 个已逾期` : ''}`
      }
    case 'today':
      return { title: '今天', subtitle: `${dateText} · ${c.today} 个待办${c.overdue ? `，${c.overdue} 个已逾期` : ''}` }
    case 'week':
      return { title: '最近 7 天', subtitle: `${c.week} 个待办` }
    case 'inbox':
      return { title: '收件箱', subtitle: `${c.inbox} 个待整理` }
    case 'all':
      return { title: '所有任务', subtitle: `${c.all} 个未完成 · ${c.completed} 个已完成` }
    case 'completed':
      return { title: '已完成', subtitle: `${c.completed} 个任务` }
    case 'list': {
      const list = listId ? state.data.lists[listId] : null
      return { title: list?.name || '清单', subtitle: `${c.byList(listId || 'inbox')} 个待办` }
    }
    case 'filter': {
      const filter = filterId ? state.data.filters[filterId] : null
      const count = filter ? filterTaskCount(state, filter) : 0
      return { title: filter?.name || '智能筛选', subtitle: `${count} 个任务 · 智能筛选` }
    }
    case 'board':
      return { title: '看板', subtitle: `${Object.values(state.data.lists).filter((l) => !l.deletedAt).length} 个清单 · ${c.all} 个待办` }
    case 'calendar':
      return { title: '日历', subtitle: '按日期查看安排' }
    case 'habits':
      return { title: '习惯', subtitle: '每天一点点，长期看得见' }
    case 'focus':
      return { title: '专注', subtitle: '一次只做一件事' }
    case 'stats':
      return { title: '统计', subtitle: '看看最近的节奏' }
    default:
      return { title: '今天', subtitle: dateText }
  }
}

export function searchTasks(state: AppState, query: string): Task[] {
  const q = query.trim()
  if (!q) return []
  const lists = listMap(state)
  const lower = q.toLowerCase()
  return allTasks(state)
    .filter((t) => {
      const haystack = [t.title, t.notes, t.tags.join(' '), lists[t.listId]?.name || ''].join(' ').toLowerCase()
      return haystack.includes(lower)
    })
    .sort((a, b) => {
      if (a.completed !== b.completed) return a.completed ? 1 : -1
      return sortByPlan(a, b)
    })
    .slice(0, 60)
}

export function viewLabel(view: View): string {
  const map: Record<View, string> = {
    overview: '概览',
    today: '今天',
    week: '最近 7 天',
    inbox: '收件箱',
    all: '所有任务',
    board: '看板',
    filter: '智能筛选',
    completed: '已完成',
    calendar: '日历',
    habits: '习惯',
    focus: '专注',
    stats: '统计',
    list: '清单'
  }
  return map[view]
}
