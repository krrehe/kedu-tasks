import { useState } from 'react'
import type { CSSProperties } from 'react'
import { useApp } from '../store'
import { WEEKDAYS, addDays, dayKey, isSameDay } from '../lib/date'
import { PRIORITY_COLOR, PRIORITY_LABEL, sortedLists } from '../lib/selectors'
import { percent } from '../lib/format'
import { Icon } from './Icons'
import { ReviewModal } from './ReviewModal'

export function StatsView() {
  const state = useApp()
  const [reviewOpen, setReviewOpen] = useState(false)
  const tasks = Object.values(state.data.tasks).filter((t) => !t.deletedAt)
  const focus = Object.values(state.data.focus).filter((f) => !f.deletedAt)
  const habits = Object.values(state.data.habits).filter((h) => !h.deletedAt)
  const active = tasks.filter((t) => !t.completed)

  const days = Array.from({ length: 7 }, (_, i) => addDays(Date.now(), i - 6))
  const doneCounts = days.map((day) =>
    tasks.filter((t) => t.completedAt !== null && isSameDay(t.completedAt, day)).length
  )
  const focusMinutes = days.map((day) =>
    focus.filter((f) => isSameDay(f.startedAt, day)).reduce((sum, f) => sum + f.minutes, 0)
  )

  const weekDone = doneCounts.reduce((sum, n) => sum + n, 0)
  const weekFocus = focusMinutes.reduce((sum, n) => sum + n, 0)
  const checkins = habits.reduce(
    (sum, habit) => sum + habit.records.filter((r) => days.some((d) => dayKey(d) === r)).length,
    0
  )
  const habitRate = habits.length ? percent(checkins, habits.length * 7) : 0
  const dueThisWeek = active.filter((t) => t.due !== null && t.due <= addDays(Date.now(), 7)).length

  const maxDone = Math.max(1, ...doneCounts)
  const maxFocus = Math.max(1, ...focusMinutes)

  const lists = sortedLists(state)
  const listCounts = lists.map((list) => ({
    list,
    count: active.filter((t) => t.listId === list.id).length
  }))
  const maxListCount = Math.max(1, ...listCounts.map((item) => item.count))

  const priorityOrder = [5, 3, 1, 0] as const
  const priorityCounts = priorityOrder.map((priority) => ({
    priority,
    count: active.filter((t) => t.priority === priority).length
  }))

  return (
    <div className="stats-view">
      <div className="stats-toolbar">
        <span className="muted-text">数据来自本机，AI 复盘会结合最近的任务与专注记录</span>
        <button className="btn small" onClick={() => setReviewOpen(true)}>
          <Icon name="sparkles" size={14} />
          AI 复盘
        </button>
      </div>

      <div className="stat-cards">
        <StatCard icon="check-circle" tone="#22C55E" label="本周完成" value={weekDone} unit="个" sub="保持这个节奏" />
        <StatCard icon="timer" tone="#4C6FFF" label="本周专注" value={weekFocus} unit="分钟" sub={`${focus.length} 个专注时段`} />
        <StatCard icon="flame" tone="#F59E0B" label="习惯打卡率" value={habitRate} unit="%" sub={`${checkins} 次打卡`} />
        <StatCard icon="layers" tone="#8B5CF6" label="待办任务" value={active.length} unit="个" sub={`${dueThisWeek} 个在本周`} />
      </div>

      <section className="stat-panel">
        <header className="stat-panel-head">
          <h3>最近 7 天完成情况</h3>
          <span className="muted-text">共 {weekDone} 个</span>
        </header>
        <div className="bars">
          {days.map((day, index) => (
            <div className="bar-col" key={day}>
              <span className="bar-value">{doneCounts[index] || ''}</span>
              <div
                className="bar"
                style={{
                  height: `${Math.max(6, (doneCounts[index] / maxDone) * 100)}%`,
                  opacity: doneCounts[index] ? 1 : 0.28
                }}
              />
              <span className="bar-label">{WEEKDAYS[new Date(day).getDay()]}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="stat-panel">
        <header className="stat-panel-head">
          <h3>最近 7 天专注时长</h3>
          <span className="muted-text">共 {weekFocus} 分钟</span>
        </header>
        <div className="bars focus-bars">
          {days.map((day, index) => (
            <div className="bar-col" key={day}>
              <span className="bar-value">{focusMinutes[index] ? focusMinutes[index] : ''}</span>
              <div
                className="bar"
                style={{
                  height: `${Math.max(6, (focusMinutes[index] / maxFocus) * 100)}%`,
                  opacity: focusMinutes[index] ? 1 : 0.28
                }}
              />
              <span className="bar-label">{WEEKDAYS[new Date(day).getDay()]}</span>
            </div>
          ))}
        </div>
      </section>

      <div className="stat-two-col">
        <section className="stat-panel">
          <header className="stat-panel-head">
            <h3>清单分布</h3>
          </header>
          <div className="dist-list">
            {listCounts.map(({ list, count }) => (
              <div className="dist-row" key={list.id}>
                <span className="dist-name">
                  <i className="dot" style={{ background: list.color }} />
                  {list.name}
                </span>
                <span className="dist-track">
                  <span
                    className="dist-fill"
                    style={{ width: `${percent(count, maxListCount)}%`, background: list.color }}
                  />
                </span>
                <span className="dist-count">{count}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="stat-panel">
          <header className="stat-panel-head">
            <h3>优先级分布</h3>
          </header>
          <div className="dist-list">
            {priorityCounts.map(({ priority, count }) => (
              <div className="dist-row" key={priority}>
                <span className="dist-name">
                  <i className="dot" style={{ background: PRIORITY_COLOR[priority] }} />
                  {PRIORITY_LABEL[priority]}
                </span>
                <span className="dist-track">
                  <span
                    className="dist-fill"
                    style={{
                      width: `${percent(count, Math.max(1, active.length))}%`,
                      background: PRIORITY_COLOR[priority]
                    }}
                  />
                </span>
                <span className="dist-count">{count}</span>
              </div>
            ))}
          </div>
        </section>
      </div>

      <p className="stats-foot">统计基于本机数据，多端同步后会自动合并。</p>

      {reviewOpen && <ReviewModal onClose={() => setReviewOpen(false)} />}
    </div>
  )
}

function StatCard({
  icon,
  tone,
  label,
  value,
  unit,
  sub
}: {
  icon: 'check-circle' | 'timer' | 'flame' | 'layers'
  tone: string
  label: string
  value: number
  unit: string
  sub: string
}) {
  return (
    <div className="stat-card toned" style={{ '--tone': tone } as CSSProperties}>
      <div className="stat-card-head">
        <span className="stat-icon" style={{ background: `${tone}1a`, color: tone }}>
          <Icon name={icon} size={18} />
        </span>
        <span>{label}</span>
      </div>
      <div className="stat-big">
        {value}
        <small>{unit}</small>
      </div>
      <p className="stat-sub">{sub}</p>
    </div>
  )
}
