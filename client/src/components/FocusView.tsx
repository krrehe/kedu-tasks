import type { CSSProperties } from 'react'
import { useApp } from '../store'
import {
  TIMER_MODES,
  pauseTimer,
  requestNotificationPermission,
  resetTimer,
  setTimerMode,
  setTimerTask,
  startTimer,
  useTimer
} from '../lib/timer'
import { formatClock, formatTime, isSameDay } from '../lib/date'
import { sortByPlan } from '../lib/selectors'
import { Icon } from './Icons'
import { cls } from '../lib/utils'

export function FocusView() {
  const state = useApp()
  const timer = useTimer()
  const activeTasks = Object.values(state.data.tasks)
    .filter((t) => !t.deletedAt && !t.completed)
    .sort(sortByPlan)

  const todaySessions = Object.values(state.data.focus)
    .filter((f) => !f.deletedAt && isSameDay(f.startedAt, Date.now()))
    .sort((a, b) => b.startedAt - a.startedAt)

  const todayMinutes = todaySessions.reduce((sum, s) => sum + s.minutes, 0)
  const totalSeconds = timer.total
  const ratio = totalSeconds > 0 ? 1 - timer.remaining / totalSeconds : 0
  const circumference = 2 * Math.PI * 104
  const color = TIMER_MODES[timer.mode].color
  const currentTask = timer.taskId ? state.data.tasks[timer.taskId] : null

  return (
    <div className="focus-view">
      <section className="focus-card" style={{ '--focus-color': color } as CSSProperties}>
        <div className="focus-modes">
          {(Object.keys(TIMER_MODES) as Array<keyof typeof TIMER_MODES>).map((mode) => (
            <button
              key={mode}
              className={cls('focus-mode', timer.mode === mode && 'active')}
              style={timer.mode === mode ? { color: TIMER_MODES[mode].color } : undefined}
              onClick={() => setTimerMode(mode)}
            >
              {TIMER_MODES[mode].label}
            </button>
          ))}
        </div>

        <div className="focus-ring-wrap">
          <svg viewBox="0 0 240 240" className="focus-ring" aria-hidden="true">
            <circle cx="120" cy="120" r="104" className="ring-bg" />
            <circle
              cx="120"
              cy="120"
              r="104"
              className="ring-fg"
              style={{
                stroke: color,
                strokeDasharray: circumference,
                strokeDashoffset: circumference * (1 - ratio)
              }}
              transform="rotate(-90 120 120)"
            />
          </svg>
          <div className="focus-center">
            <span className="focus-mode-label">{TIMER_MODES[timer.mode].label}</span>
            <strong className="focus-time" style={{ color: timer.running ? color : undefined }}>
              {formatClock(timer.remaining)}
            </strong>
            <span className="focus-task-label">{currentTask ? currentTask.title : '自由专注'}</span>
          </div>
        </div>

        {timer.justFinished && (
          <div className="focus-done">
            <Icon name="check-circle" size={16} />
            {timer.mode === 'focus' ? '专注完成，已记录到统计' : '休息结束，继续加油'}
          </div>
        )}

        <div className="focus-controls">
          <button className="ghost-btn" onClick={() => resetTimer()} aria-label="重置计时">
            <Icon name="refresh" size={18} />
          </button>
          <button
            className="focus-start"
            style={{ background: color, boxShadow: `0 8px 22px ${color}40` }}
            onClick={() => {
              if (timer.running) pauseTimer()
              else {
                requestNotificationPermission()
                startTimer()
              }
            }}
            disabled={timer.remaining === 0}
          >
            <Icon name={timer.running ? 'pause' : 'play'} size={18} />
            {timer.running ? '暂停' : timer.remaining === 0 ? '已完成' : '开始'}
          </button>
          <span className="focus-spacer" />
        </div>

        <label className="focus-task-select">
          <Icon name="target" size={16} />
          <select
            value={timer.taskId || ''}
            onChange={(event) => setTimerTask(event.target.value || null)}
          >
            <option value="">自由专注</option>
            {activeTasks.map((task) => (
              <option key={task.id} value={task.id}>
                {task.title}
              </option>
            ))}
          </select>
          <Icon name="chevron-down" size={14} />
        </label>
      </section>

      <div className="focus-side">
        <section className="stat-card focus-today">
          <div className="stat-card-head">
            <span className="stat-icon" style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}>
              <Icon name="timer" size={18} />
            </span>
            <span>今日专注</span>
          </div>
          <div className="stat-big">
            {todayMinutes}
            <small>分钟</small>
          </div>
          <p className="stat-sub">{todaySessions.length} 个专注时段</p>
        </section>

        <section className="focus-log">
          <h4>今日记录</h4>
          {todaySessions.length === 0 ? (
            <p className="muted-text">还没有记录，开始第一个番茄钟吧。</p>
          ) : (
            <ul>
              {todaySessions.map((session) => (
                <li key={session.id}>
                  <span className="log-dot" style={{ background: TIMER_MODES.focus.color }} />
                  <span className="log-title">
                    {session.taskId && state.data.tasks[session.taskId]
                      ? state.data.tasks[session.taskId].title
                      : '自由专注'}
                  </span>
                  <span className="log-meta">
                    {formatTime(session.startedAt)} · {session.minutes} 分钟
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  )
}
