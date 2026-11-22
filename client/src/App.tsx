import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { setUI, useApp } from './store'
import { requestQuickAdd } from './actions'
import { counts } from './lib/selectors'
import type { UIState, View } from './types'
import { Sidebar } from './components/Sidebar'
import { TopBar } from './components/TopBar'
import { BottomNav } from './components/BottomNav'
import { ViewHeader } from './components/ViewHeader'
import { TasksView } from './components/TasksView'
import { SearchOverlay } from './components/SearchOverlay'
import { QuickAddSheet } from './components/QuickAdd'
import { TaskDetail } from './components/TaskDetail'
import { Toast } from './components/Toast'
import { OfflineBanner } from './components/OfflineBanner'
import { Icon } from './components/Icons'
import { cls } from './lib/utils'

// 非默认视图和面板按需加载，减小首屏体积
const LazyOverviewView = lazy(() =>
  import('./components/OverviewView').then((module) => ({ default: module.OverviewView }))
)
const LazyCalendarView = lazy(() =>
  import('./components/CalendarView').then((module) => ({ default: module.CalendarView }))
)
const LazyBoardView = lazy(() =>
  import('./components/BoardView').then((module) => ({ default: module.BoardView }))
)
const LazyHabitsView = lazy(() =>
  import('./components/HabitsView').then((module) => ({ default: module.HabitsView }))
)
const LazyFocusView = lazy(() =>
  import('./components/FocusView').then((module) => ({ default: module.FocusView }))
)
const LazyStatsView = lazy(() =>
  import('./components/StatsView').then((module) => ({ default: module.StatsView }))
)
const LazyAiPanel = lazy(() =>
  import('./components/AiPanel').then((module) => ({ default: module.AiPanel }))
)
const LazySettingsSheet = lazy(() =>
  import('./components/SettingsSheet').then((module) => ({ default: module.SettingsSheet }))
)
const LazyFilterEditor = lazy(() =>
  import('./components/FilterEditor').then((module) => ({ default: module.FilterEditor }))
)
const LazyOrganizeInbox = lazy(() =>
  import('./components/OrganizeInbox').then((module) => ({ default: module.OrganizeInbox }))
)
const LazyTrashSheet = lazy(() =>
  import('./components/TrashSheet').then((module) => ({ default: module.TrashSheet }))
)

const TASK_VIEWS: View[] = ['today', 'week', 'inbox', 'all', 'filter', 'completed', 'list']
const ALL_VIEWS: View[] = [
  'overview',
  ...TASK_VIEWS,
  'board',
  'calendar',
  'habits',
  'focus',
  'stats'
]

