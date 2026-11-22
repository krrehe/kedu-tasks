import type {
  AiSettings,
  DataState,
  FocusSession,
  Habit,
  Priority,
  Repeat,
  SmartFilter,
  Subtask,
  SyncSettings,
  Task,
  TaskList,
  ToastAction,
  View
} from './types'
import { getState, mutate, replaceData, setUI, updateSettings } from './store'
import { INBOX_ID, LIST_COLORS, createSeedData } from './seed'
import { dayKey } from './lib/date'
import { download, uid } from './lib/utils'

let toastTimer: number | undefined

export function toast(text: string, tone: 'default' | 'success' | 'error' = 'default', action?: ToastAction) {
  setUI({ toast: { id: uid('toast_'), text, tone, action } })
  if (toastTimer) window.clearTimeout(toastTimer)
  const duration = action ? 5200 : tone === 'error' ? 4200 : 2400
  toastTimer = window.setTimeout(() => setUI({ toast: null }), duration)
}

export function navigate(view: View, listId: string | null = null) {
  setUI({
    view,
    listId,
    filterId: null,
    drawerOpen: false,
    selectedTaskId: null,
    searchOpen: false
  })
  window.scrollTo?.({ top: 0 })
}

export function openFilter(id: string) {
  setUI({
    view: 'filter',
    filterId: id,
    listId: null,
    drawerOpen: false,
    selectedTaskId: null,
    searchOpen: false
  })
  window.scrollTo?.({ top: 0 })
}

export function openTask(id: string | null) {
  setUI({ selectedTaskId: id })
}

export function requestQuickAdd(due: number | null = null, listId: string | null = null) {
  setUI({
    quickAddOpen: true,
    quickAddDue: due,
    quickAddText: null,
    quickAddListId: listId,
    drawerOpen: false
  })
}

export interface NewTaskInput {
  title: string
  listId?: string | null
  due?: number | null
  allDay?: boolean
  priority?: Priority
  tags?: string[]
  notes?: string
  subtasks?: string[] | Subtask[]
  repeat?: Repeat | null
  reminder?: number | null
  aiCreated?: boolean
  estimate?: number | null
}

function normalizeSubtasks(input: NewTaskInput['subtasks']): Subtask[] {
  if (!input) return []
  return input
    .map((item) =>
      typeof item === 'string'
        ? { id: uid('st_'), title: item.trim(), done: false }
        : { ...item, title: item.title.trim() }
    )
    .filter((s) => s.title)
}

export function addTask(input: NewTaskInput): Task {
  const now = Date.now()
  const lists = getState().data.lists
  const listId = input.listId && lists[input.listId] && !lists[input.listId].deletedAt ? input.listId : INBOX_ID
  const due = input.due ?? null
  const task: Task = {
    id: uid('t_'),
    title: input.title.trim() || '未命名任务',
    notes: input.notes?.trim() || '',
    listId,
    due,
    allDay: input.allDay ?? due === null,
    priority: input.priority ?? 0,
    tags: Array.from(new Set((input.tags || []).map((t) => t.trim()).filter(Boolean))).slice(0, 8),
    subtasks: normalizeSubtasks(input.subtasks),
    repeat: input.repeat ?? null,
    reminder: due !== null ? input.reminder ?? null : null,
    completed: false,
    completedAt: null,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    order: now,
    aiCreated: input.aiCreated,
    estimate: input.estimate ?? null
  }
  mutate((data) => {
    data.tasks[task.id] = task
  })
  return task
}

export function updateTask(id: string, patch: Partial<Task>) {
  const task = getState().data.tasks[id]
  if (!task) return
  mutate((data) => {
    data.tasks[id] = { ...task, ...patch, id, updatedAt: Date.now() }
  })
}

export function nextRepeatDue(due: number, repeat: Repeat): number {
  const d = new Date(due)
  switch (repeat) {
    case 'daily':
      d.setDate(d.getDate() + 1)
      break
    case 'weekdays':
      do {
        d.setDate(d.getDate() + 1)
      } while (d.getDay() === 0 || d.getDay() === 6)
      break
    case 'weekly':
      d.setDate(d.getDate() + 7)
      break
    case 'monthly':
      d.setMonth(d.getMonth() + 1)
      break
    case 'yearly':
      d.setFullYear(d.getFullYear() + 1)
      break
  }
  return d.getTime()
}

export function toggleTask(id: string) {
  const task = getState().data.tasks[id]
  if (!task) return

  if (task.completed) {
    updateTask(id, { completed: false, completedAt: null })
    return
  }

  updateTask(id, { completed: true, completedAt: Date.now() })

  if (task.repeat) {
    addTask({
      title: task.title,
      listId: task.listId,
      due: nextRepeatDue(task.due ?? Date.now(), task.repeat),
      allDay: task.allDay,
      priority: task.priority,
      tags: task.tags,
      notes: task.notes,
      subtasks: task.subtasks.map((s) => s.title),
      repeat: task.repeat,
      reminder: task.reminder ?? null,
      estimate: task.estimate
    })
    toast('已完成，下次任务已自动创建', 'success')
  }
}

