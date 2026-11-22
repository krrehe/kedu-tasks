import { getState } from '../store'
import type { Task } from '../types'
import { addDays, dayKey, isSameDay, startOfDay, WEEKDAYS } from './date'
import { formatDueIso } from './format'
import { aiChatStream, aiConfigured } from './ai'

export type ReviewPeriod = 'day' | 'week'

export interface ReviewResult {
  text: string
  source: 'ai' | 'local'
  error?: string
}

function listName(listId: string): string {
  return getState().data.lists[listId]?.name || '收件箱'
}

function activeTasks(): Task[] {
  return Object.values(getState().data.tasks)
    .filter((task) => !task.deletedAt && !task.completed)
    .sort((a, b) => {
      const ad = a.due ?? Number.MAX_SAFE_INTEGER
      const bd = b.due ?? Number.MAX_SAFE_INTEGER
      return ad - bd
    })
}

function taskLine(task: Task, withList = true): string {
  const parts = [task.title]
  if (withList) parts.push(`清单:${listName(task.listId)}`)
  if (task.due !== null) parts.push(`截止:${formatDueIso(task.due, task.allDay)}`)
  if (task.priority) parts.push(`优先级:${task.priority === 5 ? '高' : task.priority === 3 ? '中' : '低'}`)
  return parts.join('，')
}

export function buildReviewContext(period: ReviewPeriod): string {
  const state = getState()
  const tasks = Object.values(state.data.tasks).filter((task) => !task.deletedAt)
  const focus = Object.values(state.data.focus).filter((entry) => !entry.deletedAt)
  const habits = Object.values(state.data.habits).filter((habit) => !habit.deletedAt)
  const now = Date.now()
  const todayStart = startOfDay(now)
  const nowDate = new Date(now)

  if (period === 'day') {
    const doneToday = tasks.filter(
      (task) => task.completed && task.completedAt !== null && isSameDay(task.completedAt, now)
    )
    const dueToday = tasks.filter(
      (task) =>
        !task.completed && task.due !== null && task.due >= todayStart && task.due < todayStart + 86400000
    )
    const overdue = tasks.filter(
      (task) => !task.completed && task.due !== null && task.due < todayStart
    )
    const focusMinutes = focus
      .filter((entry) => isSameDay(entry.startedAt, now))
      .reduce((sum, entry) => sum + entry.minutes, 0)
    const checkedHabits = habits.filter((habit) => habit.records.includes(dayKey(now)))

    const lines = [
      `时间：${nowDate.getFullYear()}-${String(nowDate.getMonth() + 1).padStart(2, '0')}-${String(nowDate.getDate()).padStart(2, '0')} ${WEEKDAYS[nowDate.getDay()]} ${nowDate.getHours()}:${String(nowDate.getMinutes()).padStart(2, '0')}`,
      `概览：完成 ${doneToday.length} 个，今日待办 ${dueToday.length} 个，逾期 ${overdue.length} 个，专注 ${focusMinutes} 分钟，习惯打卡 ${checkedHabits.length}/${habits.length}`,
      '今日完成：',
      doneToday.length
        ? doneToday.slice(0, 10).map((task) => `· ${taskLine(task)}`).join('\n')
        : '· 无',
      '今日待办：',
      dueToday.length ? dueToday.slice(0, 10).map((task) => `· ${taskLine(task)}`).join('\n') : '· 无',
      '已逾期：',
      overdue.length ? overdue.slice(0, 8).map((task) => `· ${taskLine(task)}`).join('\n') : '· 无',
      `专注时段：${focus.filter((entry) => isSameDay(entry.startedAt, now)).length} 段，共 ${focusMinutes} 分钟`,
      `习惯：${habits.length ? habits.map((habit) => `${habit.name}${habit.records.includes(dayKey(now)) ? '已打卡' : '未打卡'}`).join('；') : '无'}`
    ]
    return lines.join('\n')
  }

  const days = Array.from({ length: 7 }, (_, index) => addDays(todayStart, index - 6))
  const doneThisWeek = tasks.filter(
    (task) => task.completedAt !== null && task.completedAt >= days[0]
  )
  const perDay = days.map((day) => ({
    label: `${new Date(day).getMonth() + 1}/${new Date(day).getDate()} ${WEEKDAYS[new Date(day).getDay()]}`,
    count: doneThisWeek.filter((task) => isSameDay(task.completedAt as number, day)).length
  }))
  const focusMinutes = focus
    .filter((entry) => entry.startedAt >= days[0])
    .reduce((sum, entry) => sum + entry.minutes, 0)
  const overdue = tasks.filter(
    (task) => !task.completed && task.due !== null && task.due < todayStart
  )
  const active = activeTasks()

  const lines = [
    `时间：${nowDate.getFullYear()}-${String(nowDate.getMonth() + 1).padStart(2, '0')}-${String(nowDate.getDate()).padStart(2, '0')} ${WEEKDAYS[nowDate.getDay()]}`,
    `范围：最近 7 天（${new Date(days[0]).getMonth() + 1}/${new Date(days[0]).getDate()} - ${new Date(days[6]).getMonth() + 1}/${new Date(days[6]).getDate()}）`,
    `概览：完成 ${doneThisWeek.length} 个，专注 ${focusMinutes} 分钟，当前待办 ${active.length} 个，逾期 ${overdue.length} 个`,
    `每日完成：${perDay.map((item) => `${item.label} ${item.count} 个`).join('；')}`,
    '本周完成：',
    doneThisWeek.length
      ? doneThisWeek
          .slice(0, 20)
          .map((task) => `· ${taskLine(task)}`)
          .join('\n')
      : '· 无',
    '当前逾期：',
    overdue.length ? overdue.slice(0, 8).map((task) => `· ${taskLine(task)}`).join('\n') : '· 无',
    `习惯：${
      habits.length
        ? habits
            .map(
              (habit) =>
                `${habit.name} ${habit.records.filter((record) => days.some((day) => dayKey(day) === record)).length}/7`
            )
            .join('；')
        : '无'
    }`
  ]
  return lines.join('\n')
}

