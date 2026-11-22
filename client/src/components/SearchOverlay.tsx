import { useEffect, useRef, useState } from 'react'
import { setUI, useApp } from '../store'
import { listMap, searchTasks } from '../lib/selectors'
import { openTask } from '../actions'
import { TaskRow } from './TaskList'
import { Icon } from './Icons'

export function SearchOverlay() {
  const state = useApp()
  const [query, setQuery] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const lists = listMap(state)
  const results = searchTasks(state, query)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  if (!state.ui.searchOpen) return null

  const close = () => setUI({ searchOpen: false })

  return (
    <div
      className="overlay search-overlay"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) close()
      }}
    >
      <div className="search-box" role="dialog" aria-label="搜索任务">
        <div className="search-bar">
          <Icon name="search" size={19} />
          <input
            ref={inputRef}
            value={query}
            placeholder="搜索任务、备注、标签或清单"
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Escape') close()
              if (event.key === 'Enter' && results[0]) {
                openTask(results[0].id)
                close()
              }
            }}
          />
          <span className="search-esc" aria-hidden="true">
            Esc
          </span>
          <button className="icon-btn small" onClick={close} aria-label="关闭搜索">
            <Icon name="x" size={17} />
          </button>
        </div>

        <div className="search-results">
          {!query.trim() ? (
            <p className="search-hint">输入关键词开始搜索，支持已完成的任务</p>
          ) : results.length === 0 ? (
            <p className="search-hint">没有找到「{query}」相关的任务</p>
          ) : (
            <>
              <p className="search-count">{results.length} 个结果</p>
              {results.map((task) => (
                <TaskRow
                  key={task.id}
                  task={task}
                  list={lists[task.listId]}
                  showList
                  onSelect={(id) => {
                    openTask(id)
                    close()
                  }}
                />
              ))}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
