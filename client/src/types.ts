export type Priority = 0 | 1 | 3 | 5

export type Repeat = 'daily' | 'weekdays' | 'weekly' | 'monthly' | 'yearly'

export interface Subtask {
  id: string
  title: string
  done: boolean
}

export interface Task {
  id: string
  title: string
  notes: string
  listId: string
  due: number | null
  allDay: boolean
  priority: Priority
  tags: string[]
  subtasks: Subtask[]
  repeat: Repeat | null
  /** 提前多少分钟提醒；0 表示准时，null/undefined 表示不提醒 */
  reminder?: number | null
  completed: boolean
  completedAt: number | null
  createdAt: number
  updatedAt: number
  deletedAt: number | null
  order: number
  aiCreated?: boolean
  estimate?: number | null
}

export interface TaskList {
  id: string
  name: string
  color: string
  order: number
  updatedAt: number
  deletedAt: number | null
}

export type FilterDue = 'any' | 'today' | 'week' | 'overdue' | 'none'

export interface SmartFilter {
  id: string
  name: string
  color: string
  due: FilterDue
  priorities: Priority[]
  tag: string
  listId: string | null
  search: string
  includeCompleted: boolean
  order: number
  updatedAt: number
  deletedAt: number | null
}

export interface Habit {
  id: string
  name: string
  color: string
  goal: number
  /** 每日提醒时间，格式 HH:mm；null/undefined 表示不提醒 */
  reminder?: string | null
  records: string[]
  createdAt: number
  updatedAt: number
  deletedAt: number | null
  order: number
}

export interface FocusSession {
  id: string
  taskId: string | null
  minutes: number
  startedAt: number
  updatedAt: number
  deletedAt: number | null
}

export interface AiSettings {
  enabled: boolean
  baseUrl: string
  apiKey: string
  model: string
}

export interface SyncSettings {
  url: string
  code: string
  auto: boolean
}

export type AccentKey = 'blue' | 'violet' | 'green' | 'orange' | 'rose'

export type TaskSort = 'default' | 'due' | 'priority' | 'created'

export interface Settings {
  theme: 'auto' | 'light' | 'dark'
  accent: AccentKey
  taskSort: TaskSort
  ai: AiSettings
  sync: SyncSettings
}

export type View =
  | 'overview'
  | 'today'
  | 'week'
  | 'inbox'
  | 'all'
  | 'board'
  | 'filter'
  | 'completed'
  | 'calendar'
  | 'habits'
  | 'focus'
  | 'stats'
  | 'list'

export type SyncStatus = 'idle' | 'syncing' | 'ok' | 'error'

export interface ToastAction {
  label: string
  type: 'undo-delete'
  taskId: string
}

export interface ToastMessage {
  id: string
  text: string
  tone?: 'default' | 'success' | 'error'
  action?: ToastAction
}

export interface UIState {
  view: View
  listId: string | null
  filterId: string | null
  filterEditorOpen: boolean
  filterEditorId: string | null
  organizeOpen: boolean
  trashOpen: boolean
  selectedTaskId: string | null
  aiOpen: boolean
  settingsOpen: boolean
  searchOpen: boolean
  drawerOpen: boolean
  quickAddOpen: boolean
  quickAddDue: number | null
  quickAddText: string | null
  quickAddListId: string | null
  toast: ToastMessage | null
}

export interface DataState {
  tasks: Record<string, Task>
  lists: Record<string, TaskList>
  filters: Record<string, SmartFilter>
  habits: Record<string, Habit>
  focus: Record<string, FocusSession>
}

export interface SyncState {
  lastSeq: number
  lastSyncAt: number | null
  status: SyncStatus
  error: string | null
}

export interface AppState {
  data: DataState
  ui: UIState
  settings: Settings
  sync: SyncState
}

export type TimerMode = 'focus' | 'short' | 'long'

export interface AiMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  text: string
  actions?: string[]
  plan?: PlanItem[]
  summary?: string
  pending?: boolean
  error?: boolean
  retryText?: string
}

export interface PlanItem {
  taskId: string | null
  title: string
  time: string
  reason: string
  done?: boolean
}

export type AiAction =
  | {
      type: 'create_task'
      title: string
      due?: string | null
      allDay?: boolean
      priority?: Priority
      listName?: string
      tags?: string[]
      notes?: string
      subtasks?: string[]
      reminder?: number | null
      match?: string
    }
  | { type: 'complete_task'; match: string }
  | {
      type: 'update_task'
      match: string
      due?: string | null
      priority?: Priority
      listName?: string
      reminder?: number | null
    }
  | { type: 'delete_task'; match: string }
  | { type: 'add_subtasks'; match: string; subtasks: string[] }
  | { type: 'create_habit'; name: string; color?: string; reminder?: string | null }
  | { type: 'check_habit'; match: string; date?: string | null; done?: boolean }
  | { type: 'plan'; summary?: string; items?: { match?: string; taskId?: string; time?: string; reason?: string }[] }
