import { useEffect, useState } from 'react'
import { setUI, updateSettings, useApp } from '../store'
import { viewTitle } from '../lib/selectors'
import { clearCompletedTasks, deleteList, navigate, toast, updateList } from '../actions'
import { aiConfigured } from '../lib/ai'
import { cls } from '../lib/utils'
import { Icon } from './Icons'
import type { TaskSort } from '../types'

const SORT_OPTIONS: Array<{ value: TaskSort; label: string }> = [
  { value: 'default', label: '默认排序' },
  { value: 'due', label: '按截止时间' },
  { value: 'priority', label: '按优先级' },
  { value: 'created', label: '按创建时间' }
]

export function ViewHeader() {
  const state = useApp()
  const { title, subtitle } = viewTitle(state)
  const todayStart = new Date()
  todayStart.setHours(0, 0, 0, 0)
  const todayEnd = todayStart.getTime() + 86400000
  const todayTasks = Object.values(state.data.tasks).filter(
    (task) =>
      !task.deletedAt &&
      task.due !== null &&
      task.due >= todayStart.getTime() &&
      task.due < todayEnd
  )
  const todayDone = todayTasks.filter((task) => task.completed).length
  const todayTotal = todayTasks.length
  const todayPercent = todayTotal ? Math.round((todayDone / todayTotal) * 100) : 0

  return (
    <header className="view-head">
      <div className="view-head-text">
        <h1>{title}</h1>
        <p>{subtitle}</p>
        {state.ui.view === 'today' && todayTotal > 0 && (
          <div
            className="view-progress"
            role="status"
            aria-label={`今日完成 ${todayDone}/${todayTotal}`}
          >
            <span className="view-progress-track">
              <i style={{ width: `${todayPercent}%` }} />
            </span>
            <span className="view-progress-text">
              {todayDone}/{todayTotal} 完成
            </span>
          </div>
        )}
      </div>
      <div className="view-head-actions">
        {(state.ui.view === 'today' ||
          state.ui.view === 'week' ||
          state.ui.view === 'inbox' ||
          state.ui.view === 'all' ||
          state.ui.view === 'filter' ||
          state.ui.view === 'list' ||
          state.ui.view === 'completed') && <SortMenu />}
        {state.ui.view === 'completed' && (
          <button
            className="icon-btn"
            onClick={() => {
              if (!window.confirm('确定清理所有已完成任务吗？清理后会从列表中移除。')) return
              clearCompletedTasks()
            }}
            aria-label="清理已完成任务"
            title="清理已完成任务"
          >
            <Icon name="trash" size={18} />
          </button>
        )}
        {state.ui.view === 'inbox' && (
          <button
            className="icon-btn"
            onClick={() => {
              if (!aiConfigured()) {
                toast('请先在「设置 → AI 助手」配置模型', 'error')
                setUI({ settingsOpen: true })
                return
              }
              setUI({ organizeOpen: true })
            }}
            aria-label="AI 整理收件箱"
            title="AI 整理收件箱"
          >
            <Icon name="sparkles" size={18} />
          </button>
        )}
        {state.ui.view === 'filter' && state.ui.filterId && (
          <button
            className="icon-btn"
            onClick={() =>
              setUI({ filterEditorOpen: true, filterEditorId: state.ui.filterId })
            }
            aria-label="编辑筛选规则"
            title="编辑筛选规则"
          >
            <Icon name="sliders" size={18} />
          </button>
        )}
        {state.ui.view === 'list' && state.ui.listId && state.ui.listId !== 'inbox' && (
          <ListMenu listId={state.ui.listId} />
        )}
      </div>
    </header>
  )
}

function SortMenu() {
  const state = useApp()
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!open) return
    const handler = () => setOpen(false)
    const timer = window.setTimeout(() => document.addEventListener('click', handler), 0)
    return () => {
      window.clearTimeout(timer)
      document.removeEventListener('click', handler)
    }
  }, [open])

  return (
    <div className="menu-wrap" onClick={(event) => event.stopPropagation()}>
      <button
        className="icon-btn"
        onClick={() => setOpen((value) => !value)}
        aria-label="任务排序"
        title="任务排序"
      >
        <Icon name="sort" size={18} />
      </button>
      {open && (
        <div className="menu-pop sort-pop">
          <div className="menu-title">任务排序</div>
          {SORT_OPTIONS.map((option) => (
            <button
              key={option.value}
              className={cls('sort-option', state.settings.taskSort === option.value && 'active')}
              onClick={() => {
                updateSettings({ taskSort: option.value })
                setOpen(false)
              }}
            >
              <span>{option.label}</span>
              {state.settings.taskSort === option.value && (
                <Icon name="check" size={14} strokeWidth={2.6} />
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function ListMenu({ listId }: { listId: string }) {
  const state = useApp()
  const list = state.data.lists[listId]
  const [open, setOpen] = useState(false)
  const [name, setName] = useState(list?.name || '')
  const [confirm, setConfirm] = useState(false)

  useEffect(() => {
    setName(list?.name || '')
  }, [list?.name])

  useEffect(() => {
    if (!open) return
    const handler = () => {
      setOpen(false)
      setConfirm(false)
    }
    const timer = window.setTimeout(() => document.addEventListener('click', handler), 0)
    return () => {
      window.clearTimeout(timer)
      document.removeEventListener('click', handler)
    }
  }, [open])

  if (!list || list.deletedAt) return null

  return (
    <div className="menu-wrap" onClick={(event) => event.stopPropagation()}>
      <button className="icon-btn" onClick={() => setOpen((v) => !v)} aria-label="清单操作">
        <Icon name="more" />
      </button>
      {open && (
        <div className="menu-pop">
          <div className="menu-title">清单设置</div>
          <input
            className="menu-input"
            value={name}
            maxLength={16}
            onChange={(event) => setName(event.target.value)}
            onBlur={() => {
              if (name.trim() && name.trim() !== list.name) updateList(list.id, { name: name.trim() })
            }}
          />
          <div className="menu-colors">
            {['#4C6FFF', '#22C55E', '#F59E0B', '#EC4899', '#8B5CF6', '#06B6D4', '#EF4444', '#64748B'].map(
              (color) => (
                <button
                  key={color}
                  className={list.color === color ? 'color-dot active' : 'color-dot'}
                  style={{ background: color }}
                  onClick={() => updateList(list.id, { color })}
                  aria-label={`设置颜色 ${color}`}
                />
              )
            )}
          </div>
          <button
            className="menu-danger"
            onClick={() => {
              if (!confirm) {
                setConfirm(true)
                return
              }
              deleteList(list.id)
              navigate('today')
              setOpen(false)
            }}
          >
            <Icon name="trash" size={15} />
            {confirm ? '再次点击确认删除清单' : '删除清单'}
          </button>
          <p className="menu-note">删除清单会同时删除其中的任务</p>
        </div>
      )}
    </div>
  )
}
