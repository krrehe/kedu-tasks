import type { DataState, FocusSession, Habit, SmartFilter, Task, TaskList } from './types'
import { addDays, dayKey } from './lib/date'

export const INBOX_ID = 'inbox'

/** 示例数据使用较早的时间戳，避免新设备上的示例覆盖其他设备真实的删除记录 */
const DEMO_TS = new Date(2024, 0, 1).getTime()

export const LIST_COLORS = [
  '#4C6FFF',
  '#22C55E',
  '#F59E0B',
  '#EC4899',
  '#8B5CF6',
  '#06B6D4',
  '#EF4444',
  '#84CC16',
  '#F97316',
  '#64748B'
]

function at(dayOffset: number, hour = 9, minute = 0): number {
  const d = new Date()
  d.setDate(d.getDate() + dayOffset)
  d.setHours(hour, minute, 0, 0)
  return d.getTime()
}

export function createSeedData(): DataState {
  const now = Date.now()
  const list = (id: string, name: string, color: string, order: number): TaskList => ({
    id,
    name,
    color,
    order,
    updatedAt: DEMO_TS,
    deletedAt: null
  })

  const lists: TaskList[] = [
    list(INBOX_ID, '收件箱', '#8B95A7', 0),
    list('work', '工作', '#4C6FFF', 1),
    list('life', '生活', '#22C55E', 2),
    list('learn', '学习', '#A855F7', 3)
  ]

  const filters: SmartFilter[] = [
    {
      id: 'filter_week_focus',
      name: '本周重点',
      color: '#F59E0B',
      due: 'week',
      priorities: [5, 3],
      tag: '',
      listId: null,
      search: '',
      includeCompleted: false,
      order: 1,
      updatedAt: DEMO_TS,
      deletedAt: null
    },
    {
      id: 'filter_unscheduled',
      name: '待安排',
      color: '#8B5CF6',
      due: 'none',
      priorities: [],
      tag: '',
      listId: null,
      search: '',
      includeCompleted: false,
      order: 2,
      updatedAt: DEMO_TS,
      deletedAt: null
    }
  ]

  let order = 1000
  const task = (input: Partial<Task> & { title: string; listId: string }): Task => {
    order += 10
    return {
      id: 'seed_' + order,
      title: input.title,
      notes: input.notes || '',
      listId: input.listId,
      due: input.due ?? null,
      allDay: input.allDay ?? false,
      priority: input.priority ?? 0,
      tags: input.tags || [],
      subtasks: input.subtasks || [],
      repeat: input.repeat ?? null,
      completed: input.completed ?? false,
      completedAt: input.completedAt ?? null,
      createdAt: input.createdAt ?? now,
      updatedAt: DEMO_TS,
      deletedAt: null,
      order,
      aiCreated: input.aiCreated,
      estimate: input.estimate ?? null
    }
  }

  const tasks: Task[] = [
    task({
      title: '整理产品评审会议纪要',
      listId: 'work',
      due: at(0, 15, 0),
      priority: 3,
      tags: ['会议'],
      notes: '把各模块的反馈归类，标出需要本周内解决的风险点。',
      subtasks: [
        { id: 'st1', title: '汇总各模块反馈', done: true },
        { id: 'st2', title: '梳理待办与负责人', done: false }
      ],
      aiCreated: true
    }),
    task({
      title: '回复设计稿的评审意见',
      listId: 'work',
      due: at(0, 18, 0),
      priority: 5,
      tags: ['设计'],
      notes: '重点确认新手引导流程和空状态插画。'
    }),
    task({
      title: '跑步 5 公里',
      listId: 'life',
      due: at(0, 7, 30),
      allDay: false,
      priority: 1
    }),
    task({
      title: '缴纳本月水电费',
      listId: 'life',
      due: at(-1, 20, 0),
      priority: 3
    }),
    task({
      title: '阅读《深度工作》第 3 章',
      listId: 'learn',
      due: at(1, 21, 0),
      priority: 3,
      tags: ['阅读'],
      notes: '记录 3 条可以立刻用在日常工作中的方法。'
    }),
    task({
      title: '规划下季度 OKR',
      listId: 'work',
      due: at(3, 10, 0),
      priority: 5,
      tags: ['规划'],
      subtasks: [
        { id: 'st3', title: '梳理上季度完成情况', done: false },
        { id: 'st4', title: '对齐团队目标', done: false },
        { id: 'st5', title: '输出初稿并约评审', done: false }
      ],
      estimate: 90
    }),
    task({
      title: '给家里打个电话',
      listId: 'life',
      due: at(0, 20, 30),
      priority: 1,
      repeat: 'weekly'
    }),
    task({
      title: '整理相册并备份到移动硬盘',
      listId: 'life',
      priority: 0,
      subtasks: [
        { id: 'st6', title: '删除重复照片', done: false },
        { id: 'st7', title: '按年份归档', done: false }
      ]
    }),
    task({
      title: '完成周报',
      listId: 'work',
      due: at(0, 10, 0),
      priority: 3,
      completed: true,
      completedAt: at(0, 11, 20)
    }),
    task({
      title: '买咖啡豆',
      listId: 'life',
      priority: 0,
      completed: true,
      completedAt: at(-1, 19, 10)
    })
  ]

  const habits: Habit[] = [
    {
      id: 'habit_wake',
      name: '早起',
      color: '#F59E0B',
      goal: 1,
      reminder: null,
      records: [dayKey(addDays(now, -1)), dayKey(addDays(now, -2)), dayKey(addDays(now, -4))],
      createdAt: now,
      updatedAt: DEMO_TS,
      deletedAt: null,
      order: 1
    },
    {
      id: 'habit_read',
      name: '阅读 30 分钟',
      color: '#8B5CF6',
      goal: 1,
      reminder: null,
      records: [dayKey(addDays(now, -1)), dayKey(addDays(now, -3))],
      createdAt: now,
      updatedAt: DEMO_TS,
      deletedAt: null,
      order: 2
    },
    {
      id: 'habit_move',
      name: '运动 20 分钟',
      color: '#22C55E',
      goal: 1,
      reminder: null,
      records: [dayKey(addDays(now, -2))],
      createdAt: now,
      updatedAt: DEMO_TS,
      deletedAt: null,
      order: 3
    }
  ]

  const focus: FocusSession[] = [
    {
      id: 'focus_seed_1',
      taskId: 'seed_1010',
      minutes: 25,
      startedAt: at(0, 9, 10),
      updatedAt: DEMO_TS,
      deletedAt: null
    },
    {
      id: 'focus_seed_2',
      taskId: 'seed_1010',
      minutes: 25,
      startedAt: at(-1, 16, 0),
      updatedAt: DEMO_TS,
      deletedAt: null
    },
    {
      id: 'focus_seed_3',
      taskId: null,
      minutes: 45,
      startedAt: at(-2, 20, 0),
      updatedAt: DEMO_TS,
      deletedAt: null
    }
  ]

  const taskMap: Record<string, Task> = {}
  for (const t of tasks) taskMap[t.id] = t
  const listMap: Record<string, TaskList> = {}
  for (const l of lists) listMap[l.id] = l
  const filterMap: Record<string, SmartFilter> = {}
  for (const f of filters) filterMap[f.id] = f
  const habitMap: Record<string, Habit> = {}
  for (const h of habits) habitMap[h.id] = h
  const focusMap: Record<string, FocusSession> = {}
  for (const f of focus) focusMap[f.id] = f

  return { tasks: taskMap, lists: listMap, filters: filterMap, habits: habitMap, focus: focusMap }
}
