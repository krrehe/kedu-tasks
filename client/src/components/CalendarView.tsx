import { useMemo, useState } from 'react'
import { useApp } from '../store'
import { allTasks, listMap, sortByPlan } from '../lib/selectors'
import {
  WEEKDAYS,
  addDays,
  dayKey,
  formatMonthDay,
  formatTime,
  monthMatrix,
  parseDayKey,
  startOfWeek,
  weekdayLabel
} from '../lib/date'
import { openTask, requestQuickAdd, toast, updateTask } from '../actions'
import { TaskRow } from './TaskList'
import { Icon } from './Icons'
import { cls } from '../lib/utils'
import type { Task } from '../types'

export function CalendarView() {
  const state = useApp()
  const [cursor, setCursor] = useState(() => new Date())
  const [selected, setSelected] = useState(() => dayKey(Date.now()))
  const [mode, setMode] = useState<'month' | 'week'>('month')
  const [dragOverDay, setDragOverDay] = useState<string | null>(null)
  const lists = listMap(state)
  const tasks = useMemo(() => allTasks(state), [state.data.tasks])

  const byDay = useMemo(() => {
    const map: Record<string, Task[]> = {}
    for (const task of tasks) {
      if (task.due === null) continue
      const key = dayKey(task.due)
      if (!map[key]) map[key] = []
      map[key].push(task)
    }
    return map
  }, [tasks])

  const todayKeyStr = dayKey(Date.now())
  const selectedDate = parseDayKey(selected)
  const selectedTasks = (byDay[selected] || []).slice().sort(sortByPlan)
  const weekHeaders = [...WEEKDAYS.slice(1), WEEKDAYS[0]]
  const weekStart = startOfWeek(selectedDate)
  const weekDays = Array.from({ length: 7 }, (_, index) => addDays(weekStart, index))
  const weeks = monthMatrix(cursor.getFullYear(), cursor.getMonth())

  const moveStep = (delta: number) => {
    if (mode === 'month') {
      setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + delta, 1))
    } else {
      setSelected(dayKey(addDays(selectedDate, delta * 7)))
    }
  }

  const goToday = () => {
    const now = new Date()
    setCursor(now)
    setSelected(dayKey(Date.now()))
  }

  const moveTaskToDay = (taskId: string, day: number) => {
    const task = state.data.tasks[taskId]
    if (!task || task.due === null) return
    const old = new Date(task.due)
    const target = new Date(day)
    if (task.allDay) {
      target.setHours(0, 0, 0, 0)
    } else {
      target.setHours(old.getHours(), old.getMinutes(), 0, 0)
    }
    updateTask(task.id, { due: target.getTime() })
    toast(`已改到 ${formatMonthDay(day)}`, 'success')
    setDragOverDay(null)
  }

  return (
    <div className="calendar-view">
      <div className="calendar-toolbar">
        <div className="month-label">
          {mode === 'month'
            ? `${cursor.getFullYear()} 年 ${cursor.getMonth() + 1} 月`
            : `${formatMonthDay(weekStart)} - ${formatMonthDay(addDays(weekStart, 6))}`}
        </div>
        <div className="calendar-nav">
          <button
            className="text-btn view-toggle"
            onClick={() => setMode((current) => (current === 'month' ? 'week' : 'month'))}
          >
            {mode === 'month' ? '周视图' : '月视图'}
          </button>
          <button className="icon-btn" onClick={() => moveStep(-1)} aria-label="上一页">
            <Icon name="chevron-left" size={18} />
          </button>
          <button className="today-btn" onClick={goToday}>
            今天
          </button>
          <button className="icon-btn" onClick={() => moveStep(1)} aria-label="下一页">
            <Icon name="chevron-right" size={18} />
          </button>
        </div>
      </div>

      {mode === 'month' ? (
        <>
          <div className="calendar-grid">
            {weekHeaders.map((day) => (
              <div className="cal-weekday" key={day}>
                周{day}
              </div>
            ))}
            {weeks.flat().map((ts) => {
              const key = dayKey(ts)
              const dayTasks = byDay[key] || []
              const inMonth = new Date(ts).getMonth() === cursor.getMonth()
              return (
                <button
                  key={key}
                  className={cls(
                    'cal-cell',
                    !inMonth && 'out',
                    key === todayKeyStr && 'today',
                    key === selected && 'selected'
                  )}
                  onClick={() => setSelected(key)}
                >
                  <span className="cal-num">{new Date(ts).getDate()}</span>
                  <span className="cal-dots">
                    {dayTasks.slice(0, 3).map((task) => (
                      <i
                        key={task.id}
                        className={cls('cal-dot', task.completed && 'done')}
                        style={{
                          background: task.completed
                            ? 'var(--text-3)'
                            : lists[task.listId]?.color || 'var(--accent)'
                        }}
                      />
                    ))}
                  </span>
                </button>
              )
            })}
          </div>

          <div className="cal-day">
            <header className="cal-day-head">
              <div>
                <strong>{formatMonthDay(selectedDate)}</strong>
                {selected === todayKeyStr && <span className="cal-today-chip">今天</span>}
                <span>
                  {weekdayLabel(selectedDate)} · {selectedTasks.length} 个任务
                </span>
              </div>
              <button className="text-btn" onClick={() => requestQuickAdd(parseDayKey(selected))}>
                <Icon name="plus" size={14} />
                添加
              </button>
            </header>

            {selectedTasks.length > 0 ? (
              <div className="cal-day-list">
                {selectedTasks.map((task) => (
                  <TaskRow
                    key={task.id}
                    task={task}
                    list={lists[task.listId]}
                    showList
                    onSelect={openTask}
                  />
                ))}
              </div>
            ) : (
              <p className="cal-empty">这一天还没有安排，留白也很好。</p>
            )}
          </div>
        </>
      ) : (
        <>
          <p className="week-hint">
            <Icon name="calendar" size={13} />
            桌面端拖动任务到其他日期，可以快速改期
          </p>
          <div className="week-view">
            {weekDays.map((day) => {
              const key = dayKey(day)
              const dayTasks = (byDay[key] || []).slice().sort(sortByPlan)
              const isToday = key === todayKeyStr
              return (
                <section
                  className={cls(
                    'week-day',
                    isToday && 'today',
                    dragOverDay === key && 'over'
                  )}
                  key={key}
                  onDragOver={(event) => {
                    event.preventDefault()
                    event.dataTransfer.dropEffect = 'move'
                    if (dragOverDay !== key) setDragOverDay(key)
                  }}
                  onDragLeave={(event) => {
                    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
                      setDragOverDay((current) => (current === key ? null : current))
                    }
                  }}
                  onDrop={(event) => {
                    event.preventDefault()
                    const taskId = event.dataTransfer.getData('text/plain')
                    if (taskId) moveTaskToDay(taskId, day)
                  }}
                >
                  <header className="week-day-head">
                    <div className="week-day-label">
                      <span className="week-day-name">周{WEEKDAYS[new Date(day).getDay()]}</span>
                      <span className="week-day-date">{formatMonthDay(day)}</span>
                    </div>
                    <button
                      className="icon-btn tiny"
                      onClick={() => requestQuickAdd(day)}
                      aria-label={`在 ${formatMonthDay(day)} 添加任务`}
                    >
                      <Icon name="plus" size={14} />
                    </button>
                  </header>

                  <div className="week-day-list">
                    {dayTasks.length === 0 && <p className="week-empty">无安排</p>}
                    {dayTasks.map((task) => (
                      <button
                        className={cls('week-task', task.completed && 'done')}
                        key={task.id}
                        draggable
                        onDragStart={(event) => {
                          event.dataTransfer.setData('text/plain', task.id)
                          event.dataTransfer.effectAllowed = 'move'
                        }}
                        onClick={() => openTask(task.id)}
                      >
                        <i
                          className="week-task-dot"
                          style={{ background: lists[task.listId]?.color || 'var(--accent)' }}
                        />
                        <span className="week-task-time">
                          {task.allDay ? '全天' : formatTime(task.due as number)}
                        </span>
                        <span className="week-task-title">{task.title}</span>
                      </button>
                    ))}
                  </div>
                </section>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}
