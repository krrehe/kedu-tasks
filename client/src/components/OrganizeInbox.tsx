import { useEffect, useState } from 'react'
import { useApp } from '../store'
import { toast, updateTask } from '../actions'
import { aiConfigured, aiOrganizeTasks, AiError } from '../lib/ai'
import type { AiOrganizeItem } from '../lib/ai'
import { INBOX_ID } from '../seed'
import { PRIORITY_COLOR, PRIORITY_LABEL, listMap } from '../lib/selectors'
import { Modal } from './Modal'
import { Icon } from './Icons'
import { cls } from '../lib/utils'
import type { Task } from '../types'

export function OrganizeInbox({ onClose }: { onClose: () => void }) {
  const state = useApp()
  const lists = listMap(state)
  const inboxTasks = Object.values(state.data.tasks).filter(
    (task) => !task.deletedAt && !task.completed && task.listId === INBOX_ID
  )
  const [items, setItems] = useState<AiOrganizeItem[] | null>(null)
  const [selected, setSelected] = useState<Record<string, boolean>>({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const configured = aiConfigured()

  const analyze = async () => {
    if (busy) return
    if (!inboxTasks.length) {
      setError('收件箱是空的，没有需要整理的任务')
      return
    }
    setBusy(true)
    setError('')
    try {
      const result = await aiOrganizeTasks(inboxTasks)
      setItems(result)
      setSelected(Object.fromEntries(result.map((item) => [item.taskId, true])))
    } catch (err) {
      setError(err instanceof AiError ? err.message : '整理失败，请稍后再试')
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => {
    if (configured) void analyze()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const taskOf = (id: string): Task | undefined => state.data.tasks[id]
  const selectedCount = items ? items.filter((item) => selected[item.taskId]).length : 0

  const apply = () => {
    if (!items) return
    let changed = 0
    for (const item of items) {
      if (!selected[item.taskId]) continue
      const task = taskOf(item.taskId)
      if (!task) continue
      const patch: Partial<Task> = {}
      if (item.listId && item.listId !== task.listId) patch.listId = item.listId
      if (item.priority !== task.priority) patch.priority = item.priority
      const merged = Array.from(new Set([...task.tags, ...item.tags])).slice(0, 8)
      if (item.tags.some((tag) => !task.tags.includes(tag))) patch.tags = merged
      if (Object.keys(patch).length) {
        updateTask(task.id, patch)
        changed++
      }
    }
    toast(
      changed ? `已整理 ${changed} 个任务` : '没有需要修改的任务',
      changed ? 'success' : 'default'
    )
    onClose()
  }

  return (
    <Modal
      title="AI 整理收件箱"
      subtitle="把收件箱里的任务归入合适的清单，并补全优先级和标签"
      size="lg"
      onClose={onClose}
      footer={
        <>
          <button className="btn ghost" onClick={onClose}>
            取消
          </button>
          <button className="btn" onClick={() => void analyze()} disabled={busy}>
            <Icon name="refresh" size={14} />
            {items ? '重新分析' : '开始分析'}
          </button>
          {items && (
            <button className="btn primary" onClick={apply} disabled={!selectedCount}>
              应用选中 · {selectedCount}
            </button>
          )}
        </>
      }
    >
      {!configured && (
        <div className="extract-banner">
          <Icon name="info" size={15} />
          <span>需要先在设置中配置 AI 模型。</span>
        </div>
      )}

      {busy && !items && (
        <div className="organize-loading">
          <span className="typing">
            <i />
            <i />
            <i />
          </span>
          正在阅读收件箱…
        </div>
      )}

      {error && <p className="extract-error">{error}</p>}

      {!busy && !items && !error && (
        <p className="organize-hint">
          收件箱里有 <b>{inboxTasks.length}</b> 个任务。AI 会建议每个任务应该放进哪个清单，并补全优先级和标签，
          确认后才会应用。
        </p>
      )}

      {items && (
        <>
          <div className="extract-summary">
            分析完成，检查后点击「应用选中」。取消勾选的任务不会被修改。
          </div>
          <div className="extract-list">
            {items.map((item) => {
              const task = taskOf(item.taskId)
              if (!task) return null
              const targetList = item.listId ? lists[item.listId] : null
              const listChanged = targetList && targetList.id !== task.listId
              const priorityChanged = item.priority !== task.priority
              const newTags = item.tags.filter((tag) => !task.tags.includes(tag))
              const unchanged = !listChanged && !priorityChanged && newTags.length === 0
              return (
                <div
                  className={cls('extract-item', !selected[item.taskId] && 'off')}
                  key={item.taskId}
                >
                  <button
                    className={cls('extract-check', selected[item.taskId] && 'on')}
                    onClick={() =>
                      setSelected((prev) => ({
                        ...prev,
                        [item.taskId]: !prev[item.taskId]
                      }))
                    }
                    aria-label="选择任务"
                  >
                    <Icon name="check" size={12} strokeWidth={3} />
                  </button>

                  <div className="extract-main">
                    <div className="extract-title">{task.title}</div>
                    <div className="organize-suggestions">
                      {listChanged && targetList ? (
                        <span className="chip">
                          <i className="dot" style={{ background: targetList.color }} />
                          {lists[task.listId]?.name || '收件箱'} → {targetList.name}
                        </span>
                      ) : null}
                      {priorityChanged && (
                        <span className="chip" style={{ color: PRIORITY_COLOR[item.priority] }}>
                          <Icon name="flag" size={11} />
                          {PRIORITY_LABEL[item.priority]}
                        </span>
                      )}
                      {newTags.map((tag) => (
                        <span className="chip" key={tag}>
                          #{tag}
                        </span>
                      ))}
                      {unchanged && <span className="chip">保持当前分类</span>}
                    </div>
                    {item.reason && <p className="extract-notes">{item.reason}</p>}
                  </div>
                </div>
              )
            })}
          </div>
        </>
      )}

      {items && items.length < inboxTasks.length && (
        <p className="settings-note">部分任务没有返回建议，将保持原样。</p>
      )}
    </Modal>
  )
}