export function buildLocalReview(period: ReviewPeriod): string {
  const state = getState()
  const tasks = Object.values(state.data.tasks).filter((task) => !task.deletedAt)
  const focus = Object.values(state.data.focus).filter((entry) => !entry.deletedAt)
  const habits = Object.values(state.data.habits).filter((habit) => !habit.deletedAt)
  const now = Date.now()
  const todayStart = startOfDay(now)

  if (period === 'day') {
    const done = tasks.filter(
      (task) => task.completedAt !== null && isSameDay(task.completedAt, now)
    )
    const overdue = tasks.filter(
      (task) => !task.completed && task.due !== null && task.due < todayStart
    )
    const dueToday = tasks.filter(
      (task) =>
        !task.completed && task.due !== null && task.due >= todayStart && task.due < todayStart + 86400000
    )
    const focusMinutes = focus
      .filter((entry) => isSameDay(entry.startedAt, now))
      .reduce((sum, entry) => sum + entry.minutes, 0)

    const parts = [
      `今天完成 ${done.length} 个任务，专注 ${focusMinutes} 分钟。`,
      done.length
        ? done.slice(0, 5).map((task) => `· ${task.title}（${listName(task.listId)}）`).join('\n')
        : '· 还没有完成记录，先挑一件最小的事开始。',
      '',
      '值得注意',
      `· 今天还有 ${dueToday.length} 个待办${overdue.length ? `，其中 ${overdue.length} 个已逾期` : ''}。`,
      habits.length
        ? `· 习惯打卡 ${habits.filter((habit) => habit.records.includes(dayKey(now))).length}/${habits.length}。`
        : '· 还没有设置习惯，可以从每天 10 分钟开始。',
      '',
      '明天的建议',
      overdue.length
        ? `· 先处理逾期任务「${overdue[0].title}」，再开始新任务。`
        : '· 早上先做最重要的一件事，再处理零散消息。',
      dueToday.length
        ? `· 把今天没做完的 ${dueToday.length} 个任务重新排到明天，别让清单继续变长。`
        : '· 给明天留出 30 分钟空白，应对临时插入的事情。'
    ]
    return parts.join('\n')
  }

  const days = Array.from({ length: 7 }, (_, index) => addDays(todayStart, index - 6))
  const doneWeek = tasks.filter((task) => task.completedAt !== null && task.completedAt >= days[0])
  const focusMinutes = focus
    .filter((entry) => entry.startedAt >= days[0])
    .reduce((sum, entry) => sum + entry.minutes, 0)
  const perDay = days.map((day) => ({
    label: `${new Date(day).getMonth() + 1}/${new Date(day).getDate()}`,
    count: doneWeek.filter((task) => isSameDay(task.completedAt as number, day)).length
  }))
  const best = perDay.reduce((max, item) => (item.count > max.count ? item : max), perDay[0])
  const overdue = tasks.filter(
    (task) => !task.completed && task.due !== null && task.due < todayStart
  )

  return [
    `最近 7 天完成 ${doneWeek.length} 个任务，专注 ${focusMinutes} 分钟。`,
    doneWeek.length
      ? `· 完成最多的是 ${best.label}，共 ${best.count} 个。`
      : '· 这周还没有完成记录，状态需要调整一下。',
    `· 平均每天完成 ${(doneWeek.length / 7).toFixed(1)} 个任务。`,
    '',
    '节奏观察',
    focusMinutes >= 120
      ? `· 专注 ${focusMinutes} 分钟，投入不错，注意保持休息。`
      : `· 专注 ${focusMinutes} 分钟，可以试着每天安排 1 个 25 分钟番茄钟。`,
    overdue.length
      ? `· 当前还有 ${overdue.length} 个逾期任务，说明排期偏乐观。`
      : '· 没有逾期任务，排期节奏比较稳。',
    '',
    '下周建议',
    '· 给每天安排不超过 3 个重点任务，其余放进「以后」。',
    overdue.length
      ? `· 先清理逾期任务「${overdue[0].title}」，再规划新目标。`
      : '· 保持当前节奏，每周固定留半天做复盘和整理。'
  ].join('\n')
}