export function clearCompletedTasks(): number {
  const completed = Object.values(getState().data.tasks).filter(
    (task) => !task.deletedAt && task.completed
  )
  if (!completed.length) {
    toast('没有可清理的已完成任务')
    return 0
  }
  const now = Date.now()
  mutate((data) => {
    for (const task of completed) {
      data.tasks[task.id] = { ...task, deletedAt: now, updatedAt: now }
    }
  })
  toast(`已清理 ${completed.length} 个已完成任务`, 'success')
  return completed.length
}

export function deleteTask(id: string) {
  const task = getState().data.tasks[id]
  if (!task) return
  const now = Date.now()
  mutate((data) => {
    data.tasks[id] = { ...task, deletedAt: now, updatedAt: now }
  })
  if (getState().ui.selectedTaskId === id) setUI({ selectedTaskId: null })
  toast('任务已删除', 'default', { label: '撤销', type: 'undo-delete', taskId: id })
}

export function restoreTask(id: string) {
  const task = getState().data.tasks[id]
  if (!task) return
  const list = getState().data.lists[task.listId]
  updateTask(id, {
    deletedAt: null,
    ...(list && !list.deletedAt ? {} : { listId: INBOX_ID })
  })
  setUI({ toast: null })
  toast('任务已恢复', 'success')
}

export function restoreHabit(id: string) {
  const habit = getState().data.habits[id]
  if (!habit) return
  updateHabit(id, { deletedAt: null })
  toast('习惯已恢复', 'success')
}

export function addSubtask(taskId: string, title: string) {
  const task = getState().data.tasks[taskId]
  const clean = title.trim()
  if (!task || !clean) return
  updateTask(taskId, { subtasks: [...task.subtasks, { id: uid('st_'), title: clean, done: false }] })
}

export function toggleSubtask(taskId: string, subId: string) {
  const task = getState().data.tasks[taskId]
  if (!task) return
  updateTask(taskId, {
    subtasks: task.subtasks.map((s) => (s.id === subId ? { ...s, done: !s.done } : s))
  })
}

export function deleteSubtask(taskId: string, subId: string) {
  const task = getState().data.tasks[taskId]
  if (!task) return
  updateTask(taskId, { subtasks: task.subtasks.filter((s) => s.id !== subId) })
}

export function addSubtasks(taskId: string, titles: string[]) {
  const task = getState().data.tasks[taskId]
  if (!task) return
  const existing = new Set(task.subtasks.map((s) => s.title))
  const fresh = titles
    .map((t) => t.trim())
    .filter((t) => t && !existing.has(t))
    .map((title) => ({ id: uid('st_'), title, done: false }))
  if (!fresh.length) return
  updateTask(taskId, { subtasks: [...task.subtasks, ...fresh] })
}

export function addList(name: string, color: string): TaskList | null {
  const clean = name.trim()
  if (!clean) return null
  const exists = Object.values(getState().data.lists).some((l) => !l.deletedAt && l.name === clean)
  if (exists) {
    toast('已有同名清单了', 'error')
    return null
  }
  const now = Date.now()
  const list: TaskList = {
    id: uid('l_'),
    name: clean,
    color,
    order: now,
    updatedAt: now,
    deletedAt: null
  }
  mutate((data) => {
    data.lists[list.id] = list
  })
  return list
}

export function updateList(id: string, patch: Partial<TaskList>) {
  const list = getState().data.lists[id]
  if (!list) return
  mutate((data) => {
    data.lists[id] = { ...list, ...patch, id, updatedAt: Date.now() }
  })
}

export function deleteList(id: string) {
  if (id === INBOX_ID) return
  const now = Date.now()
  mutate((data) => {
    const list = data.lists[id]
    if (list) data.lists[id] = { ...list, deletedAt: now, updatedAt: now }
    for (const task of Object.values(data.tasks)) {
      if (task.listId === id && !task.deletedAt) {
        data.tasks[task.id] = { ...task, deletedAt: now, updatedAt: now }
      }
    }
  })
  const ui = getState().ui
  setUI({
    selectedTaskId: null,
    ...(ui.view === 'list' && ui.listId === id ? { view: 'today', listId: null } : {})
  })
  toast('清单及其任务已删除')
}

export function ensureList(name: string): TaskList | null {
  const lists = Object.values(getState().data.lists).filter((l) => !l.deletedAt)
  const found = lists.find((l) => l.name === name)
  if (found) return found
  const color = LIST_COLORS[lists.length % LIST_COLORS.length]
  return addList(name, color)
}

export function addFilter(input: Partial<SmartFilter> = {}): SmartFilter {
  const now = Date.now()
  const filter: SmartFilter = {
    id: uid('flt_'),
    name: input.name?.trim() || '新筛选',
    color: input.color || LIST_COLORS[0],
    due: input.due || 'any',
    priorities: input.priorities || [],
    tag: input.tag || '',
    listId: input.listId || null,
    search: input.search || '',
    includeCompleted: input.includeCompleted ?? false,
    order: now,
    updatedAt: now,
    deletedAt: null
  }
  mutate((data) => {
    data.filters[filter.id] = filter
  })
  return filter
}

