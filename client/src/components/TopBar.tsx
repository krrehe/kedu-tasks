import { setUI, useApp } from '../store'
import { viewTitle } from '../lib/selectors'
import { cls } from '../lib/utils'
import { Icon } from './Icons'

export function TopBar({
  onOpenDrawer,
  compact
}: {
  onOpenDrawer: () => void
  compact: boolean
}) {
  const state = useApp()
  const { title } = viewTitle(state)

  return (
    <header className={cls('topbar', compact && 'compact')}>
      <button className="icon-btn only-mobile" onClick={onOpenDrawer} aria-label="打开菜单">
        <Icon name="menu" />
      </button>
      <span className={cls('topbar-context', compact && 'show')}>{title}</span>
      <div className="grow" />
      <button
        className="icon-btn"
        onClick={() => setUI({ searchOpen: true })}
        aria-label="搜索任务"
        title="搜索任务"
      >
        <Icon name="search" />
      </button>
      <button className="ai-pill" onClick={() => setUI({ aiOpen: true })} title="打开 AI 助手">
        <Icon name="sparkles" size={15} />
        <span>AI</span>
      </button>
      <button
        className="icon-btn only-mobile"
        onClick={() => setUI({ settingsOpen: true })}
        aria-label="设置"
        title="设置"
      >
        <Icon name="sliders" />
      </button>
    </header>
  )
}
