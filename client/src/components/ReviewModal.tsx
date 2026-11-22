import { useEffect, useRef, useState } from 'react'
import { Modal } from './Modal'
import { Icon } from './Icons'
import { toast } from '../actions'
import { aiConfigured } from '../lib/ai'
import { aiReview, type ReviewPeriod } from '../lib/review'
import { cls } from '../lib/utils'

export function ReviewModal({ onClose }: { onClose: () => void }) {
  const [period, setPeriod] = useState<ReviewPeriod>('day')
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [source, setSource] = useState<'ai' | 'local' | null>(null)
  const [error, setError] = useState('')
  const [stopped, setStopped] = useState(false)
  const abortRef = useRef<AbortController | null>(null)
  const configured = aiConfigured()

  const run = async (next: ReviewPeriod = period) => {
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    setPeriod(next)
    setBusy(true)
    setError('')
    setText('')
    setSource(null)
    setStopped(false)

    try {
      const result = await aiReview(next, {
        signal: controller.signal,
        onDelta: (fullText) => setText(fullText)
      })
      if (controller.signal.aborted) return
      setText(result.text)
      setSource(result.source)
      if (result.error) setError(result.error)
    } catch (err) {
      if (!controller.signal.aborted) setError((err as Error).message)
    } finally {
      if (!controller.signal.aborted) setBusy(false)
    }
  }

  useEffect(() => {
    void run('day')
    return () => {
      abortRef.current?.abort()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const stop = () => {
    abortRef.current?.abort()
    setBusy(false)
    setStopped(true)
  }

  const copy = async () => {
    if (!text) return
    try {
      await navigator.clipboard.writeText(text)
      toast('复盘已复制', 'success')
    } catch {
      toast('复制失败，请手动选择文本', 'error')
    }
  }

  return (
    <Modal
      title="AI 复盘"
      subtitle="基于真实任务与专注数据生成，不会编造内容"
      size="lg"
      onClose={onClose}
      footer={
        <>
          <button className="btn ghost" onClick={onClose}>
            关闭
          </button>
          {busy ? (
            <button className="btn" onClick={stop}>
              <Icon name="square" size={13} />
              停止
            </button>
          ) : (
            <>
              <button className="btn" onClick={() => void copy()} disabled={!text}>
                复制
              </button>
              <button className="btn primary" onClick={() => void run(period)}>
                <Icon name="refresh" size={14} />
                重新生成
              </button>
            </>
          )}
        </>
      }
    >
      <div className="review-toolbar">
        <div className="segmented review-tabs">
          <button
            className={cls('seg-item', period === 'day' && 'active')}
            onClick={() => void run('day')}
            disabled={busy}
          >
            今日复盘
          </button>
          <button
            className={cls('seg-item', period === 'week' && 'active')}
            onClick={() => void run('week')}
            disabled={busy}
          >
            本周复盘
          </button>
        </div>
        {source === 'ai' && (
          <span className="review-badge ai">
            <Icon name="sparkles" size={11} />
            AI 生成
          </span>
        )}
        {source === 'local' && <span className="review-badge">本地统计</span>}
      </div>

      {!configured && (
        <div className="extract-banner">
          <Icon name="info" size={15} />
          <span>未配置 AI 模型，当前展示本地统计复盘。</span>
        </div>
      )}

      {error && <p className="review-error">AI 生成失败：{error}。已回退到本地统计。</p>}

      <div className="review-text">
        {!text && busy && (
          <div className="review-loading">
            <span className="typing">
              <i />
              <i />
              <i />
            </span>
            正在整理你的数据…
          </div>
        )}
        {text}
        {busy && text && <span className="review-caret" />}
      </div>

      {stopped && !busy && <p className="review-stopped">已停止生成，以上是已完成的部分。</p>}
    </Modal>
  )
}