export function updateFilter(id: string, patch: Partial<SmartFilter>) {
  const filter = getState().data.filters[id]
  if (!filter) return
  mutate((data) => {
    data.filters[id] = { ...filter, ...patch, id, updatedAt: Date.now() }
  })
}

export function deleteFilter(id: string) {
  const filter = getState().data.filters[id]
  if (!filter) return
  const now = Date.now()
  mutate((data) => {
    data.filters[id] = { ...filter, deletedAt: now, updatedAt: now }
  })
  const ui = getState().ui
  if (ui.view === 'filter' && ui.filterId === id) navigate('today')
  if (ui.filterEditorOpen && ui.filterEditorId === id) {
    setUI({ filterEditorOpen: false, filterEditorId: null })
  }
  toast('筛选器已删除')
}

export function addHabit(
  name: string,
  color: string,
  goal = 1,
  reminder: string | null = null
): Habit | null {
  const clean = name.trim()
  if (!clean) return null
  const now = Date.now()
  const habit: Habit = {
    id: uid('h_'),
    name: clean,
    color,
    goal,
    reminder,
    records: [],
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    order: now
  }
  mutate((data) => {
    data.habits[habit.id] = habit
  })
  return habit
}

export function updateHabit(id: string, patch: Partial<Habit>) {
  const habit = getState().data.habits[id]
  if (!habit) return
  mutate((data) => {
    data.habits[id] = { ...habit, ...patch, id, updatedAt: Date.now() }
  })
}

export function toggleHabitDay(id: string, key: string = dayKey(Date.now())) {
  const habit = getState().data.habits[id]
  if (!habit) return
  const has = habit.records.includes(key)
  updateHabit(id, {
    records: has ? habit.records.filter((r) => r !== key) : [...habit.records, key].sort()
  })
}

export function deleteHabit(id: string) {
  const habit = getState().data.habits[id]
  if (!habit) return
  const now = Date.now()
  mutate((data) => {
    data.habits[id] = { ...habit, deletedAt: now, updatedAt: now }
  })
  toast('习惯已删除')
}

export function addFocusSession(minutes: number, taskId: string | null, startedAt = Date.now()) {
  if (minutes <= 0) return
  const now = Date.now()
  const session: FocusSession = {
    id: uid('f_'),
    taskId,
    minutes: Math.round(minutes),
    startedAt,
    updatedAt: now,
    deletedAt: null
  }
  mutate((data) => {
    data.focus[session.id] = session
  })
}

export function updateAiSettings(patch: Partial<AiSettings>) {
  const current = getState().settings.ai
  updateSettings({ ai: { ...current, ...patch } })
}

export function updateSyncSettings(patch: Partial<SyncSettings>) {
  const current = getState().settings.sync
  updateSettings({ sync: { ...current, ...patch } })
}

export function setTheme(theme: 'auto' | 'light' | 'dark') {
  updateSettings({ theme })
}

export function exportData() {
  const data = getState().data
  const payload = { app: 'kedu-tasks', version: 1, exportedAt: new Date().toISOString(), data }
  download(`kedu-backup-${dayKey(Date.now())}.json`, JSON.stringify(payload, null, 2))
  toast('已导出备份文件', 'success')
}

export async function importDataFile(file: File): Promise<boolean> {
  try {
    const text = await file.text()
    const raw = JSON.parse(text)
    const data: DataState | undefined = raw?.data ?? raw
    if (!data || typeof data !== 'object' || !data.tasks || !data.lists) {
      throw new Error('文件格式不正确')
    }
    replaceData({
      tasks: data.tasks || {},
      lists: data.lists || {},
      filters: data.filters || {},
      habits: data.habits || {},
      focus: data.focus || {}
    })
    toast('数据已导入', 'success')
    return true
  } catch (err) {
    toast(`导入失败：${(err as Error).message}`, 'error')
    return false
  }
}

export function resetTasks() {
  const now = Date.now()
  const lists = { ...getState().data.lists }
  replaceData({
    tasks: {},
    lists,
    filters: { ...getState().data.filters },
    habits: {},
    focus: {}
  })
  mutate((data) => {
    data.lists[INBOX_ID] = data.lists[INBOX_ID] || {
      id: INBOX_ID,
      name: '收件箱',
      color: '#8B95A7',
      order: 0,
      updatedAt: now,
      deletedAt: null
    }
  })
  toast('已清空任务数据')
}

export function restoreDemoData() {
  const data = createSeedData()
  const now = Date.now()
  for (const item of Object.values(data.tasks)) item.updatedAt = now
  for (const item of Object.values(data.lists)) item.updatedAt = now
  for (const item of Object.values(data.habits)) item.updatedAt = now
  for (const item of Object.values(data.focus)) item.updatedAt = now
  replaceData(data)
  toast('已恢复示例数据', 'success')
}
