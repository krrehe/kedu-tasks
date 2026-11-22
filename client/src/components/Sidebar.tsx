import { useState } from 'react'
import { setUI, useApp } from '../store'
import { addList, navigate, openFilter } from '../actions'
import { counts, filterTaskCount, sortedFilters, sortedLists } from '../lib/selectors'
import { syncNow, syncSummary } from '../lib/sync'
import { LIST_COLORS } from '../seed'
import type { View } from '../types'
import { Icon, Logo, type IconName } from './Icons'
import { cls } from '../lib/utils'

interface SidebarProps {
  open: boolean
  onClose: () => void
}

export function Sidebar({ open, onClose }: SidebarProps) {
  const state = useApp()
  const c = counts(state)
  const lists = sortedLists(state)
  const filters = sortedFilters(state)
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState('')
  const [color, setColor] = useState(LIST_COLORS[1])

  const go = (view: View, listId: string | null = null) => {
    navigate(view, listId)
    onClose()
  }

  const submitList = () => {
    const created = addList(name, color)
    if (created) {
      setName('')
      setAdding(false)
      go('list', created.id)
    }
  }

  return (
    <aside className={cls('sidebar', open && 'open')}>
      <div className="brand">
        <Logo size={34} />
        <div className="brand-text">
          <strong>
            刻度清单 <span className="brand-badge">3.1</span>
          </strong>
          <span>TickDone</span>
        </div>
        <button className="icon-btn only-mobile" onClick={onClose} aria-label="收起菜单">
          <Icon name="x" />
        </button>
      </div>

      <button
        className="ai-entry"
        onClick={() => {
          setUI({ aiOpen: true })
          onClose()
        }}
      >
        <span className="ai-entry-icon">
          <Icon name="sparkles" size={17} />
        </span>
        <span className="ai-entry-text">
          <strong>AI 助手</strong>
          <small>一句话添加 · 排期 · 拆解</small>
        </span>
        <Icon name="chevron-right" size={15} className="ai-entry-arrow" />
      </button>

      <nav className="nav">
        <NavItem
          icon="target"
          label="概览"
          active={state.ui.view === 'overview'}
          onClick={() => go('overview')}
        />
        <NavItem
          icon="sun"
          label="今天"
          count={c.today}
          active={state.ui.view === 'today'}
          onClick={() => go('today')}
        />
        <NavItem
          icon="calendar-days"
          label="最近 7 天"
          count={c.week}
          active={state.ui.view === 'week'}
          onClick={() => go('week')}
        />
        <NavItem
          icon="inbox"
          label="收件箱"
          count={c.inbox}
          active={state.ui.view === 'inbox'}
          onClick={() => go('inbox')}
        />
        <NavItem
          icon="layers"
          label="所有任务"
          count={c.all}
          active={state.ui.view === 'all'}
          onClick={() => go('all')}
        />
        <NavItem
          icon="check-circle"
          label="已完成"
          active={state.ui.view === 'completed'}
          onClick={() => go('completed')}
        />
      </nav>

      <div className="nav-section">
        <span>智能筛选</span>
        <button
          className="icon-btn tiny"
          onClick={() => {
            setUI({ filterEditorOpen: true, filterEditorId: null })
            onClose()
          }}
          aria-label="新建智能筛选"
        >
          <Icon name="plus" size={15} />
        </button>
      </div>

      <nav className="nav">
        {filters.map((filter) => (
          <NavItem
            key={filter.id}
            label={filter.name}
            color={filter.color}
            count={filterTaskCount(state, filter)}
            active={state.ui.view === 'filter' && state.ui.filterId === filter.id}
            onClick={() => {
              openFilter(filter.id)
              onClose()
            }}
          />
        ))}
        {filters.length === 0 && (
          <button
            className="add-list-btn"
            onClick={() => {
              setUI({ filterEditorOpen: true, filterEditorId: null })
              onClose()
            }}
          >
            <Icon name="filter" size={15} />
            新建筛选器
          </button>
        )}
      </nav>

      <div className="nav-section">
        <span>我的清单</span>
        <button className="icon-btn tiny" onClick={() => setAdding((v) => !v)} aria-label="新建清单">
          <Icon name="plus" size={15} />
        </button>
      </div>

      <nav className="nav lists-nav">
        {lists
          .filter((list) => list.id !== 'inbox')
          .map((list) => (
            <NavItem
              key={list.id}
              label={list.name}
              color={list.color}
              count={c.byList(list.id)}
              active={state.ui.view === 'list' && state.ui.listId === list.id}
              onClick={() => go('list', list.id)}
            />
          ))}

        {adding && (
          <form
            className="list-form"
            onSubmit={(event) => {
              event.preventDefault()
              submitList()
            }}
          >
            <input
              autoFocus
              value={name}
              placeholder="清单名称"
              maxLength={16}
              onChange={(event) => setName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Escape') setAdding(false)
              }}
            />
            <div className="color-row">
              {LIST_COLORS.map((item) => (
                <button
                  type="button"
                  key={item}
                  className={cls('color-dot', color === item && 'active')}
                  style={{ background: item }}
                  onClick={() => setColor(item)}
                  aria-label={`选择颜色 ${item}`}
                />
              ))}
            </div>
            <div className="list-form-actions">
              <button type="submit" disabled={!name.trim()}>
                创建
              </button>
              <button type="button" className="ghost" onClick={() => setAdding(false)}>
                取消
              </button>
            </div>
          </form>
        )}

        {!adding && (
          <button className="add-list-btn" onClick={() => setAdding(true)}>
            <Icon name="plus" size={15} />
            新建清单
          </button>
        )}
      </nav>

      <div className="nav-section">
        <span>更多</span>
      </div>
      <nav className="nav">
        <NavItem
          icon="kanban"
          label="看板"
          active={state.ui.view === 'board'}
          onClick={() => go('board')}
        />
        <NavItem icon="calendar" label="日历" active={state.ui.view === 'calendar'} onClick={() => go('calendar')} />
        <NavItem icon="flame" label="习惯" active={state.ui.view === 'habits'} onClick={() => go('habits')} />
        <NavItem icon="timer" label="专注" active={state.ui.view === 'focus'} onClick={() => go('focus')} />
        <NavItem icon="chart" label="统计" active={state.ui.view === 'stats'} onClick={() => go('stats')} />
      </nav>

      <div className="sidebar-foot">
        <button
          className={cls('sync-chip', state.sync.status)}
          onClick={() => void syncNow()}
          title="点击立即同步"
        >
          <Icon
            name={state.sync.status === 'syncing' ? 'refresh' : 'cloud'}
            size={15}
            className={state.sync.status === 'syncing' ? 'spin' : undefined}
          />
          <span>{syncSummary()}</span>
        </button>
        <button
          className="icon-btn"
          onClick={() => setUI({ settingsOpen: true })}
          aria-label="设置"
        >
          <Icon name="sliders" />
        </button>
      </div>
    </aside>
  )
}

function NavItem({
  icon,
  label,
  count,
  active,
  color,
  onClick
}: {
  icon?: IconName
  label: string
  count?: number
  active?: boolean
  color?: string
  onClick: () => void
}) {
  return (
    <button className={cls('nav-item', active && 'active')} onClick={onClick}>
      {color ? <i className="dot" style={{ background: color }} /> : icon ? <Icon name={icon} size={18} /> : null}
      <span className="nav-label">{label}</span>
      {count ? <span className="nav-count">{count}</span> : null}
    </button>
  )
}