export default function App() {
  const state = useApp()
  const ui = state.ui
  const scrollRef = useRef<HTMLElement>(null)
  const [compactHeader, setCompactHeader] = useState(false)

  // 支持从桌面图标快捷键 (?view=today / ?ai=1) 直接打开
  useEffect(() => {
    const params = new URLSearchParams(location.search)
    // 分享入口：PWA 的 /share，或安卓原生 App 注入的 ?share=1
    if (location.pathname === '/share' || params.get('share') === '1') {
      const text = (params.get('text') || '').trim()
      const title = (params.get('title') || '').trim()
      const url = (params.get('url') || '').trim()
      // 优先使用选中的正文，没有正文时再用页面标题
      const primary = text || title || url
      const parts = [primary]
      if (url && !primary.includes(url)) parts.push(url)
      const shared = Array.from(new Set(parts.filter(Boolean))).join(' ').slice(0, 500)
      setUI({
        quickAddOpen: true,
        quickAddText: shared || null,
        quickAddDue: null
      })
      history.replaceState(null, '', '/')
      return
    }

    const view = params.get('view') as View | null
    const patch: Partial<UIState> = {}
    if (view && ALL_VIEWS.includes(view)) patch.view = view
    if (params.get('ai')) patch.aiOpen = true
    if (Object.keys(patch).length) {
      setUI(patch)
      history.replaceState(null, '', location.pathname)
    }
  }, [])

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 })
    setCompactHeader(false)
  }, [ui.view])

  // 桌面端托盘 / 全局快捷键触发快速添加
  useEffect(() => {
    const handler = () => requestQuickAdd()
    window.addEventListener('kedu-quick-add', handler)
    return () => window.removeEventListener('kedu-quick-add', handler)
  }, [])

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const mod = event.metaKey || event.ctrlKey
      if (mod && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setUI({ searchOpen: true })
      } else if (mod && event.key.toLowerCase() === 'n') {
        event.preventDefault()
        requestQuickAdd()
      } else if (event.key === 'Escape') {
        setUI({
          aiOpen: false,
          settingsOpen: false,
          searchOpen: false,
          drawerOpen: false,
          selectedTaskId: null,
          quickAddOpen: false,
          filterEditorOpen: false,
          filterEditorId: null,
          organizeOpen: false,
          trashOpen: false
        })
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  const isTaskView = TASK_VIEWS.includes(ui.view)
  const showFab =
    ui.view === 'today' ||
    ui.view === 'week' ||
    ui.view === 'inbox' ||
    ui.view === 'all' ||
    ui.view === 'filter' ||
    ui.view === 'list'
  const todayCount = counts(state).today

  // 已安装到桌面时，在图标角标显示今天的待办数量
  useEffect(() => {
    const nav = navigator as Navigator & {
      setAppBadge?: (count?: number) => Promise<void>
      clearAppBadge?: () => Promise<void>
    }
    if (!nav.setAppBadge) return
    try {
      if (todayCount > 0) void nav.setAppBadge(todayCount).catch(() => undefined)
      else void nav.clearAppBadge?.().catch(() => undefined)
    } catch {
      /* 忽略不支持的环境 */
    }
  }, [todayCount])

  return (
    <div className="app">
      <Sidebar open={ui.drawerOpen} onClose={() => setUI({ drawerOpen: false })} />
      {ui.drawerOpen && <div className="drawer-scrim" onClick={() => setUI({ drawerOpen: false })} />}

      <div className="content">
        <TopBar
          onOpenDrawer={() => setUI({ drawerOpen: true })}
          compact={compactHeader}
        />
        <OfflineBanner />
        <main
          className="scroll"
          ref={scrollRef}
          onScroll={(event) => {
            const next = event.currentTarget.scrollTop > 28
            setCompactHeader((current) => (current === next ? current : next))
          }}
        >
          <div
            key={`${ui.view}-${ui.listId || ''}-${ui.filterId || ''}`}
            className={cls('view-inner', !isTaskView && 'wide')}
          >
            <ViewHeader />
            <Suspense fallback={<ViewLoading />}>
              {ui.view === 'overview' ? (
                <LazyOverviewView />
              ) : ui.view === 'calendar' ? (
                <LazyCalendarView />
              ) : ui.view === 'board' ? (
                <LazyBoardView />
              ) : ui.view === 'habits' ? (
                <LazyHabitsView />
              ) : ui.view === 'focus' ? (
                <LazyFocusView />
              ) : ui.view === 'stats' ? (
                <LazyStatsView />
              ) : (
                <TasksView />
              )}
            </Suspense>
          </div>
        </main>
        <BottomNav onOpenLists={() => setUI({ drawerOpen: true })} />
        {showFab && (
          <button className="fab only-mobile" onClick={() => requestQuickAdd()} aria-label="添加任务">
            <Icon name="plus" size={24} />
          </button>
        )}
      </div>

      {ui.selectedTaskId && <TaskDetail />}
      {ui.aiOpen && (
        <Suspense fallback={null}>
          <LazyAiPanel />
        </Suspense>
      )}
      {ui.settingsOpen && (
        <Suspense fallback={null}>
          <LazySettingsSheet />
        </Suspense>
      )}
      {ui.searchOpen && <SearchOverlay />}
      {ui.filterEditorOpen && (
        <Suspense fallback={null}>
          <LazyFilterEditor
            key={ui.filterEditorId || 'new-filter'}
            filterId={ui.filterEditorId}
            onClose={() => setUI({ filterEditorOpen: false, filterEditorId: null })}
          />
        </Suspense>
      )}
      {ui.organizeOpen && (
        <Suspense fallback={null}>
          <LazyOrganizeInbox onClose={() => setUI({ organizeOpen: false })} />
        </Suspense>
      )}
      {ui.trashOpen && (
        <Suspense fallback={null}>
          <LazyTrashSheet onClose={() => setUI({ trashOpen: false })} />
        </Suspense>
      )}
      <QuickAddSheet />
      <Toast />
    </div>
  )
}

function ViewLoading() {
  return (
    <div className="view-loading" aria-hidden="true">
      <i />
      <i />
      <i />
    </div>
  )
}
