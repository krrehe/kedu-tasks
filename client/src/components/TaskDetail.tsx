import { useEffect, useRef, useState } from 'react'
import { useApp } from '../store'
import {
  addSubtask,
  addSubtasks,
  deleteSubtask,
  deleteTask,
  openTask,
  toast,
  toggleSubtask,
  toggleTask,
  updateTask
} from '../actions'
import { PRIORITY_COLOR, sortedLists } from '../lib/selectors'
import {
  addDays,
  dayKey,
  formatDateTime,
  formatDue,
  formatReminder,
  formatTime,
  parseDayKey,
  startOfDay
} from '../lib/date'
import { aiBreakdown, aiConfigured, aiEstimateTask, AiError } from '../lib/ai'
import { ensureNotificationPermission } from '../lib/notify'
import type { Priority, Repeat, Task } from '../types'
import { Icon } from './Icons'
import { cls } from '../lib/utils'

const PRIORITY_OPTIONS: Array<{ value: Priority; label: string }> = [
  { value: 0, label: '无' },
  { value: 1, label: '低' },
  { value: 3, label: '中' },
  { value: 5, label: '高' }
]

const REPEAT_OPTIONS: Array<{ value: Repeat | ''; label: string }> = [
  { value: '', label: '不重复' },
  { value: 'daily', label: '每天' },
  { value: 'weekdays', label: '每个工作日' },
  { value: 'weekly', label: '每周' },
  { value: 'monthly', label: '每月' },
  { value: 'yearly', label: '每年' }
]

export function TaskDetail() {
  const state = useApp()
  const task = state.ui.selectedTaskId ? state.data.tasks[state.ui.selectedTaskId] : undefined
  if (!task || task.deletedAt) return null
  return <TaskDetailInner key={task.id} task={task} />
}

