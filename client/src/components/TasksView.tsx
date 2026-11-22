import { useApp } from '../store'
import { getViewContent, listMap } from '../lib/selectors'
import { openTask } from '../actions'
import { QuickAdd } from './QuickAdd'
import { TaskSections } from './TaskList'
import { cls } from '../lib/utils'

export function TasksView() {
  const state = useApp()
  const content = getViewContent(state)
  const lists = listMap(state)
  const view = state.ui.view
  const showQuick =
    view === 'today' ||
    view === 'week' ||
    view === 'inbox' ||
    view === 'all' ||
    view === 'filter' ||
    view === 'list'
  const showList =
    view === 'today' || view === 'week' || view === 'all' || view === 'filter' || view === 'completed'
  const filter =
    view === 'filter' && state.ui.filterId ? state.data.filters[state.ui.filterId] : null

  return (
    <div className={cls('tasks-view', view === 'completed' && 'is-completed')}>
      {showQuick && <QuickAdd defaultListId={filter?.listId || null} />}
      <TaskSections
        groups={content.groups}
        emptyTitle={content.emptyTitle}
        emptyHint={content.emptyHint}
        lists={lists}
        showList={showList}
        onSelect={openTask}
      />
    </div>
  )
}
