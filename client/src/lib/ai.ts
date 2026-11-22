import type { AiMessage, FilterDue, PlanItem, Priority, Repeat, Task, TaskList } from '../types'
import { getState } from '../store'
import { sortedLists } from './selectors'
import { apiBase } from './api'
import { formatDueIso } from './format'
import { dayKey } from './date'
import { parseNatural } from './nlp'
import { isNativeApp } from './pwa'

export class AiError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'AiError'
  }
}

export interface AiParsedTask {
  title: string
  due: number | null
  allDay: boolean
  priority: Priority
  listId: string | null
  tags: string[]
  notes: string
  repeat: Repeat | null
  reminder: number | null
}

export interface PlanResult {
  summary: string
  items: PlanItem[]
  source: 'ai' | 'local'
}

export interface AiExtractedTask {
  title: string
  due: number | null
  allDay: boolean
  priority: Priority
  listId: string | null
  tags: string[]
  notes: string
  subtasks: string[]
}

export interface AiFilterDraft {
  name: string
  due: FilterDue
  priorities: Priority[]
  tag: string
  listId: string | null
  search: string
  includeCompleted: boolean
}

export interface AiOrganizeItem {
  taskId: string
  listId: string | null
  priority: Priority
  tags: string[]
  reason: string
}

export function aiConfigured(): boolean {
  const ai = getState().settings.ai
  return ai.enabled && !!ai.apiKey.trim()
}

export function aiModelLabel(): string {
  return getState().settings.ai.model || '未设置模型'
}

function normalizeAiBaseUrl(baseUrl: string): string {
  let url = String(baseUrl || '').trim().replace(/\/+$/, '')
  if (!url) throw new AiError('请先在设置里填写 API Base URL')
  if (!/^https?:\/\//i.test(url)) url = 'https://' + url
  if (/\/chat\/completions$/i.test(url)) url = url.replace(/\/chat\/completions$/i, '')
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    throw new AiError('Base URL 格式不正确')
  }
  if (parsed.pathname === '/' || parsed.pathname === '') url += '/v1'
  return url.replace(/\/+$/, '')
}

function readAiErrorPayload(payload: unknown): string {
  if (!payload || typeof payload !== 'object') return ''
  const data = payload as Record<string, unknown>
  const error = data.error
  if (error) {
    if (typeof error === 'string') return error
    if (typeof error === 'object') {
      const detail = error as Record<string, unknown>
      return String(detail.message || detail.code || detail.type || '').trim()
    }
  }
  return typeof data.message === 'string' ? data.message : ''
}

function parseAiPayload(raw: unknown): Record<string, unknown> | null {
  if (!raw) return null
  if (typeof raw === 'object') return raw as Record<string, unknown>
  if (typeof raw !== 'string') return null
  try {
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null
  } catch {
    return null
  }
}

function extractChatContent(data: Record<string, unknown>): string {
  const choices = data.choices
  if (!Array.isArray(choices) || !choices.length) return ''
  const first = choices[0] as Record<string, unknown>
  const message = first.message as Record<string, unknown> | undefined
  const content = message?.content ?? first.text
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === 'string') return part
        if (part && typeof part === 'object') return String((part as { text?: unknown }).text || '')
        return ''
      })
      .join('')
  }
  return ''
}

/**
 * 安卓原生端直接用系统网络访问模型接口：
 * 不依赖电脑端服务，也不受 WebView 的 CORS 限制。
 */
