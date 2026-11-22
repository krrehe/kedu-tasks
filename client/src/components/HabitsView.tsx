import { useState } from 'react'
import { useApp } from '../store'
import { addHabit, deleteHabit, toast, toggleHabitDay, updateHabit } from '../actions'
import { WEEKDAYS, addDays, dayKey } from '../lib/date'
import { LIST_COLORS } from '../seed'
import { ensureNotificationPermission } from '../lib/notify'
import { EmptyState } from './TaskList'
import { Icon } from './Icons'
import { Modal } from './Modal'
import { cls } from '../lib/utils'
import type { CSSProperties } from 'react'
import type { Habit } from '../types'

function calcStreak(records: string[]): number {
  const now = Date.now()
  let index = records.includes(dayKey(now)) ? 0 : 1
  let count = 0
  for (; index < 365; index++) {
    if (records.includes(dayKey(addDays(now, -index)))) count++
    else break
  }
  return count
}

export function HabitsView() {
  const state = useApp()
  const habits = Object.values(state.data.habits)
    .filter((h) => !h.deletedAt)
    .sort((a, b) => a.order - b.order)
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState('')
  const [color, setColor] = useState(LIST_COLORS[1])
  const [reminder, setReminder] = useState('')
  const [editing, setEditing] = useState<Habit | null>(null)

  const create = () => {
    if (addHabit(name, color, 1, reminder || null)) {
      if (reminder) void ensureNotificationPermission()
      setName('')
      setReminder('')
      setAdding(false)
    }
  }

  return (
    <div className="habits-view">
      <div className="habit-toolbar">
        <p>本周打卡情况一目了然，点圆圈可以补打卡。</p>
        <button className="primary-btn" onClick={() => setAdding((v) => !v)}>
          <Icon name="plus" size={15} />
          新建习惯
        </button>
      </div>

      {adding && (
        <div className="habit-form">
          <input
            autoFocus
            value={name}
            placeholder="习惯名称，例如：阅读 30 分钟"
            maxLength={20}
            onChange={(event) => setName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.nativeEvent.isComposing) create()
              if (event.key === 'Escape') setAdding(false)
            }}
          />
          <div className="color-row">
            {LIST_COLORS.map((item) => (
              <button
                key={item}
                type="button"
                className={cls('color-dot', color === item && 'active')}
                style={{ background: item }}
                onClick={() => setColor(item)}
                aria-label={`选择颜色 ${item}`}
              />
            ))}
          </div>
          <label className="habit-reminder-field">
            <Icon name="bell" size={14} />
            <span>每日提醒</span>
            <input
              type="time"
              value={reminder}
              onChange={(event) => setReminder(event.target.value)}
              aria-label="每日提醒时间"
            />
            {reminder && (
              <button type="button" onClick={() => setReminder('')}>
                清除
              </button>
            )}
          </label>
          <div className="habit-form-actions">
            <button className="primary-btn" onClick={create} disabled={!name.trim()}>
              创建
            </button>
            <button className="ghost-btn" onClick={() => setAdding(false)}>
              取消
            </button>
          </div>
        </div>
      )}

      {habits.length === 0 ? (
        <EmptyState title="还没有习惯" hint="从一件小事开始，比如每天读 10 页书" icon="flame" />
      ) : (
        <div className="habit-cards">
          {habits.map((habit) => (
            <HabitCard key={habit.id} habit={habit} onEdit={() => setEditing(habit)} />
          ))}
        </div>
      )}

      {editing && <HabitEditor habit={editing} onClose={() => setEditing(null)} />}
    </div>
  )
}