/** 流式生成 AI 复盘；未配置或失败时回退到本地统计 */
export async function aiReview(
  period: ReviewPeriod,
  options: { signal?: AbortSignal; onDelta?: (text: string) => void } = {}
): Promise<ReviewResult> {
  if (!aiConfigured()) return { text: buildLocalReview(period), source: 'local' }

  const context = buildReviewContext(period)
  const isDay = period === 'day'
  const system = [
    '你是务实、温和的效率教练。根据用户真实的清单数据写一份复盘。',
    '要求：',
    '1. 纯文本，不要使用 Markdown 符号（不要 #、*、-），列表用「·」开头；',
    `2. 分为三段，每段以一个短语标题单独成行：${isDay ? '「完成情况」「值得注意」「明天的建议」' : '「本周概览」「节奏观察」「下周建议」'}；`,
    '3. 只依据提供的数据，不要编造任务、数字或原因；数据不足时直接说明；',
    '4. 给 1-2 条具体、可执行的建议，不要说教，不要空泛鼓励；',
    `5. 全文控制在 ${isDay ? 200 : 300} 字以内。`
  ].join('\n')

  try {
    const text = await aiChatStream(
      [
        { role: 'system', content: system },
        { role: 'user', content: `${context}\n\n请生成${isDay ? '今日' : '本周'}复盘。` }
      ],
      { temperature: 0.55, signal: options.signal },
      options.onDelta
    )
    if (!text.trim()) return { text: buildLocalReview(period), source: 'local', error: '模型没有返回内容' }
    return { text: text.trim(), source: 'ai' }
  } catch (err) {
    if (options.signal?.aborted) throw err
    return {
      text: buildLocalReview(period),
      source: 'local',
      error: (err as Error).message
    }
  }
}
