import type { CSSProperties } from 'react'
import { setUI, useApp } from '../store'
import { navigate, openTask, requestQuickAdd, toggleHabitDay, toggleTask } from '../actions'
import { PRIORITY_COLOR, counts, listMap, sortByPlan } from '../lib/selectors'
import {
  addDays,
  dayKey,
  endOfDay,
  formatDue,
  isSameDay,
  startOfDay
} from '../lib/date'
import { Icon } from './Icons'
import type { IconName } from './Icons'
import { cls } from '../lib/utils'

export function OverviewView() {
  const state = useApp()
  const c = counts(state)
  const now = Date.now()
  const todayStart = startOfDay(now)
  const todayEnd = endOfDay(now)
  const todayKey = dayKey(now)
  const lists = listMap(state)

  const tasks = Object.values(state.data.tasks).filter((task) => !task.deletedAt)
  const todayTasks = tasks
    .filter((task) => !task.completed && task.due !== null && task.due <= todayEnd)
    .sort(sortByPlan)
  const completedToday = tasks.filter(
    (task) => task.completed && task.completedAt !== null && isSameDay(task.completedAt, now)
  )
  const activeHabits = Object.values(state.data.habits)
    .filter((habit) => !habit.deletedAt)
    .sort((a, b) => a.order - b.order)
  const doneHabits = activeHabits.filter((habit) => habit.records.includes(todayKey))
  const todayFocus = Object.values(state.data.focus)
    .filter((session) => !session.deletedAt && isSameDay(session.startedAt, now))
    .reduce((sum, session) => sum + session.minutes, 0)
  const weekDone = tasks.filter(
    (task) =>
      task.completed &&
      task.completedAt !== null &&
      task.completedAt >= startOfDay(addDays(now, -6))
  ).length

  const totalToday = todayTasks.length + completedToday.length
  const percent = totalToday ? Math.round((completedToday.length / totalToday) * 100) : 0
  const hour = new Date(now).getHours()
  const greeting =
    hour < 6
      ? '夜深了，早点休息'
      : hour < 12
        ? '早上好，新的一天开始了'
        : hour < 18
          ? '下午好，保持自己的节奏'
          : '晚上好，辛苦了一天'
  const nextTask = todayTasks[0]

  const heroTitle =
    todayTasks.length > 0 ? (
      <>
        今天还有 <b>{todayTasks.length}</b> 个待办
      </>
    ) : (
      <>
        今天已完成 <b>{completedToday.length}</b> 个任务
      </>
    )
  const heroHint =
    todayTasks.length > 0
      ? c.overdue
        ? `其中 ${c.overdue} 个已逾期${nextTask ? `，建议先处理「${nextTask.title}」` : ''}。`
        : '按自己的节奏来，完成一件是一件。'
      : completedToday.length
        ? '今天的任务已经清空，可以安排一点自己的时间。'
        : '今天还没有任务，添加一件小事开始吧。'
  const brief = [
    heroHint,
    doneHabits.length < activeHabits.length
      ? `还有 ${activeHabits.length - doneHabits.length} 个习惯没打卡。`
      : activeHabits.length
        ? '今天的习惯都完成了。'
        : '',
    todayFocus ? `已经专注 ${todayFocus} 分钟。` : '',
    todayTasks.length > 0 && !c.overdue && nextTask
      ? `建议先处理「${nextTask.title}」。`
      : ''
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <div className="overview-view">
      <section className="ov-hero">
        <div className="ov-hero-main">
          <span className="ov-eyebrow">{greeting}</span>
          <h2>{heroTitle}</h2>
          <p>{heroHint}</p>
          <div className="ov-hero-actions">
            <button className="primary-btn" onClick={() => requestQuickAdd()}>
              <Icon name="plus" size={15} />
              添加任务
            </button>
            <button className="ghost-btn" onClick={() => navigate('focus')}>
              <Icon name="timer" size={15} />
              开始专注
            </button>
          </div>
        </div>
        <div className="ov-ring" role="img" aria-label={`今日完成 ${percent}%`}>
          <svg viewBox="0 0 120 120" aria-hidden="true">
            <circle cx="60" cy="60" r="50" className="ov-ring-bg" />
            <circle
              cx="60"
              cy="60"
              r="50"
              className="ov-ring-fg"
              style={{
                strokeDasharray: 314,
                strokeDashoffset: 314 - (314 * percent) / 100
              }}
              transform="rotate(-90 60 60)"
            />
          </svg>
          <div className="ov-ring-center">
            <strong>{percent}%</strong>
            <span>今日进度</span>
          </div>
        </div>
      </section>

      <div className="ov-stats">
        <OverviewStat
          icon="check-circle"
          tone="#22C55E"
          label="今日完成"
          value={completedToday.length}
        />
        <OverviewStat icon="clock" tone="var(--danger)" label="已逾期" value={c.overdue} />
        <OverviewStat
          icon="timer"
          tone="#8B5CF6"
          label="今日专注"
          value={todayFocus}
          unit="分钟"
        />
        <OverviewStat icon="chart" tone="var(--accent)" label="本周完成" value={weekDone} />
      </div>

      <div className="ov-grid">
        <section className="ov-card">
          <header className="ov-card-head">
            <h3>
              <Icon name="check-circle" size={16} />
              今日重点
            </h3>
            <button className="text-btn" onClick={() => navigate('today')}>
              查看全部
              <Icon name="chevron-right" size={13} />
            </button>
          </header>
          <div className="ov-task-list">
            {todayTasks.slice(0, 5).map((task) => (
              <div
                className="ov-task"
                key={task.id}
                role="button"
                tabIndex={0}
                onClick={() => openTask(task.id)}
                onKeyDown={(event) => {
                  if (event.target !== event.currentTarget) return
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault()
                    openTask(task.id)
                  }
                }}
              >
                <button
                  className="task-check"
                  style={{ '--pc': PRIORITY_COLOR[task.priority] } as CSSProperties}
                  aria-label="完成任务"
                  onClick={(event) => {
                    event.stopPropagation()
                    toggleTask(task.id)
                  }}
                >
                  <Icon name="check" size={13} strokeWidth={3.2} />
                </button>
                <div className="ov-task-main">
                  <span className="ov-task-title">{task.title}</span>
                  <span className="ov-task-meta">
                    {task.due !== null && (
                      <span>
                        <Icon
                          name={task.due < todayStart ? 'clock' : 'calendar'}
                          size={11}
                        />
                        {formatDue(task.due, task.allDay)}
                      </span>
                    )}
                    {lists[task.listId] && (
                      <span>
                        <i
                          className="dot"
                          style={{ background: lists[task.listId].color }}
                        />
                        {lists[task.listId].name}
                      </span>
                    )}
                  </span>
                </div>
                {task.priority > 0 && (
                  <Icon
                    name="flag"
                    size={14}
                    style={{ color: PRIORITY_COLOR[task.priority] }}
                  />
                )}
              </div>
            ))}
            {todayTasks.length === 0 && (
              <div className="ov-empty">
                <Icon name="check-circle" size={22} />
                <p>{completedToday.length ? '今天的任务都完成了' : '今天还没有安排'}</p>
              </div>
            )}
          </div>
        </section>

        <div className="ov-side">
          <section className="ov-card">
            <header className="ov-card-head">
              <h3>
                <Icon name="flame" size={16} />
                习惯打卡
              </h3>
              <button className="text-btn" onClick={() => navigate('habits')}>
                管理
              </button>
            </header>
            <div className="ov-habits">
              {activeHabits.slice(0, 4).map((habit) => {
                const done = habit.records.includes(todayKey)
                return (
                  <button
                    key={habit.id}
                    className={cls('ov-habit', done && 'done')}
                    onClick={() => toggleHabitDay(habit.id)}
                  >
                    <span
                      className="ov-habit-icon"
                      style={{ background: `${habit.color}1f`, color: habit.color }}
                    >
                      <Icon name="flame" size={15} />
                    </span>
                    <span className="ov-habit-name">{habit.name}</span>
                    <span
                      className={cls('ov-habit-check', done && 'on')}
                      style={done ? { background: habit.color } : undefined}
                    >
                      <Icon name="check" size={11} strokeWidth={3} />
                    </span>
                  </button>
                )
              })}
              {!activeHabits.length && (
                <p className="ov-empty-text">还没有习惯，去创建一个吧。</p>
              )}
            </div>
          </section>

          <section className="ov-card ov-brief">
            <span className="ov-brief-icon">
              <Icon name="sparkles" size={17} />
            </span>
            <h3>AI 每日简报</h3>
            <p>{brief}</p>
            <button className="btn primary small" onClick={() => setUI({ aiOpen: true })}>
              让 AI 帮我安排今天
            </button>
          </section>
        </div>
      </div>
    </div>
  )
}

function OverviewStat({
  icon,
  tone,
  label,
  value,
  unit
}: {
  icon: IconName
  tone: string
  label: string
  value: number
  unit?: string
}) {
  return (
    <div className="ov-stat">
      <span
        className="ov-stat-icon"
        style={{
          color: tone,
          background: `color-mix(in srgb, ${tone} 12%, transparent)`
        }}
      >
        <Icon name={icon} size={17} />
      </span>
      <div>
        <strong>
          {value}
          {unit && <small>{unit}</small>}
        </strong>
        <span>{label}</span>
      </div>
    </div>
  )
}