function HabitCard({ habit, onEdit }: { habit: Habit; onEdit: () => void }) {
  const [confirm, setConfirm] = useState(false)
  const days = Array.from({ length: 7 }, (_, i) => addDays(Date.now(), i - 6))
  const today = dayKey(Date.now())
  const checkedToday = habit.records.includes(today)
  const streak = calcStreak(habit.records)
  const monthPrefix = today.slice(0, 7)
  const monthCount = habit.records.filter((r) => r.startsWith(monthPrefix)).length
  const heatDays = Array.from({ length: 28 }, (_, i) => addDays(Date.now(), i - 27))
  const heatCount = habit.records.filter((record) =>
    heatDays.some((day) => dayKey(day) === record)
  ).length

  return (
    <article className="habit-card" style={{ '--hc': habit.color } as CSSProperties}>
      <header className="habit-head">
        <span
          className="habit-icon"
          style={{ background: `${habit.color}1f`, color: habit.color }}
        >
          <Icon name="flame" size={19} />
        </span>
        <div className="habit-title">
          <h3>{habit.name}</h3>
          <p>
            <Icon name="flame" size={12} /> 连续 {streak} 天 · 本月 {monthCount} 次
          </p>
          {habit.reminder && (
            <span className="habit-reminder-chip">
              <Icon name="bell" size={10} />
              {habit.reminder}
            </span>
          )}
        </div>
        <button className="icon-btn small" onClick={onEdit} aria-label="编辑习惯">
          <Icon name="pencil" size={15} />
        </button>
        <button
          className={cls('icon-btn small', confirm && 'danger')}
          onClick={() => {
            if (!confirm) {
              setConfirm(true)
              window.setTimeout(() => setConfirm(false), 3000)
              return
            }
            deleteHabit(habit.id)
          }}
          aria-label="删除习惯"
        >
          <Icon name={confirm ? 'check' : 'trash'} size={15} />
        </button>
      </header>

      <div className="habit-week">
        {days.map((ts) => {
          const key = dayKey(ts)
          const on = habit.records.includes(key)
          const isToday = key === today
          return (
            <button
              key={key}
              className={cls('habit-day', on && 'on', isToday && 'today')}
              onClick={() => toggleHabitDay(habit.id, key)}
              title={`${key}${on ? ' 已打卡' : ''}`}
            >
              <span className="hd-week">{WEEKDAYS[new Date(ts).getDay()]}</span>
              <span className="hd-dot">
                <Icon name="check" size={11} strokeWidth={3} />
              </span>
              <span className="hd-date">{new Date(ts).getDate()}</span>
            </button>
          )
        })}
      </div>

      <button
        className={cls('habit-checkin', checkedToday && 'done')}
        style={checkedToday ? undefined : { background: habit.color }}
        onClick={() => toggleHabitDay(habit.id)}
      >
        <Icon name={checkedToday ? 'check' : 'plus'} size={14} />
        {checkedToday ? '今日已打卡，点击取消' : '今日打卡'}
      </button>

      <div className="habit-heat">
        <div className="habit-heat-head">
          <span>最近 4 周</span>
          <span>{heatCount}/28</span>
        </div>
        <div className="habit-heat-grid">
          {heatDays.map((ts) => {
            const key = dayKey(ts)
            const on = habit.records.includes(key)
            return (
              <button
                key={key}
                className={cls('heat-cell', on && 'on')}
                style={on ? { background: habit.color } : undefined}
                onClick={() => toggleHabitDay(habit.id, key)}
                title={`${key}${on ? ' 已打卡' : ' 未打卡'}`}
                aria-label={`${key}${on ? ' 已打卡' : ' 未打卡'}`}
              />
            )
          })}
        </div>
      </div>
    </article>
  )
}

function HabitEditor({ habit, onClose }: { habit: Habit; onClose: () => void }) {
  const [name, setName] = useState(habit.name)
  const [color, setColor] = useState(habit.color)
  const [reminder, setReminder] = useState(habit.reminder || '')

  const save = () => {
    const clean = name.trim()
    if (!clean) return
    updateHabit(habit.id, { name: clean, color, reminder: reminder || null })
    if (reminder) void ensureNotificationPermission()
    toast('习惯已更新', 'success')
    onClose()
  }

  return (
    <Modal
      title="编辑习惯"
      subtitle="修改名称、颜色或每日提醒"
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            取消
          </button>
          <button className="btn primary" onClick={save} disabled={!name.trim()}>
            保存
          </button>
        </>
      }
    >
      <div className="habit-editor">
        <label className="field">
          <span>名称</span>
          <input
            value={name}
            maxLength={20}
            onChange={(event) => setName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.nativeEvent.isComposing) save()
            }}
          />
        </label>
        <div className="field">
          <span>颜色</span>
          <div className="color-row">
            {LIST_COLORS.map((item) => (
              <button
                key={item}
                type="button"
                className={cls('color-dot', color === item && 'active')}
                style={{ background: item }}
                onClick={() => setColor(item)}
                aria-label={`选择颜色 ${item}`}
              />
            ))}
          </div>
        </div>
        <label className="field">
          <span>每日提醒</span>
          <div className="inline-field">
            <input
              type="time"
              value={reminder}
              onChange={(event) => setReminder(event.target.value)}
              aria-label="每日提醒时间"
            />
            <button type="button" className="btn small" onClick={() => setReminder('')} disabled={!reminder}>
              不提醒
            </button>
          </div>
        </label>
        <p className="settings-note">安卓端会在设定时间发送系统通知；网页版需要保持应用打开。</p>
      </div>
    </Modal>
  )
}