function TaskDetailInner({ task }: { task: Task }) {
  const state = useApp()
  const lists = sortedLists(state)
  const list = state.data.lists[task.listId]
  const [title, setTitle] = useState(task.title)
  const [notes, setNotes] = useState(task.notes)
  const [showDate, setShowDate] = useState(false)
  const [confirmDel, setConfirmDel] = useState(false)
  const [tagInput, setTagInput] = useState('')
  const [subInput, setSubInput] = useState('')
  const [aiBusy, setAiBusy] = useState(false)
  const [aiError, setAiError] = useState('')
  const [estimating, setEstimating] = useState(false)
  const titleRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    const el = titleRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [title])

  // 标题与备注在停止输入后自动保存
  useEffect(() => {
    const timer = window.setTimeout(() => {
      const clean = title.trim()
      if (clean && clean !== task.title) updateTask(task.id, { title: clean })
    }, 500)
    return () => window.clearTimeout(timer)
  }, [title, task.id, task.title])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (notes !== task.notes) updateTask(task.id, { notes })
    }, 800)
    return () => window.clearTimeout(timer)
  }, [notes, task.id, task.notes])

  const addTag = () => {
    const clean = tagInput.trim().replace(/^#/, '')
    if (!clean) return
    if (!task.tags.includes(clean)) {
      updateTask(task.id, { tags: [...task.tags, clean].slice(0, 8) })
    }
    setTagInput('')
  }

  const submitSubtask = () => {
    const value = subInput.trim()
    if (!value) return
    addSubtask(task.id, value)
    setSubInput('')
  }

  const runBreakdown = async () => {
    if (aiBusy) return
    if (!aiConfigured()) {
      toast('请先在「设置 → AI 助手」配置模型', 'error')
      return
    }
    setAiBusy(true)
    setAiError('')
    try {
      const subtasks = await aiBreakdown(task)
      addSubtasks(task.id, subtasks)
      toast(`AI 拆出了 ${subtasks.length} 个子任务`, 'success')
    } catch (err) {
      setAiError(err instanceof AiError ? err.message : 'AI 拆解失败，请稍后再试')
    } finally {
      setAiBusy(false)
    }
  }

  const runEstimate = async () => {
    if (estimating) return
    if (!aiConfigured()) {
      toast('请先在「设置 → AI 助手」配置模型', 'error')
      return
    }
    setEstimating(true)
    try {
      const minutes = await aiEstimateTask(task)
      updateTask(task.id, { estimate: minutes })
      toast(`AI 估算约 ${minutes} 分钟`, 'success')
    } catch (err) {
      toast(err instanceof AiError ? err.message : '估算失败，请稍后再试', 'error')
    } finally {
      setEstimating(false)
    }
  }

  const doneSubs = task.subtasks.filter((s) => s.done).length

  return (
    <>
      <div className="detail-scrim" onClick={() => openTask(null)} />
      <aside className="detail-panel" aria-label="任务详情">
        <header className="detail-head">
          <button className="icon-btn" onClick={() => openTask(null)} aria-label="关闭">
            <Icon name="chevron-left" />
          </button>
          <div className="detail-crumb">
            <span className="dot" style={{ background: list?.color || '#8B95A7' }} />
            <span>{list?.name || '收件箱'}</span>
          </div>
          <span className="grow" />
          {task.completed && <span className="done-badge">已完成</span>}
        </header>

        <div className="detail-scroll">
          <div className="detail-title-wrap">
            <button
              className={cls('big-check', task.completed && 'on')}
              onClick={() => toggleTask(task.id)}
              aria-label={task.completed ? '标记为未完成' : '标记为完成'}
            >
              <Icon name="check" size={16} strokeWidth={3} />
            </button>
            <textarea
              ref={titleRef}
              className={cls('detail-title', task.completed && 'done')}
              rows={1}
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              onBlur={() => {
                if (!title.trim()) setTitle(task.title)
                else if (title.trim() !== task.title) updateTask(task.id, { title: title.trim() })
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault()
                  ;(event.target as HTMLTextAreaElement).blur()
                }
              }}
              aria-label="任务标题"
            />
          </div>

          <textarea
            className="detail-notes"
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            onBlur={() => {
              if (notes !== task.notes) updateTask(task.id, { notes })
            }}
            placeholder="添加备注、链接或上下文…"
            rows={3}
          />

          <div className="detail-rows">
            <div className="detail-row">
              <span className="row-label">
                <Icon name="calendar" size={17} />
                日期
              </span>
              <div className="row-value">
                <button className={cls('pill', !task.due && 'muted')} onClick={() => setShowDate((v) => !v)}>
                  {task.due ? formatDue(task.due, task.allDay) : '设置日期'}
                </button>
                {task.due !== null && (
                  <button
                    className="icon-btn small"
                    aria-label="清除日期"
                    onClick={() => updateTask(task.id, { due: null, allDay: true, reminder: null })}
                  >
                    <Icon name="x" size={14} />
                  </button>
                )}
              </div>
            </div>

            {showDate && (
              <DateEditor
                due={task.due}
                allDay={task.allDay}
                onChange={(due, allDay) =>
                  updateTask(task.id, {
                    due,
                    allDay,
                    ...(due === null ? { reminder: null } : {})
                  })
                }
                onClose={() => setShowDate(false)}
              />
            )}

            <div className="detail-row">
              <span className="row-label">
                <Icon name="timer" size={17} />
                预计耗时
              </span>
              <div className="row-value">
                <label className="select-wrap">
                  <select
                    value={task.estimate ?? 0}
                    onChange={(event) =>
                      updateTask(task.id, {
                        estimate: Number(event.target.value) || null
                      })
                    }
                  >
                    <option value={0}>未设置</option>
                    {[15, 30, 45, 60, 90, 120, 180].map((minutes) => (
                      <option key={minutes} value={minutes}>
                        {minutes} 分钟
                      </option>
                    ))}
                  </select>
                  <Icon name="chevron-down" size={14} />
                </label>
                <button className="ai-text-btn" onClick={runEstimate} disabled={estimating}>
                  <Icon name="sparkles" size={13} />
                  {estimating ? '估算中…' : 'AI 估算'}
                </button>
              </div>
            </div>

            <div className="detail-row">
              <span className="row-label">
                <Icon name="flag" size={17} />
                优先级
              </span>
              <div className="segmented">
                {PRIORITY_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    className={cls('seg-item', task.priority === option.value && 'active')}
                    style={task.priority === option.value ? { color: PRIORITY_COLOR[option.value] } : undefined}
                    onClick={() => updateTask(task.id, { priority: option.value })}
                  >
                    {option.value > 0 && (
                      <i className="dot" style={{ background: PRIORITY_COLOR[option.value] }} />
                    )}
                    {option.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="detail-row">
              <span className="row-label">
                <Icon name="list" size={17} />
                清单
              </span>
              <label className="select-wrap">
                <span className="dot" style={{ background: list?.color || '#8B95A7' }} />
                <select
                  value={task.listId}
                  onChange={(event) => updateTask(task.id, { listId: event.target.value })}
                >
                  {lists.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
                <Icon name="chevron-down" size={14} />
              </label>
            </div>

            <div className="detail-row">
              <span className="row-label">
                <Icon name="repeat" size={17} />
                重复
              </span>
              <label className="select-wrap">
                <select
                  value={task.repeat || ''}
                  onChange={(event) =>
                    updateTask(task.id, { repeat: (event.target.value || null) as Repeat | null })
                  }
                >
                  {REPEAT_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <Icon name="chevron-down" size={14} />
              </label>
            </div>

            <div className="detail-row">
              <span className="row-label">
                <Icon name="bell" size={17} />
                提醒
              </span>
              {task.due === null ? (
                <span className="reminder-hint">设置日期后可提醒</span>
              ) : (
                <label className="select-wrap">
                  <select
                    value={task.reminder === null || task.reminder === undefined ? '' : String(task.reminder)}
                    onChange={(event) => {
                      const raw = event.target.value
                      const next = raw === '' ? null : Number(raw)
                      updateTask(task.id, { reminder: next })
                      if (next !== null) void ensureNotificationPermission()
                    }}
                  >
                    <option value="">不提醒</option>
                    <option value="0">{task.allDay ? '当天 09:00' : '准时'}</option>
                    <option value="5">提前 5 分钟</option>
                    <option value="15">提前 15 分钟</option>
                    <option value="30">提前 30 分钟</option>
                    <option value="60">提前 1 小时</option>
                    <option value="1440">提前 1 天</option>
                    {task.reminder !== null &&
                      task.reminder !== undefined &&
                      ![0, 5, 15, 30, 60, 1440].includes(task.reminder) && (
                        <option value={String(task.reminder)}>{formatReminder(task.reminder)}</option>
                      )}
                  </select>
                  <Icon name="chevron-down" size={14} />
                </label>
              )}
            </div>

            <div className="detail-row tags-row">
              <span className="row-label">
                <Icon name="tag" size={17} />
                标签
              </span>
              <div className="row-value tags-value">
                {task.tags.map((tag) => (
                  <span className="chip removable" key={tag}>
                    #{tag}
                    <button
                      aria-label={`移除标签 ${tag}`}
                      onClick={() => updateTask(task.id, { tags: task.tags.filter((t) => t !== tag) })}
                    >
                      <Icon name="x" size={11} />
                    </button>
                  </span>
                ))}
                <input
                  className="tag-input"
                  value={tagInput}
                  placeholder={task.tags.length ? '添加' : '添加标签'}
                  onChange={(event) => setTagInput(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ',' || event.key === '，') {
                      event.preventDefault()
                      addTag()
                    }
                  }}
                  onBlur={addTag}
                />
              </div>
            </div>
          </div>

          <section className="subtasks">
            <header className="subtasks-head">
              <h4>
                子任务
                {task.subtasks.length > 0 && (
                  <span className="sub-count">
                    {doneSubs}/{task.subtasks.length}
                  </span>
                )}
              </h4>
              <button className="ai-text-btn" onClick={runBreakdown} disabled={aiBusy}>
                <Icon name="sparkles" size={14} />
                {aiBusy ? '拆解中…' : 'AI 拆解'}
              </button>
            </header>

            {task.subtasks.length > 0 && (
              <div className="sub-list">
                {task.subtasks.map((sub) => (
                  <div className={cls('sub-item', sub.done && 'done')} key={sub.id}>
                    <button
                      className="sub-check"
                      onClick={() => toggleSubtask(task.id, sub.id)}
                      aria-label={sub.done ? '取消完成' : '完成子任务'}
                    >
                      <Icon name="check" size={11} strokeWidth={3} />
                    </button>
                    <span>{sub.title}</span>
                    <button
                      className="sub-del"
                      onClick={() => deleteSubtask(task.id, sub.id)}
                      aria-label="删除子任务"
                    >
                      <Icon name="x" size={13} />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div className="sub-add">
              <Icon name="plus" size={15} />
              <input
                value={subInput}
                placeholder="添加子任务，回车确认"
                onChange={(event) => setSubInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
                    event.preventDefault()
                    submitSubtask()
                  }
                }}
              />
            </div>
            {aiError && <p className="detail-error">{aiError}</p>}
          </section>

          <footer className="detail-foot">
            <p>
              创建于 {formatDateTime(task.createdAt)}
              {task.completedAt ? ` · 完成于 ${formatDateTime(task.completedAt)}` : ''}
            </p>
            <button
              className={cls('danger-link', confirmDel && 'confirm')}
              onClick={() => {
                if (!confirmDel) {
                  setConfirmDel(true)
                  window.setTimeout(() => setConfirmDel(false), 3500)
                  return
                }
                deleteTask(task.id)
              }}
            >
              <Icon name="trash" size={14} />
              {confirmDel ? '再次点击确认删除' : '删除任务'}
            </button>
          </footer>
        </div>
      </aside>
    </>
  )
}

function DateEditor({
  due,
  allDay,
  onChange,
  onClose
}: {
  due: number | null
  allDay: boolean
  onChange: (due: number | null, allDay: boolean) => void
  onClose: () => void
}) {
  const [dateStr, setDateStr] = useState(due ? dayKey(due) : dayKey(Date.now()))
  const [timeStr, setTimeStr] = useState(due && !allDay ? formatTime(due) : '09:00')
  const [isAllDay, setIsAllDay] = useState(allDay || due === null)

  useEffect(() => {
    setDateStr(due ? dayKey(due) : dayKey(Date.now()))
    setTimeStr(due && !allDay ? formatTime(due) : '09:00')
    setIsAllDay(allDay || due === null)
  }, [due, allDay])

  const apply = (nextDate = dateStr, nextTime = timeStr, nextAllDay = isAllDay) => {
    if (!nextDate) {
      onChange(null, true)
      return
    }
    const base = parseDayKey(nextDate)
    if (nextAllDay) {
      onChange(startOfDay(base), true)
      return
    }
    const [h, m] = nextTime.split(':').map(Number)
    onChange(base + (h || 0) * 3600000 + (m || 0) * 60000, false)
  }

  const quick = (offset: number) => {
    const next = dayKey(addDays(Date.now(), offset))
    setDateStr(next)
    apply(next)
  }

  return (
    <div className="date-editor">
      <div className="date-inputs">
        <input
          type="date"
          value={dateStr}
          onChange={(event) => {
            setDateStr(event.target.value)
            apply(event.target.value)
          }}
          aria-label="日期"
        />
        <input
          type="time"
          value={timeStr}
          disabled={isAllDay}
          onChange={(event) => {
            setTimeStr(event.target.value)
            apply(dateStr, event.target.value)
          }}
          aria-label="时间"
        />
        <label className="switch">
          <input
            type="checkbox"
            checked={isAllDay}
            onChange={(event) => {
              setIsAllDay(event.target.checked)
              apply(dateStr, timeStr, event.target.checked)
            }}
          />
          <span className="switch-track" />
        </label>
        <span className="switch-label">全天</span>
      </div>
      <div className="date-quick">
        <button onClick={() => quick(0)}>今天</button>
        <button onClick={() => quick(1)}>明天</button>
        <button
          onClick={() => {
            const d = new Date()
            const offset = ((8 - d.getDay()) % 7) || 7
            quick(offset)
          }}
        >
          下周一
        </button>
        <button
          onClick={() => {
            onChange(null, true)
            onClose()
          }}
        >
          清除
        </button>
      </div>
    </div>
  )
}
