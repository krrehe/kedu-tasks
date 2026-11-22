import { useState } from 'react'
import { useApp } from '../store'
import { addFilter, deleteFilter, openFilter, toast, updateFilter } from '../actions'
import { LIST_COLORS } from '../seed'
import { sortedLists } from '../lib/selectors'
import { aiConfigured, aiGenerateFilter } from '../lib/ai'
import type { FilterDue, Priority } from '../types'
import { Modal } from './Modal'
import { Icon } from './Icons'
import { cls } from '../lib/utils'

const DUE_OPTIONS: Array<{ value: FilterDue; label: string }> = [
  { value: 'any', label: '任意时间' },
  { value: 'today', label: '今天到期' },
  { value: 'week', label: '最近 7 天' },
  { value: 'overdue', label: '已逾期' },
  { value: 'none', label: '没有日期' }
]

const PRIORITY_CHOICES: Array<{ value: Priority; label: string; color: string }> = [
  { value: 5, label: '高', color: '#F04438' },
  { value: 3, label: '中', color: '#F5A524' },
  { value: 1, label: '低', color: '#4C6FFF' },
  { value: 0, label: '无', color: '#C4CAD6' }
]

interface Props {
  filterId: string | null
  onClose: () => void
}

export function FilterEditor({ filterId, onClose }: Props) {
  const state = useApp()
  const existing = filterId ? state.data.filters[filterId] : null
  const lists = sortedLists(state)
  const tags = Array.from(
    new Set(
      Object.values(state.data.tasks)
        .filter((task) => !task.deletedAt)
        .flatMap((task) => task.tags)
    )
  ).slice(0, 12)

  const [name, setName] = useState(existing?.name || '')
  const [color, setColor] = useState(existing?.color || LIST_COLORS[0])
  const [due, setDue] = useState<FilterDue>(existing?.due || 'any')
  const [priorities, setPriorities] = useState<Priority[]>(existing?.priorities || [])
  const [tag, setTag] = useState(existing?.tag || '')
  const [listId, setListId] = useState(existing?.listId || '')
  const [search, setSearch] = useState(existing?.search || '')
  const [includeCompleted, setIncludeCompleted] = useState(existing?.includeCompleted || false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [error, setError] = useState('')
  const [aiText, setAiText] = useState('')
  const [aiBusy, setAiBusy] = useState(false)
  const [aiError, setAiError] = useState('')

  const generate = async () => {
    if (aiBusy || !aiText.trim()) return
    if (!aiConfigured()) {
      setAiError('请先在设置里配置 AI 模型')
      return
    }
    setAiBusy(true)
    setAiError('')
    try {
      const draft = await aiGenerateFilter(aiText)
      setName(draft.name)
      setDue(draft.due)
      setPriorities(draft.priorities)
      setTag(draft.tag)
      setListId(draft.listId || '')
      setSearch(draft.search)
      setIncludeCompleted(draft.includeCompleted)
      toast('筛选条件已生成，可以继续调整', 'success')
    } catch (err) {
      setAiError((err as Error).message)
    } finally {
      setAiBusy(false)
    }
  }

  const togglePriority = (priority: Priority) => {
    setPriorities((prev) =>
      prev.includes(priority) ? prev.filter((item) => item !== priority) : [...prev, priority]
    )
  }

  const save = () => {
    if (!name.trim()) {
      setError('给筛选器起个名字')
      return
    }
    const payload = {
      name: name.trim(),
      color,
      due,
      priorities,
      tag: tag.trim().replace(/^#/, ''),
      listId: listId || null,
      search: search.trim(),
      includeCompleted
    }
    if (existing) {
      updateFilter(existing.id, payload)
      toast('筛选器已更新', 'success')
      onClose()
    } else {
      const created = addFilter(payload)
      toast('筛选器已创建', 'success')
      onClose()
      openFilter(created.id)
    }
  }

  return (
    <Modal
      title={existing ? '编辑智能筛选' : '新建智能筛选'}
      subtitle="把常用的筛选条件保存下来，随时一键查看"
      size="lg"
      onClose={onClose}
      footer={
        <>
          {existing && (
            <button
              className="btn danger-ghost"
              style={{ marginRight: 'auto' }}
              onClick={() => {
                if (!confirmDelete) {
                  setConfirmDelete(true)
                  return
                }
                deleteFilter(existing.id)
                onClose()
              }}
            >
              <Icon name="trash" size={14} />
              {confirmDelete ? '再次点击确认删除' : '删除筛选'}
            </button>
          )}
          <button className="btn ghost" onClick={onClose}>
            取消
          </button>
          <button className="btn primary" onClick={save}>
            保存
          </button>
        </>
      }
    >
      <div className="filter-form">
        <div className="ai-filter-box">
          <div className="ai-filter-title">
            <Icon name="sparkles" size={14} />
            用一句话生成筛选
          </div>
          <div className="ai-filter-row">
            <input
              value={aiText}
              placeholder="例如：本周高优先级、还没安排时间的任务"
              onChange={(event) => setAiText(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault()
                  void generate()
                }
              }}
            />
            <button
              type="button"
              className="btn primary small"
              onClick={() => void generate()}
              disabled={aiBusy || !aiText.trim()}
            >
              {aiBusy ? '生成中…' : '生成'}
            </button>
          </div>
          {aiError && <p className="extract-error">{aiError}</p>}
        </div>

        <label className="field">
          <span>名称</span>
          <input
            autoFocus
            value={name}
            maxLength={20}
            placeholder="例如：本周重点"
            onChange={(event) => setName(event.target.value)}
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
          <span>日期范围</span>
          <select value={due} onChange={(event) => setDue(event.target.value as FilterDue)}>
            {DUE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <div className="field">
          <span>优先级（不选表示全部）</span>
          <div className="choice-row">
            {PRIORITY_CHOICES.map((choice) => (
              <button
                key={choice.value}
                type="button"
                className={cls('choice-chip', priorities.includes(choice.value) && 'on')}
                style={
                  priorities.includes(choice.value)
                    ? { borderColor: choice.color, color: choice.color, background: `${choice.color}14` }
                    : undefined
                }
                onClick={() => togglePriority(choice.value)}
              >
                <i className="dot" style={{ background: choice.color }} />
                {choice.label}
              </button>
            ))}
          </div>
        </div>

        <label className="field">
          <span>清单</span>
          <select value={listId} onChange={(event) => setListId(event.target.value)}>
            <option value="">全部清单</option>
            {lists.map((list) => (
              <option key={list.id} value={list.id}>
                {list.name}
              </option>
            ))}
          </select>
        </label>

        <label className="field">
          <span>标签</span>
          <input
            value={tag}
            placeholder="例如：设计（留空表示全部）"
            onChange={(event) => setTag(event.target.value)}
          />
        </label>

        {tags.length > 0 && (
          <div className="tag-suggestions">
            {tags.map((item) => (
              <button
                key={item}
                type="button"
                className="chip clickable"
                onClick={() => setTag(item)}
              >
                #{item}
              </button>
            ))}
          </div>
        )}

        <label className="field">
          <span>关键词</span>
          <input
            value={search}
            placeholder="匹配标题、备注或标签"
            onChange={(event) => setSearch(event.target.value)}
          />
        </label>

        <div className="settings-row">
          <div>
            <span className="settings-label">包含已完成任务</span>
            <p className="settings-desc">默认只显示未完成的任务</p>
          </div>
          <label className="switch">
            <input
              type="checkbox"
              checked={includeCompleted}
              onChange={(event) => setIncludeCompleted(event.target.checked)}
            />
            <span className="switch-track" />
          </label>
        </div>

        {error && <p className="extract-error">{error}</p>}
      </div>
    </Modal>
  )
}
