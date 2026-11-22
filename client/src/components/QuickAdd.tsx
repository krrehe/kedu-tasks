import { useEffect, useMemo, useRef, useState } from 'react'
import { useApp, setUI } from '../store'
import { parseNatural } from '../lib/nlp'
import { INBOX_ID } from '../seed'
import { addTask, toast } from '../actions'
import { formatDue, formatReminder } from '../lib/date'
import { PRIORITY_COLOR, sortedLists } from '../lib/selectors'
import { aiConfigured, aiParseTask, AiError, type AiParsedTask } from '../lib/ai'
import { ensureNotificationPermission } from '../lib/notify'
import { Icon } from './Icons'
import { Modal } from './Modal'
import { cls } from '../lib/utils'

const IS_MAC = typeof navigator !== 'undefined' && /Mac|iPhone|iPad|iPod/.test(navigator.platform)

interface QuickAddProps {
  due?: number | null
  defaultListId?: string | null
  initialText?: string
  autoFocus?: boolean
  onDone?: () => void
  showHint?: boolean
}

export function QuickAdd({
  due = null,
  defaultListId,
  initialText,
  autoFocus,
  onDone,
  showHint
}: QuickAddProps) {
  const state = useApp()
  const lists = sortedLists(state)
  const [text, setText] = useState(initialText || '')
  const [aiResult, setAiResult] = useState<AiParsedTask | null>(null)
  const [manualList, setManualList] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [listening, setListening] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const recognitionRef = useRef<any>(null)
  const voiceBaseRef = useRef('')

  const SpeechRecognitionCtor: any = useMemo(() => {
    const w = window as any
    return w.SpeechRecognition || w.webkitSpeechRecognition || null
  }, [])

  useEffect(() => {
    if (initialText) {
      setText(initialText)
      inputRef.current?.focus()
    }
  }, [initialText])

  useEffect(
    () => () => {
      try {
        recognitionRef.current?.abort()
      } catch {
        /* 忽略 */
      }
    },
    []
  )

  const localParsed = useMemo(() => parseNatural(text, lists), [text, state.data.lists])
  const parsed = aiResult
    ? {
        title: aiResult.title,
        due: aiResult.due,
        allDay: aiResult.allDay,
        priority: aiResult.priority,
        tags: aiResult.tags,
        listId: aiResult.listId,
        listName: null,
        repeat: aiResult.repeat,
        reminder: aiResult.reminder
      }
    : localParsed

  const viewListId = state.ui.view === 'list' ? state.ui.listId : null
  const targetListId =
    manualList || parsed.listId || defaultListId || viewListId || INBOX_ID
  const targetList = state.data.lists[targetListId] || state.data.lists[INBOX_ID]

  // 从日历某一天点击「添加」时，未写日期的任务默认落到那一天
  const effectiveDue = parsed.due ?? due
  const effectiveAllDay = parsed.due === null ? due !== null : parsed.allDay

  const submit = () => {
    const value = text.trim()
    if (!value) return
    const title = (aiResult?.title || parsed.title || value).trim()
    const reminder = effectiveDue !== null ? parsed.reminder : null
    const task = addTask({
      title,
      listId: targetListId,
      due: effectiveDue,
      allDay: effectiveAllDay,
      priority: parsed.priority,
      tags: parsed.tags,
      repeat: parsed.repeat,
      reminder,
      aiCreated: !!aiResult
    })
    try {
      recognitionRef.current?.stop()
    } catch {
      /* 忽略 */
    }
    if (reminder !== null) void ensureNotificationPermission()
    setText('')
    setAiResult(null)
    setManualList(null)
    toast(
      `已添加${task.due ? ' · ' + formatDue(task.due, task.allDay) : ''}${
        reminder !== null ? ' · ' + formatReminder(reminder) : ''
      }`,
      'success'
    )
    inputRef.current?.focus()
    onDone?.()
  }

  const runAi = async () => {
    const value = text.trim()
    if (!value || busy) return
    if (!aiConfigured()) {
      toast('请先在「设置 → AI 助手」配置模型', 'error')
      return
    }
    setBusy(true)
    try {
      const result = await aiParseTask(value)
      setAiResult(result)
      setManualList(null)
      toast('AI 解析完成，可继续修改后添加', 'success')
    } catch (err) {
      toast(err instanceof AiError ? err.message : 'AI 解析失败', 'error')
    } finally {
      setBusy(false)
    }
  }

  const previewDue = effectiveDue
  const showPreview = text.trim().length > 0

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
      voiceBaseRef.current = text.trim() ? text.trim() + ' ' : ''
      recognition.onresult = (event: any) => {
        let transcript = ''
        for (let i = 0; i < event.results.length; i++) {
          transcript += event.results[i][0].transcript
        }
        setText((voiceBaseRef.current + transcript).slice(0, 300))
        setAiResult(null)
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
    <div className={cls('quick-add', showHint && 'with-hint')}>
      <div className="qa-bar">
        <span className="qa-plus">
          <Icon name="plus" size={19} />
        </span>
        <input
          ref={inputRef}
          className="qa-input"
          value={text}
          autoFocus={autoFocus}
          placeholder="添加任务，试试「明天下午3点 产品评审 高优先级 #设计」"
          onChange={(event) => {
            setText(event.target.value)
            if (aiResult) setAiResult(null)
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
              event.preventDefault()
              submit()
            }
          }}
          enterKeyHint="done"
        />
        {!text.trim() && !showHint && (
          <span className="qa-kbd" aria-hidden="true">
            {IS_MAC ? '⌘ N' : 'Ctrl N'}
          </span>
        )}
        <button
          className={cls('qa-mic', listening && 'listening')}
          onClick={toggleVoice}
          title={listening ? '正在听…' : '语音输入'}
          aria-label={listening ? '停止语音输入' : '语音输入'}
          type="button"
          hidden={!SpeechRecognitionCtor}
        >
          <Icon name="mic" size={17} />
        </button>
        <button
          className={cls('qa-ai', busy && 'busy', aiResult && 'active')}
          onClick={runAi}
          disabled={!text.trim() || busy}
          title="用 AI 解析这句话"
          aria-label="AI 解析"
        >
          <Icon name="sparkles" size={17} />
        </button>
        <button className="qa-submit" onClick={submit} disabled={!text.trim()}>
          添加
        </button>
      </div>

      {showPreview && (
        <div className="qa-preview">
          <div className="qa-preview-main">
            <div className="qa-title">{parsed.title || text}</div>
            <div className="qa-chips">
              {previewDue ? (
                <span className="chip">
                  <Icon name="calendar" size={12} />
                  {formatDue(previewDue, effectiveAllDay)}
                </span>
              ) : (
                <span className="chip muted">
                  <Icon name="calendar" size={12} />
                  无日期
                </span>
              )}
              {parsed.priority > 0 && (
                <span className="chip" style={{ color: PRIORITY_COLOR[parsed.priority] }}>
                  <Icon name="flag" size={12} />
                  {parsed.priority === 5 ? '高优先级' : parsed.priority === 3 ? '中优先级' : '低优先级'}
                </span>
              )}
              {parsed.repeat && (
                <span className="chip">
                  <Icon name="repeat" size={12} />
                  重复
                </span>
              )}
              {parsed.reminder !== null && previewDue && (
                <span className="chip">
                  <Icon name="bell" size={12} />
                  {formatReminder(parsed.reminder)}
                </span>
              )}
              {parsed.tags.map((tag) => (
                <span className="chip" key={tag}>
                  #{tag}
                </span>
              ))}
              {aiResult && (
                <span className="chip ai">
                  <Icon name="sparkles" size={11} />
                  AI 解析
                </span>
              )}
            </div>
          </div>
          <label className="qa-list">
            <i className="dot" style={{ background: targetList?.color }} />
            <select
              value={targetListId}
              onChange={(event) => setManualList(event.target.value)}
              aria-label="选择清单"
            >
              {lists.map((list) => (
                <option key={list.id} value={list.id}>
                  {list.name}
                </option>
              ))}
            </select>
            <Icon name="chevron-down" size={13} />
          </label>
        </div>
      )}

      {showHint && (
        <p className="qa-hint">
          支持识别：<b>明天下午 3 点</b> · <b>高优先级</b> · <b>#标签</b> · <b>放到工作清单</b> ·
          <b>每天重复</b> · <b>提前 15 分钟提醒</b>
        </p>
      )}
    </div>
  )
}

export function QuickAddSheet() {
  const state = useApp()
  if (!state.ui.quickAddOpen) return null
  const close = () =>
    setUI({
      quickAddOpen: false,
      quickAddDue: null,
      quickAddText: null,
      quickAddListId: null
    })
  return (
    <Modal
      title="添加任务"
      subtitle="一句话就够了，时间、提醒和优先级会自动识别"
      onClose={close}
    >
      <QuickAdd
        due={state.ui.quickAddDue}
        initialText={state.ui.quickAddText || undefined}
        defaultListId={state.ui.quickAddListId}
        autoFocus
        onDone={close}
        showHint
      />
    </Modal>
  )
}
