import { useState } from 'react'
import { useApp } from '../store'
import { addTask, toast } from '../actions'
import { aiConfigured, aiExtractTasks, AiError } from '../lib/ai'
import type { AiExtractedTask } from '../lib/ai'
import { formatDue } from '../lib/date'
import { PRIORITY_COLOR, listMap } from '../lib/selectors'
import { Modal } from './Modal'
import { Icon } from './Icons'
import { cls } from '../lib/utils'

interface Props {
  onClose: () => void
  onOpenSettings: () => void
}

export function ExtractTasksModal({ onClose, onOpenSettings }: Props) {
  const state = useApp()
  const lists = listMap(state)
  const [text, setText] = useState('')
  const [items, setItems] = useState<AiExtractedTask[] | null>(null)
  const [selected, setSelected] = useState<boolean[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const configured = aiConfigured()

  const selectedCount = selected.filter(Boolean).length

  const run = async () => {
    if (busy) return
    if (!text.trim()) {
      setError('请先粘贴一段文本')
      return
    }
    setBusy(true)
    setError('')
    try {
      const extracted = await aiExtractTasks(text)
      setItems(extracted)
      setSelected(extracted.map(() => true))
      if (!extracted.length) setError('没有从文本里找到可执行的任务，可以补充更明确的待办')
    } catch (err) {
      setError(err instanceof AiError ? err.message : '提取失败，请稍后再试')
    } finally {
      setBusy(false)
    }
  }

  const toggle = (index: number) => {
    setSelected((prev) => prev.map((value, i) => (i === index ? !value : value)))
  }

  const addSelected = () => {
    if (!items) return
    let count = 0
    items.forEach((item, index) => {
      if (!selected[index]) return
      addTask({
        title: item.title,
        listId: item.listId,
        due: item.due,
        allDay: item.allDay,
        priority: item.priority,
        tags: item.tags,
        notes: item.notes,
        subtasks: item.subtasks,
        aiCreated: true
      })
      count++
    })
    if (count) {
      toast(`已添加 ${count} 个任务`, 'success')
      onClose()
    } else {
      setError('至少选择一个任务')
    }
  }

  return (
    <Modal
      title="从文本提取任务"
      subtitle="粘贴会议纪要、聊天记录或一段待办，AI 会拆成可执行任务"
      size="lg"
      onClose={onClose}
      footer={
        items ? (
          <>
            <button className="btn ghost" onClick={() => setItems(null)}>
              返回修改
            </button>
            <button className="btn primary" onClick={addSelected} disabled={!selectedCount}>
              添加选中任务{selectedCount ? ` · ${selectedCount}` : ''}
            </button>
          </>
        ) : (
          <>
            <button className="btn ghost" onClick={onClose}>
              取消
            </button>
            <button className="btn primary" onClick={() => void run()} disabled={busy || !configured}>
              {busy ? '提取中…' : '提取任务'}
            </button>
          </>
        )
      }
    >
      {!configured && (
        <div className="extract-banner">
          <Icon name="info" size={15} />
          <span>从长文本提取任务需要先配置 AI 模型。</span>
          <button onClick={onOpenSettings}>去配置</button>
        </div>
      )}

      {!items ? (
        <>
          <textarea
            className="extract-textarea"
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder={'例如：\n下周三前把 Q4 复盘初稿发给团队；周五上午 10 点和设计确认改版方案；记得给新同事开通权限。'}
            rows={7}
            maxLength={6000}
            autoFocus
          />
          <p className="extract-hint">
            支持识别负责人、时间和优先级；提取结果会先预览，取消勾选就不会添加。
          </p>
        </>
      ) : (
        <>
          <div className="extract-summary">
            提取到 <b>{items.length}</b> 个任务，已全选，取消不需要的即可。
          </div>
          <div className="extract-list">
            {items.map((item, index) => {
              const list = item.listId ? lists[item.listId] : null
              return (
                <div className={cls('extract-item', !selected[index] && 'off')} key={`${item.title}-${index}`}>
                  <button
                    className={cls('extract-check', selected[index] && 'on')}
                    onClick={() => toggle(index)}
                    aria-label={selected[index] ? '取消选择' : '选择任务'}
                  >
                    <Icon name="check" size={12} strokeWidth={3} />
                  </button>
                  <div className="extract-main">
                    <div className="extract-title">{item.title}</div>
                    <div className="extract-meta">
                      {item.due !== null && (
                        <span className="chip">
                          <Icon name="calendar" size={11} />
                          {formatDue(item.due, item.allDay)}
                        </span>
                      )}
                      {item.priority > 0 && (
                        <span className="chip" style={{ color: PRIORITY_COLOR[item.priority] }}>
                          <Icon name="flag" size={11} />
                          {item.priority === 5 ? '高' : item.priority === 3 ? '中' : '低'}优先级
                        </span>
                      )}
                      {list && (
                        <span className="chip">
                          <i className="dot" style={{ background: list.color }} />
                          {list.name}
                        </span>
                      )}
                      {item.tags.map((tag) => (
                        <span className="chip" key={tag}>
                          #{tag}
                        </span>
                      ))}
                      {item.subtasks.length > 0 && (
                        <span className="chip">
                          <Icon name="check-circle" size={11} />
                          {item.subtasks.length} 个子任务
                        </span>
                      )}
                    </div>
                    {item.notes && <p className="extract-notes">{item.notes}</p>}
                  </div>
                </div>
              )
            })}
          </div>
        </>
      )}

      {error && <p className="extract-error">{error}</p>}
    </Modal>
  )
}
