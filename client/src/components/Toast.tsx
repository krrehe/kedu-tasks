import { useApp } from '../store'
import { restoreTask } from '../actions'
import { Icon } from './Icons'
import { cls } from '../lib/utils'

export function Toast() {
  const state = useApp()
  const toast = state.ui.toast
  if (!toast) return null

  return (
    <div className={cls('toast', toast.tone)} key={toast.id} role="status">
      <span className="toast-icon">
        <Icon
          name={toast.tone === 'error' ? 'info' : toast.tone === 'success' ? 'check-circle' : 'info'}
          size={16}
        />
      </span>
      <span className="toast-text">{toast.text}</span>
      {toast.action && (
        <button
          className="toast-action"
          onClick={() => {
            if (toast.action?.type === 'undo-delete') restoreTask(toast.action.taskId)
          }}
        >
          {toast.action.label}
        </button>
      )}
    </div>
  )
}
