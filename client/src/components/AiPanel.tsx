import { useEffect, useMemo, useRef, useState } from 'react'
import { setUI, useApp } from '../store'
import { applyPlan, sendAssistant, welcomeMessage } from '../lib/assistant'
import { aiConfigured, aiModelLabel, aiPlanDay } from '../lib/ai'
import { toast } from '../actions'
import type { ChatMessage } from '../types'
import { Icon } from './Icons'
import { ExtractTasksModal } from './ExtractTasksModal'
import { ReviewModal } from './ReviewModal'
import { cls, uid } from '../lib/utils'

const STORAGE_KEY = 'kedu-ai-chat-v1'

function loadMessages(): ChatMessage[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return [welcomeMessage()]
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return [welcomeMessage()]
    const cleaned = parsed.filter(
      (message: ChatMessage) =>
        message &&
        (message.role === 'user' || message.role === 'assistant') &&
        typeof message.text === 'string' &&
        !message.pending
    )
    return cleaned.length ? cleaned.slice(-30) : [welcomeMessage()]
  } catch {
    return [welcomeMessage()]
  }
}

export function AiPanel() {
  const state = useApp()
  const [messages, setMessages] = useState<ChatMessage[]>(loadMessages)
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [applied, setApplied] = useState<Record<string, boolean>>({})
  const [extractOpen, setExtractOpen] = useState(false)
  const [reviewOpen, setReviewOpen] = useState(false)
  const [listening, setListening] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const abortRef = useRef<AbortController | null>(null)
  const recognitionRef = useRef<any>(null)
  const busyRef = useRef(false)
  const configured = aiConfigured()

  const SpeechRecognitionCtor: any = useMemo(() => {
    const w = window as any
    return w.SpeechRecognition || w.webkitSpeechRecognition || null
  }, [])

  const updateBusy = (value: boolean) => {
    busyRef.current = value
    setBusy(value)
  }

  useEffect(() => {
    try {
      const stable = messages.filter((message) => !message.pending).slice(-30)
      localStorage.setItem(STORAGE_KEY, JSON.stringify(stable))
    } catch {
      /* 忽略存储异常 */
    }
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages])

  useEffect(() => {
    inputRef.current?.focus()
    return () => {
      abortRef.current?.abort()
      try {
        recognitionRef.current?.abort()
      } catch {
        /* 忽略 */
      }
    }
  }, [])

  if (!state.ui.aiOpen) return null

  const close = () => setUI({ aiOpen: false })

  const resolvePending = (id: string, patch: Partial<ChatMessage>) => {
    setMessages((prev) =>
      prev.map((message) => (message.id === id ? { ...message, pending: false, ...patch } : message))
    )
  }

  const requestAssistant = async (text: string, history: ChatMessage[], pendingId: string) => {
    const controller = new AbortController()
    abortRef.current = controller
    updateBusy(true)
    try {
      const result = await sendAssistant(text, history, controller.signal)
      resolvePending(pendingId, {
        text: result.text,
        actions: result.actions,
        plan: result.plan,
        summary: result.summary
      })
    } catch (err) {
      if (controller.signal.aborted) {
        resolvePending(pendingId, { text: '已停止生成', retryText: text })
      } else {
        resolvePending(pendingId, {
          text: `${(err as Error).message}。你也可以使用列表上方的快速添加，本地解析不依赖网络。`,
          error: true,
          retryText: text
        })
      }
    } finally {
      abortRef.current = null
      updateBusy(false)
    }
  }

  const send = async (textOverride?: string) => {
    const text = (textOverride ?? input).trim()
    if (!text || busyRef.current) return
    const history = messages
    const pendingId = uid('msg_')
    setMessages((prev) => [
      ...prev,
      { id: uid('msg_'), role: 'user', text },
      { id: pendingId, role: 'assistant', text: '', pending: true }
    ])
    setInput('')
    await requestAssistant(text, history, pendingId)
  }

  const retry = async (message: ChatMessage) => {
    const text = (message.retryText || '').trim()
    if (!text || busyRef.current) return
    const history = messages.filter((item) => item.id !== message.id)
    const pendingId = uid('msg_')
    setMessages((prev) =>
      prev.map((item) =>
        item.id === message.id
          ? { id: pendingId, role: 'assistant', text: '', pending: true }
          : item
      )
    )
    await requestAssistant(text, history, pendingId)
  }

  const stop = () => {
    abortRef.current?.abort()
  }

  const planDay = async () => {
    if (busyRef.current) return
    const pendingId = uid('msg_')
    setMessages((prev) => [
      ...prev,
      { id: uid('msg_'), role: 'user', text: '帮我规划今天的任务' },
      { id: pendingId, role: 'assistant', text: '', pending: true }
    ])
    const controller = new AbortController()
    abortRef.current = controller
    updateBusy(true)
    try {
      const result = await aiPlanDay(controller.signal)
      resolvePending(pendingId, {
        text: result.summary,
        plan: result.items,
        actions: result.source === 'ai' ? ['AI 生成计划'] : ['本地规则生成计划']
      })
    } catch (err) {
      if (controller.signal.aborted) {
        resolvePending(pendingId, { text: '已停止生成' })
      } else {
        resolvePending(pendingId, {
          text: `生成计划失败：${(err as Error).message}`,
          error: true
        })
      }
    } finally {
      abortRef.current = null
      updateBusy(false)
    }
  }

  const clearChat = () => {
    if (!window.confirm('清空当前对话记录？')) return
    abortRef.current?.abort()
    updateBusy(false)
    setMessages([welcomeMessage()])
    setApplied({})
    toast('对话已清空', 'success')
  }

  const openExtract = () => {
    if (!configured) {
      toast('请先在「设置 → AI 助手」配置模型', 'error')
      setUI({ settingsOpen: true })
      return
    }
    setExtractOpen(true)
  }

  const openOrganize = () => {
    if (!configured) {
      toast('请先在「设置 → AI 助手」配置模型', 'error')
      setUI({ settingsOpen: true })
      return
    }
    setUI({ organizeOpen: true })
  }

  const toggleVoice = () => {
    if (!SpeechRecognitionCtor) return
    if (listening) {
      try {
        recognitionRef.current?.stop()
      } catch {
        /* 忽略 */
      }
      return
    }
    try {
      const recognition = new SpeechRecognitionCtor()
      recognition.lang = 'zh-CN'
      recognition.interimResults = true
      recognition.continuous = false
      recognition.maxAlternatives = 1
      recognition.onresult = (event: any) => {
        let transcript = ''
        for (let i = 0; i < event.results.length; i++) {
          transcript += event.results[i][0].transcript
        }
        setInput(transcript.slice(0, 500))
      }
      recognition.onend = () => setListening(false)
      recognition.onerror = (event: any) => {
        setListening(false)
        if (event?.error === 'not-allowed' || event?.error === 'service-not-allowed') {
          toast('需要麦克风权限才能语音输入', 'error')
        } else if (event?.error !== 'aborted' && event?.error !== 'no-speech') {
          toast('语音识别失败，请重试', 'error')
        }
      }
      recognitionRef.current = recognition
      recognition.start()
      setListening(true)
    } catch {
      setListening(false)
      toast('当前浏览器不支持语音输入', 'error')
    }
  }

  return (
    <>
      <div className="drawer-scrim" onClick={close} />
      <aside className="ai-panel" aria-label="AI 助手">
        <header className="ai-head">
          <span className="ai-head-icon">
            <Icon name="sparkles" size={18} />
          </span>
          <div className="ai-head-text">
            <h2>AI 助手</h2>
            <p>{configured ? aiModelLabel() : '未配置模型 · 本地能力可用'}</p>
          </div>
          <button
            className="icon-btn small"
            onClick={openExtract}
            aria-label="从文本提取任务"
            title="从文本提取任务"
          >
            <Icon name="note" size={17} />
          </button>
          <button
            className="icon-btn small"
            onClick={clearChat}
            aria-label="清空对话"
            title="清空对话"
          >
            <Icon name="trash" size={16} />
          </button>
          <button
            className="icon-btn small"
            onClick={() => setUI({ settingsOpen: true })}
            aria-label="AI 设置"
            title="AI 设置"
          >
            <Icon name="sliders" size={17} />
          </button>
          <button className="icon-btn small" onClick={close} aria-label="关闭">
            <Icon name="x" size={18} />
          </button>
        </header>

        {!configured && (
          <div className="ai-banner">
            <Icon name="info" size={15} />
            <span>配置任意 OpenAI 兼容模型后，可以用对话管理任务和习惯。</span>
            <button onClick={() => setUI({ settingsOpen: true })}>去配置</button>
          </div>
        )}

        <div className="ai-messages" ref={scrollRef}>
          {messages.map((message) => (
            <div
              key={message.id}
              className={cls('msg', message.role, message.error && 'error')}
            >
              {message.role === 'assistant' && (
                <span className="msg-avatar">
                  <Icon name="sparkles" size={13} />
                </span>
              )}
              <div className="msg-bubble">
                {message.pending ? (
                  <span className="typing" aria-label="正在思考">
                    <i />
                    <i />
                    <i />
                  </span>
                ) : (
                  <>
                    <p>{message.text}</p>
                    {message.actions && message.actions.length > 0 && (
                      <div className="msg-actions">
                        {message.actions.map((action, index) => (
                          <span className="action-chip" key={index}>
                            <Icon name="check" size={11} strokeWidth={3} />
                            {action}
                          </span>
                        ))}
                      </div>
                    )}
                    {message.error && (
                      <div className="msg-links">
                        {message.retryText && (
                          <button onClick={() => void retry(message)}>重试</button>
                        )}
                        <button onClick={() => setUI({ settingsOpen: true })}>检查设置</button>
                      </div>
                    )}
                    {message.plan && message.plan.length > 0 && (
                      <div className="plan-card">
                        <div className="plan-head">
                          <b>今日计划</b>
                          {message.summary && <span>{message.summary}</span>}
                        </div>
                        <ol className="plan-list">
                          {message.plan.map((item, index) => (
                            <li key={index}>
                              <span className="plan-time">{item.time}</span>
                              <span className="plan-title">{item.title}</span>
                              <span className="plan-reason">{item.reason}</span>
                            </li>
                          ))}
                        </ol>
                        <button
                          className="plan-apply"
                          disabled={applied[message.id]}
                          onClick={() => {
                            if (!message.plan) return
                            applyPlan(message.plan)
                            setApplied((prev) => ({ ...prev, [message.id]: true }))
                          }}
                        >
                          {applied[message.id] ? '已应用到日程' : '应用到日程'}
                        </button>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          ))}
        </div>

        <div className="ai-suggestions">
          <button className="suggestion" onClick={planDay} disabled={busy}>
            <Icon name="calendar" size={13} />
            规划今天
          </button>
          <button className="suggestion" onClick={() => setReviewOpen(true)}>
            <Icon name="chart" size={13} />
            今日复盘
          </button>
          <button className="suggestion" onClick={openExtract}>
            <Icon name="note" size={13} />
            从文本提取
          </button>
          <button className="suggestion" onClick={openOrganize}>
            <Icon name="sparkles" size={13} />
            整理收件箱
          </button>
          <button
            className="suggestion"
            onClick={() => void send('把今天没做完的任务移到明天')}
            disabled={busy}
          >
            顺延未完成
          </button>
          <button
            className="suggestion"
            onClick={() => {
              setInput('帮我建立一个每天阅读 30 分钟的习惯')
              inputRef.current?.focus()
            }}
          >
            <Icon name="flame" size={13} />
            建立习惯
          </button>
        </div>

        <div className="ai-input">
          {SpeechRecognitionCtor && (
            <button
              className={cls('ai-mic', listening && 'listening')}
              onClick={toggleVoice}
              title={listening ? '正在听…' : '语音输入'}
              aria-label={listening ? '停止语音输入' : '语音输入'}
              type="button"
            >
              <Icon name="mic" size={17} />
            </button>
          )}
          <textarea
            ref={inputRef}
            value={input}
            rows={1}
            placeholder="说出你的安排，或让我管理任务与习惯…"
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
                event.preventDefault()
                void send()
              }
            }}
          />
          <button
            className={cls('send-btn', busy && 'stop')}
            onClick={() => (busy ? stop() : void send())}
            disabled={!busy && !input.trim()}
            aria-label={busy ? '停止生成' : '发送'}
          >
            <Icon name={busy ? 'square' : 'arrow-right'} size={18} />
          </button>
        </div>
      </aside>

      {extractOpen && (
        <ExtractTasksModal
          onClose={() => setExtractOpen(false)}
          onOpenSettings={() => {
            setExtractOpen(false)
            setUI({ settingsOpen: true })
          }}
        />
      )}
      {reviewOpen && <ReviewModal onClose={() => setReviewOpen(false)} />}
    </>
  )
}
