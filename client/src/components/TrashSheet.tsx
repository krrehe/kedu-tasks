import { useApp } from '../store'
import { restoreHabit, restoreTask } from '../actions'
import { formatDateTime } from '../lib/date'
import { Modal } from './Modal'
import { Icon } from './Icons'

export function TrashSheet({ onClose }: { onClose: () => void }) {
  const state = useApp()
  const deletedTasks = Object.values(state.data.tasks)
    .filter((task) => task.deletedAt !== null)
    .sort((a, b) => (b.deletedAt || 0) - (a.deletedAt || 0))
  const deletedHabits = Object.values(state.data.habits)
    .filter((habit) => habit.deletedAt !== null)
    .sort((a, b) => (b.deletedAt || 0) - (a.deletedAt || 0))

  return (
    <Modal
      title="最近删除"
      subtitle="误删的任务和习惯可以在这里恢复"
      size="lg"
      onClose={onClose}
      footer={
        <button className="btn primary" onClick={onClose}>
          完成
        </button>
      }
    >
      <div className="trash-sheet">
        <section className="trash-section">
          <h3>
            <Icon name="check-circle" size={15} />
            任务
            <span className="trash-count">{deletedTasks.length}</span>
          </h3>
          {deletedTasks.length === 0 ? (
            <p className="trash-empty">没有删除的任务</p>
          ) : (
            deletedTasks.map((task) => {
              const list = state.data.lists[task.listId]
              return (
                <div className="trash-item" key={task.id}>
                  <div className="trash-item-main">
                    <span className="trash-item-title">{task.title}</span>
                    <span className="trash-item-meta">
                      {formatDateTime(task.deletedAt || 0)}
                      {list && !list.deletedAt ? ` · ${list.name}` : ' · 清单已删除'}
                    </span>
                  </div>
                  <button className="btn small" onClick={() => restoreTask(task.id)}>
                    <Icon name="refresh" size={13} />
                    恢复
                  </button>
                </div>
              )
            })
          )}
        </section>

        <section className="trash-section">
          <h3>
            <Icon name="flame" size={15} />
            习惯
            <span className="trash-count">{deletedHabits.length}</span>
          </h3>
          {deletedHabits.length === 0 ? (
            <p className="trash-empty">没有删除的习惯</p>
          ) : (
            deletedHabits.map((habit) => (
              <div className="trash-item" key={habit.id}>
                <span className="dot" style={{ background: habit.color }} />
                <div className="trash-item-main">
                  <span className="trash-item-title">{habit.name}</span>
                  <span className="trash-item-meta">
                    {formatDateTime(habit.deletedAt || 0)}
                  </span>
                </div>
                <button className="btn small" onClick={() => restoreHabit(habit.id)}>
                  <Icon name="refresh" size={13} />
                  恢复
                </button>
              </div>
            ))
          )}
        </section>
      </div>
    </Modal>
  )
}
