import { useState } from 'react'
import type { CSSProperties } from 'react'
import { useApp } from '../store'
import { deleteTask, openTask, requestQuickAdd, toast, toggleTask, updateTask } from '../actions'
import { PRIORITY_COLOR, sortByPlan, sortedLists } from '../lib/selectors'
import { formatDue, startOfDay } from '../lib/date'
import type { TaskList } from '../types'
import { Icon } from './Icons'
import { cls } from '../lib/utils'

export function BoardView() {
  const state = useApp()
  const lists = sortedLists(state)
  const [dragId, setDragId] = useState<string | null>(null)
  const [overList, setOverList] = useState<string | null>(null)

  const active = Object.values(state.data.tasks).filter((task) => !task.deletedAt && !task.completed)
  const todayStart = startOfDay(Date.now())

  const drop = (list: TaskList) => {
    if (!dragId) return
    const task = state.data.tasks[dragId]
    if (task && task.listId !== list.id) {
      updateTask(dragId, { listId: list.id })
      toast(`已移动到「${list.name}」`, 'success')
    }
    setDragId(null)
    setOverList(null)
  }

  return (
    <div className="board-view">
      <p className="board-hint">
        <Icon name="kanban" size={14} />
        桌面端可以直接拖动卡片切换清单；手机上可在任务详情里修改清单。
      </p>

      <div className="board">
        {lists.map((list) => {
          const items = active.filter((task) => task.listId === list.id).sort(sortByPlan)
          return (
            <section
              key={list.id}
              className={cls('board-col', overList === list.id && 'over')}
              style={{ '--list-color': list.color } as CSSProperties}
              onDragOver={(event) => {
                event.preventDefault()
                event.dataTransfer.dropEffect = 'move'
                if (overList !== list.id) setOverList(list.id)
              }}
              onDragLeave={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
                  setOverList((current) => (current === list.id ? null : current))
                }
              }}
              onDrop={(event) => {
                event.preventDefault()
                drop(list)
              }}
            >
              <header className="board-head">
                <span className="dot" style={{ background: list.color }} />
                <span className="board-name">{list.name}</span>
                <span className="board-count">{items.length}</span>
                <button
                  className="icon-btn tiny"
                  onClick={() => requestQuickAdd(null, list.id)}
                  aria-label={`在 ${list.name} 中添加任务`}
                >
                  <Icon name="plus" size={15} />
                </button>
              </header>

              <div className="board-cards">
                {items.map((task) => (
                  <article
                    key={task.id}
                    className={cls('board-card', dragId === task.id && 'dragging')}
                    draggable
                    onDragStart={(event) => {
                      event.dataTransfer.setData('text/plain', task.id)
                      event.dataTransfer.effectAllowed = 'move'
                      setDragId(task.id)
                    }}
                    onDragEnd={() => {
                      setDragId(null)
                      setOverList(null)
                    }}
                    onClick={() => openTask(task.id)}
                  >
                    <div className="board-card-top">
                      <button
                        className="task-check"
                        style={{ '--pc': PRIORITY_COLOR[task.priority] } as CSSProperties}
                        onClick={(event) => {
                          event.stopPropagation()
                          toggleTask(task.id)
                        }}
                        aria-label="完成任务"
                      >
                        <Icon name="check" size={12} strokeWidth={3} />
                      </button>
                      <span className="board-card-title">{task.title}</span>
                      <button
                        type="button"
                        className="row-action danger board-card-del"
                        aria-label="删除任务"
                        title="删除任务"
                        onClick={(event) => {
                          event.stopPropagation()
                          deleteTask(task.id)
                        }}
                      >
                        <Icon name="trash" size={13} />
                      </button>
                    </div>

                    {task.notes.trim() && (
                      <p className="board-card-note" title={task.notes.trim()}>
                        {task.notes.trim()}
                      </p>
                    )}

                    {(task.due !== null || task.tags.length > 0 || task.subtasks.length > 0) && (
                      <div className="board-card-meta">
                        {task.due !== null && (
                          <span className={cls('board-due', task.due < todayStart && 'overdue')}>
                            <Icon name={task.due < todayStart ? 'clock' : 'calendar'} size={11} />
                            {formatDue(task.due, task.allDay)}
                          </span>
                        )}
                        {task.tags.slice(0, 2).map((tag) => (
                          <span className="chip tiny" key={tag}>
                            #{tag}
                          </span>
                        ))}
                        {task.subtasks.length > 0 && (
                          <span className="chip tiny">
                            <Icon name="check-circle" size={10} />
                            {task.subtasks.filter((subtask) => subtask.done).length}/{task.subtasks.length}
                          </span>
                        )}
                        {task.priority > 0 && (
                          <Icon
                            name="flag"
                            size={12}
                            style={{ color: PRIORITY_COLOR[task.priority] }}
                          />
                        )}
                      </div>
                    )}
                  </article>
                ))}

                {items.length === 0 && (
                  <div className="board-empty">
                    <Icon name="plus" size={14} />
                    拖动任务到这里，或点击右上角添加
                  </div>
                )}
              </div>
            </section>
          )
        })}
      </div>
    </div>
  )
}
