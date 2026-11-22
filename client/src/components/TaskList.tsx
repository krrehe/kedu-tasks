import { useState } from 'react'
import type { CSSProperties } from 'react'
import type { Task, TaskList, TaskSort } from '../types'
import type { TaskGroup } from '../lib/selectors'
import { useApp } from '../store'
import { PRIORITY_COLOR } from '../lib/selectors'
import { formatDue, startOfDay } from '../lib/date'
import { deleteTask, toggleSubtask, toggleTask } from '../actions'
import { Icon } from './Icons'
import type { IconName } from './Icons'
import { cls } from '../lib/utils'

interface TaskRowProps {
  task: Task
  list?: TaskList
  showList?: boolean
  onSelect: (id: string) => void
}

export function TaskRow({ task, list, showList, onSelect }: TaskRowProps) {
  const [expanded, setExpanded] = useState(false)
  const overdue = task.due !== null && !task.completed && task.due < startOfDay(Date.now())
  const subDone = task.subtasks.filter((s) => s.done).length
  const notes = task.notes.trim()
  const hasDetail = !!notes || task.subtasks.length > 0

  return (
    <div
      className={cls('task-row', task.completed && 'done')}
      role="button"
      tabIndex={0}
      onClick={() => onSelect(task.id)}
      onKeyDown={(event) => {
        if (event.target !== event.currentTarget) return
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          onSelect(task.id)
        }
      }}
    >
      <button
        className="task-check"
        style={{ '--pc': PRIORITY_COLOR[task.priority] } as CSSProperties}
        aria-label={task.completed ? '标记为未完成' : '标记为完成'}
        onClick={(event) => {
          event.stopPropagation()
          toggleTask(task.id)
        }}
      >
        <Icon name="check" size={13} strokeWidth={3.2} />
      </button>

      <div className="task-main">
        <div className="task-title">{task.title}</div>

        {notes && !expanded && (
          <p className="task-note-preview" title={notes}>
            <Icon name="note" size={11} />
            <span>{notes}</span>
          </p>
        )}

        {(task.due !== null ||
          task.repeat ||
          task.estimate ||
          task.subtasks.length > 0 ||
          task.tags.length > 0 ||
          showList) && (
          <div className="task-sub">
            {task.due !== null && (
              <span className={cls('task-due', overdue && 'overdue')}>
                <Icon name={overdue ? 'clock' : 'calendar'} size={12} />
                {formatDue(task.due, task.allDay)}
                {task.reminder !== null && task.reminder !== undefined && (
                  <Icon name="bell" size={11} />
                )}
              </span>
            )}
            {task.repeat && (
              <span className="task-meta-item">
                <Icon name="repeat" size={12} />
                重复
              </span>
            )}
            {task.estimate ? (
              <span className="task-meta-item">
                <Icon name="timer" size={12} />
                {task.estimate}m
              </span>
            ) : null}
            {task.subtasks.length > 0 && (
              <span className="task-meta-item">
                <Icon name="check-circle" size={12} />
                {subDone}/{task.subtasks.length}
              </span>
            )}
            {showList && list && (
              <span className="task-meta-item">
                <i className="dot" style={{ background: list.color }} />
                {list.name}
              </span>
            )}
            {task.tags.map((tag) => (
              <span className="chip tiny" key={tag}>
                #{tag}
              </span>
            ))}
            {task.aiCreated && (
              <span className="chip tiny ai">
                <Icon name="sparkles" size={10} />
                AI
              </span>
            )}
          </div>
        )}

        {expanded && hasDetail && (
          <div className="task-expand" onClick={(event) => event.stopPropagation()}>
            {notes && (
              <div className="task-note-full">
                <Icon name="note" size={12} />
                <p>{notes}</p>
              </div>
            )}
            {task.subtasks.length > 0 && (
              <div className="task-expand-subs">
                {task.subtasks.map((sub) => (
                  <button
                    key={sub.id}
                    type="button"
                    className={cls('task-sub-row', sub.done && 'done')}
                    onClick={() => toggleSubtask(task.id, sub.id)}
                  >
                    <span className="task-sub-check">
                      <Icon name="check" size={9} strokeWidth={3.2} />
                    </span>
                    <span>{sub.title}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="task-actions">
        {task.priority > 0 && (
          <span className="task-flag" style={{ color: PRIORITY_COLOR[task.priority] }} title="优先级">
            <Icon name="flag" size={15} />
          </span>
        )}
        {hasDetail && (
          <button
            type="button"
            className="row-action"
            aria-label={expanded ? '收起备注和子任务' : '展开备注和子任务'}
            aria-expanded={expanded}
            title={expanded ? '收起' : '查看备注和子任务'}
            onClick={(event) => {
              event.stopPropagation()
              setExpanded((value) => !value)
            }}
          >
            <Icon name={expanded ? 'chevron-up' : 'chevron-down'} size={15} />
          </button>
        )}
        <button
          type="button"
          className="row-action danger"
          aria-label="删除任务"
          title="删除任务"
          onClick={(event) => {
            event.stopPropagation()
            deleteTask(task.id)
          }}
        >
          <Icon name="trash" size={14} />
        </button>
      </div>
    </div>
  )
}

interface EmptyStateProps {
  title: string
  hint: string
  icon?: IconName
}

export function EmptyState({ title, hint, icon = 'check-circle' }: EmptyStateProps) {
  return (
    <div className="empty">
      <div className="empty-visual">
        <div className="empty-art" aria-hidden="true">
          <svg viewBox="0 0 200 140" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect x="38" y="18" width="116" height="100" rx="18" fill="var(--accent-soft)" />
            <rect x="58" y="38" width="44" height="7" rx="3.5" fill="var(--accent)" opacity=".28" />
            <rect x="58" y="54" width="78" height="7" rx="3.5" fill="var(--accent)" opacity=".15" />
            <rect x="58" y="70" width="52" height="7" rx="3.5" fill="var(--accent)" opacity=".15" />
            <rect x="58" y="86" width="66" height="7" rx="3.5" fill="var(--accent)" opacity=".15" />
            <circle cx="44" cy="30" r="4" fill="var(--accent)" opacity=".3" />
            <circle cx="168" cy="34" r="3" fill="var(--accent)" opacity=".22" />
          </svg>
        </div>
        <span className="empty-badge">
          <Icon name={icon} size={15} />
        </span>
      </div>
      <p className="empty-title">{title}</p>
      <p className="empty-hint">{hint}</p>
    </div>
  )
}

interface TaskSectionsProps {
  groups: TaskGroup[]
  emptyTitle: string
  emptyHint: string
  lists: Record<string, TaskList>
  showList?: boolean
  onSelect: (id: string) => void
}

function sortTasks(tasks: Task[], sort: TaskSort): Task[] {
  if (sort === 'default') return tasks
  const copy = tasks.slice()
  if (sort === 'due') {
    copy.sort(
      (a, b) =>
        (a.due ?? Number.MAX_SAFE_INTEGER) - (b.due ?? Number.MAX_SAFE_INTEGER) ||
        b.priority - a.priority
    )
  } else if (sort === 'priority') {
    copy.sort(
      (a, b) =>
        b.priority - a.priority ||
        (a.due ?? Number.MAX_SAFE_INTEGER) - (b.due ?? Number.MAX_SAFE_INTEGER)
    )
  } else {
    copy.sort((a, b) => b.createdAt - a.createdAt)
  }
  return copy
}

export function TaskSections({ groups, emptyTitle, emptyHint, lists, showList, onSelect }: TaskSectionsProps) {
  const sort = useApp().settings.taskSort
  if (!groups.length) return <EmptyState title={emptyTitle} hint={emptyHint} icon="sun" />

  return (
    <div className="task-sections">
      {groups.map((group) => (
        <section key={group.key} className="task-section">
          <header className="section-head">
            <span className={cls('section-label', group.tone === 'danger' && 'danger')}>{group.label}</span>
            <span className="section-line" />
          </header>
          {sortTasks(group.tasks, sort).map((task) => (
            <TaskRow
              key={task.id}
              task={task}
              list={lists[task.listId]}
              showList={showList}
              onSelect={onSelect}
            />
          ))}
        </section>
      ))}
    </div>
  )
}
