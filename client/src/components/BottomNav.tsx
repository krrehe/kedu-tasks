import { useApp } from '../store'
import { viewTitle } from '../lib/selectors'
import type { View } from '../types'
import { navigate } from '../actions'
import { Icon } from './Icons'
import { cls } from '../lib/utils'

interface BottomNavProps {
  onOpenLists: () => void
}

const ITEMS: Array<{
  view: View | 'lists'
  icon: 'target' | 'sun' | 'calendar' | 'timer' | 'flame' | 'list'
  label: string
}> = [
  { view: 'overview', icon: 'target', label: '概览' },
  { view: 'calendar', icon: 'calendar', label: '日历' },
  { view: 'focus', icon: 'timer', label: '专注' },
  { view: 'habits', icon: 'flame', label: '习惯' },
  { view: 'lists', icon: 'list', label: '清单' }
]

export function BottomNav({ onOpenLists }: BottomNavProps) {
  const state = useApp()

  return (
    <nav className="bottom-nav" aria-label="主导航">
      {ITEMS.map((item) => {
        const active =
          item.view === 'lists'
            ? state.ui.drawerOpen || state.ui.view === 'list' || state.ui.view === 'inbox'
            : state.ui.view === item.view
        return (
          <button
            key={item.view}
            type="button"
            className={cls('bottom-item', active && 'active')}
            aria-current={active ? 'page' : undefined}
            onClick={() => {
              if (item.view === 'lists') onOpenLists()
              else navigate(item.view)
            }}
          >
            <Icon name={item.icon} size={21} strokeWidth={active ? 2.1 : 1.8} />
            <span>{item.label}</span>
          </button>
        )
      })}
    </nav>
  )
}