async function nativeAiChat(
  messages: AiMessage[],
  options: { json?: boolean; temperature?: number; signal?: AbortSignal } = {}
): Promise<{ content: string; model: string | null; usage: unknown }> {
  const ai = getState().settings.ai
  const endpoint = normalizeAiBaseUrl(ai.baseUrl) + '/chat/completions'
  const body: Record<string, unknown> = {
    model: ai.model || 'deepseek-chat',
    messages,
    temperature: typeof options.temperature === 'number' ? options.temperature : 0.3,
    stream: false
  }
  if (options.json) body.response_format = { type: 'json_object' }

  const send = async () => {
    if (options.signal?.aborted) throw new AiError('已停止生成')
    try {
      const { CapacitorHttp } = await import('@capacitor/core')
      return await CapacitorHttp.post({
        url: endpoint,
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${ai.apiKey}`
        },
        data: body,
        connectTimeout: 20000,
        readTimeout: 60000
      })
    } catch (err) {
      throw new AiError(`无法连接模型接口：${(err as Error).message}`)
    }
  }

  let response = await send()
  // 部分兼容接口不支持 response_format，返回 400 时自动降级重试一次
  if (options.json && response.status === 400) {
    delete body.response_format
    response = await send()
  }

  let data = parseAiPayload(response.data)
  if (response.status < 200 || response.status >= 300) {
    const detail =
      readAiErrorPayload(data) ||
      (typeof response.data === 'string' ? response.data.slice(0, 200) : '')
    throw new AiError(`模型接口返回 ${response.status}${detail ? `：${detail}` : ''}`)
  }
  if (!data) {
    throw new AiError('模型接口返回了非 JSON 内容，请检查 Base URL 是否指向 API 地址')
  }

  let providerError = readAiErrorPayload(data)
  if (providerError) throw new AiError(`模型接口返回错误：${providerError}`)

  let content = extractChatContent(data)
  // 某些兼容接口返回 200 但忽略 response_format 或内容为空，降级重试一次
  if (!content.trim() && options.json) {
    delete body.response_format
    const retry = await send()
    if (retry.status < 200 || retry.status >= 300) {
      const retryData = parseAiPayload(retry.data)
      const detail =
        readAiErrorPayload(retryData) ||
        (typeof retry.data === 'string' ? retry.data.slice(0, 200) : '')
      throw new AiError(`模型接口返回 ${retry.status}${detail ? `：${detail}` : ''}`)
    }
    const retryData = parseAiPayload(retry.data)
    if (retryData) {
      const retryError = readAiErrorPayload(retryData)
      if (retryError) throw new AiError(`模型接口返回错误：${retryError}`)
      data = retryData
      content = extractChatContent(retryData)
    }
  }

  if (!content.trim()) {
    const choices = data.choices
    const finish =
      Array.isArray(choices) && choices.length
        ? (choices[0] as { finish_reason?: string }).finish_reason
        : undefined
    throw new AiError(
      `模型没有返回内容${finish ? `（finish_reason: ${finish}）` : ''}，请检查模型名称或接口地址`
    )
  }

  return {
    content,
    model: typeof data.model === 'string' ? data.model : null,
    usage: data.usage ?? null
  }
}

export async function aiChat(
  messages: AiMessage[],
  options: { json?: boolean; temperature?: number; signal?: AbortSignal } = {}
): Promise<string> {
  const ai = getState().settings.ai
  if (!ai.enabled) throw new AiError('AI 功能已关闭，请到设置里开启')
  if (!ai.apiKey.trim()) throw new AiError('还没有配置 API Key，请到「设置 → AI 助手」填写')

  // 安卓 App 直接请求模型接口，不依赖电脑端服务
  if (isNativeApp()) {
    return (await nativeAiChat(messages, options)).content
  }

  let response: Response
  try {
    response = await fetch(apiBase() + '/api/ai/chat', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        baseUrl: ai.baseUrl,
        apiKey: ai.apiKey,
        model: ai.model,
        messages,
        json: options.json,
        temperature: options.temperature
      }),
      signal: options.signal
    })
  } catch {
    if (options.signal?.aborted) throw new AiError('已停止生成')
    throw new AiError('连接不上 AI 服务，请确认应用服务端已启动')
  }

  const raw = await response.text()
  let data: { ok?: boolean; error?: string; content?: string } | null = null
  try {
    data = raw ? (JSON.parse(raw) as { ok?: boolean; error?: string; content?: string }) : null
  } catch {
    data = null
  }
  if (!data) {
    throw new AiError(
      `AI 服务返回了非接口内容（HTTP ${response.status}），请检查服务地址是否指向刻度清单服务端`
    )
  }
  if (!response.ok || !data.ok) {
    throw new AiError(data.error || `AI 服务返回异常（HTTP ${response.status}）`)
  }
  return String(data.content || '')
}

/** 流式对话：逐段回调，返回完整文本 */
export async function aiChatStream(
  messages: AiMessage[],
  options: { json?: boolean; temperature?: number; signal?: AbortSignal } = {},
  onDelta?: (fullText: string) => void
): Promise<string> {
  const ai = getState().settings.ai
  if (!ai.enabled) throw new AiError('AI 功能已关闭，请到设置里开启')
  if (!ai.apiKey.trim()) throw new AiError('还没有配置 API Key，请到「设置 → AI 助手」填写')

  // 安卓原生网络不支持 SSE 流式读取，改为一次性返回完整结果
  if (isNativeApp()) {
    const result = await nativeAiChat(messages, options)
    onDelta?.(result.content)
    return result.content
  }

  let response: Response
  try {
    response = await fetch(apiBase() + '/api/ai/stream', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        baseUrl: ai.baseUrl,
        apiKey: ai.apiKey,
        model: ai.model,
        messages,
        json: options.json,
        temperature: options.temperature
      }),
      signal: options.signal
    })
  } catch {
    if (options.signal?.aborted) throw new AiError('已停止生成')
    throw new AiError('连接不上 AI 服务，请确认应用服务端已启动')
  }

  if (!response.ok) {
    const raw = await response.text()
    let data: { error?: string } | null = null
    try {
      data = raw ? (JSON.parse(raw) as { error?: string }) : null
    } catch {
      data = null
    }
    throw new AiError(data?.error || `AI 服务返回异常（HTTP ${response.status}）`)
  }

  const contentType = response.headers.get('content-type') || ''
  if (!contentType.includes('text/event-stream')) {
    const raw = await response.text()
    let data: { error?: string } | null = null
    try {
      data = raw ? (JSON.parse(raw) as { error?: string }) : null
    } catch {
      data = null
    }
    throw new AiError(
      data?.error ||
        `AI 服务返回了非接口内容（HTTP ${response.status}），请检查服务地址是否指向刻度清单服务端`
    )
  }
  if (!response.body) throw new AiError('当前环境不支持流式响应')

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let full = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() || ''
    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed.startsWith('data:')) continue
      const payload = trimmed.slice(5).trim()
      if (!payload || payload === '[DONE]') continue
      try {
        const parsed = JSON.parse(payload)
        const delta = parsed?.choices?.[0]?.delta?.content
        if (typeof delta === 'string' && delta) {
          full += delta
          onDelta?.(full)
        }
      } catch {
        /* 忽略无法解析的心跳或分片 */
      }
    }
  }

  return full
}

export async function fetchModelList(): Promise<string[]> {
  const ai = getState().settings.ai
  if (!ai.apiKey.trim()) throw new AiError('请先填写 API Key')

  if (isNativeApp()) {
    const endpoint = normalizeAiBaseUrl(ai.baseUrl) + '/models'
    let response
    try {
      const { CapacitorHttp } = await import('@capacitor/core')
      response = await CapacitorHttp.get({
        url: endpoint,
        headers: { authorization: `Bearer ${ai.apiKey}` },
        connectTimeout: 20000,
        readTimeout: 20000
      })
    } catch (err) {
      throw new AiError(`无法连接模型接口：${(err as Error).message}`)
    }
    const data = parseAiPayload(response.data)
    if (response.status < 200 || response.status >= 300) {
      const detail =
        readAiErrorPayload(data) ||
        (typeof response.data === 'string' ? response.data.slice(0, 200) : '')
      throw new AiError(`模型接口返回 ${response.status}${detail ? `：${detail}` : ''}`)
    }
    if (!data) throw new AiError('模型列表接口返回了非 JSON 内容，请检查 Base URL')
    const providerError = readAiErrorPayload(data)
    if (providerError) throw new AiError(`模型接口返回错误：${providerError}`)
    const list = data.data
    return Array.isArray(list)
      ? list
          .map((item) =>
            item && typeof item === 'object' ? String((item as { id?: unknown }).id || '') : ''
          )
          .filter(Boolean)
      : []
  }

  let response: Response
  try {
    response = await fetch(apiBase() + '/api/ai/models', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ baseUrl: ai.baseUrl, apiKey: ai.apiKey })
    })
  } catch {
    throw new AiError('连接不上 AI 服务，请确认应用服务端已启动')
  }
  const data = await response.json().catch(() => ({}))
  if (!response.ok || !data?.ok) throw new AiError(data?.error || '获取模型列表失败')
  return Array.isArray(data.models) ? data.models.map(String) : []
}

export async function testAiConnection(): Promise<string> {
  // 连接测试不依赖 JSON 输出，兼容不支持 response_format 的模型
  const content = await aiChat(
    [
      { role: 'system', content: '你是连接测试助手，请用一句很短的话回复。' },
      { role: 'user', content: '请回复：连接成功' }
    ],
    { json: false, temperature: 0 }
  )
  if (!content.trim()) throw new AiError('模型返回了空内容，请检查模型名称或接口地址')
  return content.slice(0, 80)
}

export function extractJson<T>(raw: string): T | null {
  if (!raw) return null
  let text = raw.trim()
  text = text.replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim()
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start === -1 || end <= start) return null
  const slice = text.slice(start, end + 1)
  try {
    return JSON.parse(slice) as T
  } catch {
    return null
  }
}

export function normalizePriority(value: unknown): Priority {
  const n = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(n) || n <= 0) return 0
  if (n >= 4) return 5
  if (n >= 2) return 3
  return 1
}

function resolveListId(listName: unknown, lists: TaskList[]): string | null {
  const clean = typeof listName === 'string' ? listName.trim() : ''
  if (!clean) return null
  const match =
    lists.find((list) => list.name === clean) ||
    lists.find((list) => list.name.includes(clean) || clean.includes(list.name))
  return match?.id ?? null
}

export function parseAiDue(value: unknown, now: Date = new Date()): { ts: number | null; allDay: boolean } {
  if (value === null || value === undefined || value === '') return { ts: null, allDay: true }
  if (typeof value === 'number' && Number.isFinite(value)) return { ts: value, allDay: false }
  const text = String(value).trim()
  if (!text || text.toLowerCase() === 'null') return { ts: null, allDay: true }

  const iso = text.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[T\s](\d{1,2}):(\d{2}))?/)
  if (iso) {
    const hasTime = iso[4] !== undefined
    const date = new Date(
      Number(iso[1]),
      Number(iso[2]) - 1,
      Number(iso[3]),
      hasTime ? Number(iso[4]) : 0,
      hasTime ? Number(iso[5]) : 0,
      0,
      0
    )
    return { ts: date.getTime(), allDay: !hasTime }
  }

  // 兜底：让本地解析器理解「明天下午三点」这类相对时间
  const parsed = parseNatural(text, [])
  return { ts: parsed.due, allDay: parsed.allDay }
}

export function buildTaskContext(limit = 60): string {
  const state = getState()
  const lists = sortedLists(state)
  const listNames: Record<string, string> = {}
  for (const l of lists) listNames[l.id] = l.name

  const tasks = Object.values(state.data.tasks)
    .filter((t) => !t.deletedAt && !t.completed)
    .sort((a, b) => {
      const ad = a.due ?? Number.MAX_SAFE_INTEGER
      const bd = b.due ?? Number.MAX_SAFE_INTEGER
      if (ad !== bd) return ad - bd
      return b.priority - a.priority
    })
    .slice(0, limit)

  const now = new Date()
  const lines = tasks.map((t) => {
    const parts = [`- ${t.title}`]
    parts.push(`清单:${listNames[t.listId] || '收件箱'}`)
    parts.push(`截止:${t.due ? formatDueIso(t.due, t.allDay) : '无'}`)
    if (t.priority) parts.push(`优先级:${t.priority === 5 ? '高' : t.priority === 3 ? '中' : '低'}`)
    if (t.estimate) parts.push(`预计:${t.estimate}分钟`)
    if (t.tags.length) parts.push(`标签:${t.tags.join('/')}`)
    if (t.subtasks.length) {
      parts.push(`子任务:${t.subtasks.filter((s) => !s.done).length}/${t.subtasks.length}未完成`)
    }
    return parts.join(' | ')
  })

  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const todayEnd = todayStart + 86400000 - 1
  const active = Object.values(state.data.tasks).filter((t) => !t.deletedAt && !t.completed)
  const overdue = active.filter((t) => t.due !== null && t.due < todayStart).length
  const todayCount = active.filter((t) => t.due !== null && t.due >= todayStart && t.due <= todayEnd).length
  const doneWeek = Object.values(state.data.tasks).filter(
    (t) => !t.deletedAt && t.completed && t.completedAt && t.completedAt > todayStart - 6 * 86400000
  ).length

  return [
    `当前时间：${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}（周${'日一二三四五六'[now.getDay()]}）`,
    `清单：${lists.map((l) => l.name).join('、') || '收件箱'}`,
    `统计：今日待办 ${todayCount} 个，逾期 ${overdue} 个，最近 7 天完成 ${doneWeek} 个`,
    `未完成任务（按截止时间排序，最多 ${limit} 条）：`,
    lines.length ? lines.join('\n') : '（暂无未完成任务）'
  ].join('\n')
}

export async function aiParseTask(text: string): Promise<AiParsedTask> {
  const lists = sortedLists(getState()).filter((l) => l.id !== 'inbox')
  const now = new Date()
  const system = [
    '你是任务录入解析器，把用户的一句话解析成结构化任务。',
    `当前时间：${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`,
    `用户已有清单：${lists.map((l) => l.name).join('、') || '无'}`,
    '只输出 JSON，格式：',
    '{"title":"清理后的任务标题","due":"YYYY-MM-DD HH:mm 或 YYYY-MM-DD 或 null","allDay":true/false,"priority":0|1|3|5,"listName":"清单名或null","tags":["标签"],"notes":"补充说明或空字符串","repeat":"daily|weekdays|weekly|monthly|yearly|null","reminder":0|5|15|30|60|null}',
    '规则：',
    '1. title 不要包含时间、优先级、标签、清单等修饰词；',
    '2. 只说日期不说具体时间时 allDay=true，due 用 YYYY-MM-DD；',
    '3. 优先级：5=高，3=中，1=低，0=无；没有明确语气时用 0；',
    '4. 只有用户明确提到清单时才填 listName，且优先使用已有清单；',
    '5. reminder 表示提前多少分钟提醒：说「提醒我」时用 0，「提前半小时」用 30，「提前一天」用 1440；没有提到时用 null；',
    '6. 没有提到的字段用 null 或空数组，不要编造。'
  ].join('\n')

  const raw = await aiChat(
    [
      { role: 'system', content: system },
      { role: 'user', content: text }
    ],
    { json: true, temperature: 0.1 }
  )
  const data = extractJson<Record<string, unknown>>(raw)
  if (!data) throw new AiError('AI 返回的内容无法解析')

  const dueInfo = parseAiDue(data.due)
  const listId = resolveListId(data.listName, lists)
  const repeatValue = typeof data.repeat === 'string' ? data.repeat : ''
  const repeat: Repeat | null = ['daily', 'weekdays', 'weekly', 'monthly', 'yearly'].includes(repeatValue)
    ? (repeatValue as Repeat)
    : null
  const reminder =
    typeof data.reminder === 'number' && Number.isFinite(data.reminder)
      ? Math.min(10080, Math.max(0, Math.round(data.reminder)))
      : null

  return {
    title: String(data.title || text).trim(),
    due: dueInfo.ts,
    allDay: typeof data.allDay === 'boolean' ? data.allDay : dueInfo.allDay,
    priority: normalizePriority(data.priority),
    listId,
    tags: Array.isArray(data.tags) ? data.tags.map((t) => String(t)).filter(Boolean).slice(0, 6) : [],
    notes: typeof data.notes === 'string' ? data.notes : '',
    repeat,
    reminder
  }
}

/** 从会议纪要、聊天记录等长文本中批量提取任务 */
export async function aiExtractTasks(text: string): Promise<AiExtractedTask[]> {
  const content = text.trim()
  if (!content) throw new AiError('请先粘贴要提取的文本')
  const lists = sortedLists(getState()).filter((list) => list.id !== 'inbox')
  const now = new Date()
  const system = [
    '你是任务提取助手。从用户提供的文本中提取所有可以执行的具体任务，忽略背景介绍、闲聊和已经完成的事情。',
    `当前时间：${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`,
    `用户已有清单：${lists.map((list) => list.name).join('、') || '无'}`,
    '只输出 JSON，格式：',
    '{"tasks":[{"title":"动词开头的具体任务","due":"YYYY-MM-DD HH:mm 或 YYYY-MM-DD 或 null","allDay":true/false,"priority":0|1|3|5,"listName":"清单名或null","tags":["标签"],"notes":"原文里的关键信息或空字符串","subtasks":["子任务"]}]}',
    '规则：',
    '1. 最多提取 12 条，标题不超过 40 字，以动词开头；',
    '2. 没有明确时间就不要编造 due，没有明确优先级就用 0；',
    '3. 合并重复或高度相似的任务；',
    '4. 文本里没有可执行任务时返回 {"tasks":[]}。'
  ].join('\n')

  const raw = await aiChat(
    [
      { role: 'system', content: system },
      { role: 'user', content: content.slice(0, 6000) }
    ],
    { json: true, temperature: 0.2 }
  )

  const parsed = extractJson<unknown>(raw)
  const rawTasks = Array.isArray(parsed)
    ? parsed
    : parsed && typeof parsed === 'object' && Array.isArray((parsed as { tasks?: unknown[] }).tasks)
      ? ((parsed as { tasks: unknown[] }).tasks as unknown[])
      : null
  if (!rawTasks) throw new AiError('AI 没有返回可用的任务列表')

  const seen = new Set<string>()
  const result: AiExtractedTask[] = []
  for (const entry of rawTasks.slice(0, 12)) {
    if (!entry || typeof entry !== 'object') continue
    const item = entry as Record<string, unknown>
    const title = String(item.title || '').trim().slice(0, 80)
    if (!title || seen.has(title)) continue
    seen.add(title)
    const dueInfo = parseAiDue(item.due)
    result.push({
      title,
      due: dueInfo.ts,
      allDay: typeof item.allDay === 'boolean' ? item.allDay : dueInfo.allDay,
      priority: normalizePriority(item.priority),
      listId: resolveListId(item.listName, lists),
      tags: Array.isArray(item.tags)
        ? item.tags.map(String).map((tag) => tag.trim()).filter(Boolean).slice(0, 6)
        : [],
      notes: typeof item.notes === 'string' ? item.notes : '',
      subtasks: Array.isArray(item.subtasks)
        ? item.subtasks.map(String).map((sub) => sub.trim()).filter(Boolean).slice(0, 6)
        : []
    })
  }
  return result
}

export async function aiBreakdown(task: Pick<Task, 'title' | 'notes' | 'subtasks'>): Promise<string[]> {
  const system = [
    '你是任务拆解助手。把用户的任务拆成 3-6 个具体、可执行、以动词开头的子任务。',
    '每个子任务不超过 22 个字，不要重复父任务标题，不要编造与任务无关的内容。',
    '只输出 JSON：{"subtasks":["子任务1","子任务2"]}'
  ].join('\n')
  const existing = task.subtasks.map((s) => s.title).join('、')
  const user = [`任务：${task.title}`, task.notes ? `补充：${task.notes}` : '', existing ? `已有子任务：${existing}` : '']
    .filter(Boolean)
    .join('\n')

  const raw = await aiChat(
    [
      { role: 'system', content: system },
      { role: 'user', content: user }
    ],
    { json: true, temperature: 0.4 }
  )
  const data = extractJson<{ subtasks?: unknown[] }>(raw)
  if (!data || !Array.isArray(data.subtasks)) throw new AiError('AI 没有给出可用的子任务')
  return data.subtasks.map((s) => String(s).trim()).filter(Boolean).slice(0, 8)
}

/** 把一句自然语言转换成智能筛选规则 */
export async function aiGenerateFilter(description: string): Promise<AiFilterDraft> {
  const content = description.trim()
  if (!content) throw new AiError('先描述一下你想筛选什么')
  const lists = sortedLists(getState()).filter((list) => list.id !== 'inbox')
  const now = new Date()
  const system = [
    '你是智能筛选规则生成器。把用户的一句话转换成任务筛选条件。',
    `当前时间：${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`,
    `用户已有清单：${lists.map((list) => list.name).join('、') || '无'}`,
    '只输出 JSON：',
    '{"name":"简短名称","due":"any|today|week|overdue|none","priorities":[0,1,3,5],"tag":"标签或空字符串","listName":"清单名或null","search":"关键词或空字符串","includeCompleted":false}',
    '规则：',
    '1. due: today=今天到期，week=最近 7 天，overdue=已逾期，none=没有日期，any=不限；',
    '2. priorities 只填用户明确提到的优先级，不填表示全部；5=高 3=中 1=低 0=无；',
    '3. tag 不带 #；listName 必须来自已有清单；search 用于标题/备注关键词；',
    '4. 没有提到的条件使用默认值，不要编造。'
  ].join('\n')

  const raw = await aiChat(
    [
      { role: 'system', content: system },
      { role: 'user', content }
    ],
    { json: true, temperature: 0.2 }
  )
  const data = extractJson<Record<string, unknown>>(raw)
  if (!data) throw new AiError('AI 返回的内容无法解析')

  const dueValues: FilterDue[] = ['any', 'today', 'week', 'overdue', 'none']
  const dueValue = String(data.due || 'any') as FilterDue
  const due = dueValues.includes(dueValue) ? dueValue : 'any'
  const priorities = Array.isArray(data.priorities)
    ? (Array.from(
        new Set(
          data.priorities
            .map((item) => Number(item))
            .filter((item) => [0, 1, 3, 5].includes(item))
        )
      ) as Priority[])
    : []

  return {
    name: String(data.name || 'AI 筛选').trim().slice(0, 20),
    due,
    priorities,
    tag: typeof data.tag === 'string' ? data.tag.replace(/^#/, '').trim() : '',
    listId: resolveListId(data.listName, lists),
    search: typeof data.search === 'string' ? data.search.trim() : '',
    includeCompleted: data.includeCompleted === true
  }
}

/** AI 整理收件箱：给出清单、优先级和标签建议 */
export async function aiOrganizeTasks(tasks: Task[]): Promise<AiOrganizeItem[]> {
  if (!tasks.length) return []
  const lists = sortedLists(getState()).filter((list) => list.id !== 'inbox')
  const payload = tasks.slice(0, 30).map((task) => ({
    id: task.id,
    title: task.title,
    notes: task.notes.slice(0, 120),
    tags: task.tags,
    priority: task.priority,
    due: task.due ? formatDueIso(task.due, task.allDay) : null
  }))

  const system = [
    '你是任务整理助手。根据任务内容，把它归入最合适的清单，并修正优先级和标签。',
    `用户已有清单：${lists.map((list) => list.name).join('、') || '无'}`,
    '只输出 JSON：',
    '{"items":[{"id":"任务id","listName":"已有清单名","priority":0|1|3|5,"tags":["标签"],"reason":"不超过12字"}]}',
    '规则：',
    '1. 不要修改任务标题，不要编造任务；',
    '2. listName 必须来自已有清单，没有把握时保留当前清单；',
    '3. 优先级：5=高，3=中，1=低，0=无；不确定时保留原值；',
    '4. 标签最多 2 个，不要重复已有标签；',
    '5. 每个任务都要返回一条。'
  ].join('\n')

  const raw = await aiChat(
    [
      { role: 'system', content: system },
      { role: 'user', content: JSON.stringify(payload) }
    ],
    { json: true, temperature: 0.2 }
  )
  const data = extractJson<{ items?: Array<Record<string, unknown>> }>(raw)
  if (!data?.items?.length) throw new AiError('AI 没有给出整理建议')

  const byId = new Map(tasks.map((task) => [task.id, task]))
  const result: AiOrganizeItem[] = []
  for (const item of data.items.slice(0, 30)) {
    const task = byId.get(String(item.id))
    if (!task) continue
    const rawPriority = Number(item.priority)
    const priority = [0, 1, 3, 5].includes(rawPriority)
      ? (rawPriority as Priority)
      : task.priority
    result.push({
      taskId: task.id,
      listId: resolveListId(item.listName, lists),
      priority,
      tags: Array.isArray(item.tags)
        ? Array.from(
            new Set(
              item.tags
                .map(String)
                .map((tag) => tag.trim().replace(/^#/, ''))
                .filter(Boolean)
            )
          ).slice(0, 2)
        : [],
      reason: typeof item.reason === 'string' ? item.reason.slice(0, 24) : ''
    })
  }
  if (!result.length) throw new AiError('AI 的整理建议无法匹配到任务')
  return result
}

/** AI 估算任务耗时（分钟） */
export async function aiEstimateTask(task: Pick<Task, 'title' | 'notes' | 'subtasks'>): Promise<number> {
  const system = [
    '你是任务耗时估算助手。根据任务标题、备注和子任务，估算完成它需要的分钟数。',
    '只输出 JSON：{"minutes":45}',
    '规则：15 到 240 之间，取 5 的倍数；无法判断时给 30；不要输出其他字段。'
  ].join('\n')
  const user = [
    task.title,
    task.notes,
    task.subtasks.length ? `子任务：${task.subtasks.map((subtask) => subtask.title).join('、')}` : ''
  ]
    .filter(Boolean)
    .join('\n')

  const raw = await aiChat(
    [
      { role: 'system', content: system },
      { role: 'user', content: user }
    ],
    { json: true, temperature: 0.2 }
  )
  const data = extractJson<{ minutes?: number }>(raw)
  if (!data || typeof data.minutes !== 'number' || !Number.isFinite(data.minutes)) {
    throw new AiError('AI 没有给出耗时估算')
  }
  return Math.min(240, Math.max(5, Math.round(data.minutes / 5) * 5))
}

function planCandidates(): Task[] {
  const now = Date.now()
  const endToday = new Date()
  endToday.setHours(23, 59, 59, 999)
  const tasks = Object.values(getState().data.tasks).filter((t) => !t.deletedAt && !t.completed)
  const dueToday = tasks
    .filter((t) => t.due !== null && t.due <= endToday.getTime())
    .sort((a, b) => {
      const ad = a.due ?? Number.MAX_SAFE_INTEGER
      const bd = b.due ?? Number.MAX_SAFE_INTEGER
      if (ad !== bd) return ad - bd
      return b.priority - a.priority
    })
  if (dueToday.length >= 2) return dueToday.slice(0, 12)
  const extra = tasks
    .filter((t) => t.due === null)
    .sort((a, b) => b.priority - a.priority)
    .slice(0, 6)
  return [...dueToday, ...extra].slice(0, 12)
}

export function localPlan(): PlanResult {
  const candidates = planCandidates()
  const sorted = candidates.slice().sort((a, b) => {
    const aOver = a.due !== null && a.due < new Date().setHours(0, 0, 0, 0) ? 1 : 0
    const bOver = b.due !== null && b.due < new Date().setHours(0, 0, 0, 0) ? 1 : 0
    if (aOver !== bOver) return bOver - aOver
    if (a.priority !== b.priority) return b.priority - a.priority
    return (a.due ?? 0) - (b.due ?? 0)
  })

  let minutes = 9 * 60
  const items: PlanItem[] = sorted.slice(0, 5).map((task) => {
    const time = `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`
    const isOverdue = task.due !== null && task.due < new Date().setHours(0, 0, 0, 0)
    minutes += task.estimate || 60
    return {
      taskId: task.id,
      title: task.title,
      time,
      reason: isOverdue ? '已逾期，优先处理' : task.priority >= 5 ? '高优先级' : '按计划推进'
    }
  })

  return {
    summary: items.length ? '根据逾期情况与优先级为你排了顺序，也可以配置 AI 获得更细致的建议。' : '今天没有待办，给自己留点空白也不错。',
    items,
    source: 'local'
  }
}

export async function aiPlanDay(signal?: AbortSignal): Promise<PlanResult> {
  if (!aiConfigured()) return localPlan()

  const candidates = planCandidates()
  if (!candidates.length) {
    return { summary: '今天没有待办任务，可以安排一次复盘或休息。', items: [], source: 'local' }
  }

  const context = buildTaskContext(40)
  const system = [
    '你是日程规划助手。请根据用户真实的未完成任务，给出今天可执行的计划。',
    context,
    '只输出 JSON，格式：',
    '{"summary":"一句话的整体建议","items":[{"title":"任务标题（必须与上面某条完全一致）","time":"HH:mm","reason":"为什么安排在这个时间，15 字以内"}]}',
    '规则：',
    '1. 只从「今天应完成」的任务中选择，最多 6 个，不要编造任务；',
    '2. 逾期任务和高优先级任务优先，需要专注的工作放上午；',
    '3. 每项之间至少间隔 30 分钟，从 09:00 开始，避开 12:00-13:30；',
    '4. 相似或同清单的任务尽量连在一起。'
  ].join('\n')

  const raw = await aiChat(
    [
      { role: 'system', content: system },
      { role: 'user', content: '请为我安排今天的任务顺序。' }
    ],
    { json: true, temperature: 0.3, signal }
  )

  const data = extractJson<{ summary?: string; items?: Array<Record<string, unknown>> }>(raw)
  if (!data?.items?.length) return localPlan()

  const tasks = candidates
  const items: PlanItem[] = []
  for (const item of data.items) {
    const title = String(item.title || '').trim()
    if (!title) continue
    const task =
      tasks.find((t) => t.title === title) ||
      tasks.find((t) => t.title.includes(title) || title.includes(t.title)) ||
      tasks.find((t) => t.title.toLowerCase().includes(title.toLowerCase()))
    if (!task) continue
    items.push({
      taskId: task.id,
      title: task.title,
      time: typeof item.time === 'string' ? item.time : '09:00',
      reason: typeof item.reason === 'string' ? item.reason : ''
    })
  }

  if (!items.length) return localPlan()
  return {
    summary: typeof data.summary === 'string' ? data.summary : '按优先级为你排好了今天的节奏。',
    items: items.slice(0, 6),
    source: 'ai'
  }
}

export function listNamesForPrompt(lists: TaskList[]): string {
  return lists.map((l) => l.name).join('、')
}

export function todayKey(): string {
  return dayKey(Date.now())
}
