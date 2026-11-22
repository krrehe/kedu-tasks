'use strict'

const path = require('path')
const fs = require('fs')
const os = require('os')
const express = require('express')
const { Store, namespaceFor } = require('./store')

const DEFAULT_PORT = Number(process.env.PORT || 8787)
const DEFAULT_HOST = process.env.HOST || '0.0.0.0'

function normalizeBaseUrl(baseUrl) {
  let url = String(baseUrl || '').trim().replace(/\/+$/, '')
  if (!url) throw new Error('缺少 Base URL')
  if (!/^https?:\/\//i.test(url)) url = 'https://' + url
  if (/\/chat\/completions$/i.test(url)) url = url.replace(/\/chat\/completions$/i, '')
  let parsed
  try {
    parsed = new URL(url)
  } catch {
    throw new Error('Base URL 格式不正确')
  }
  if (parsed.pathname === '/' || parsed.pathname === '') url += '/v1'
  return url.replace(/\/+$/, '')
}

function chatEndpoint(baseUrl) {
  return normalizeBaseUrl(baseUrl) + '/chat/completions'
}

function modelsEndpoint(baseUrl) {
  return normalizeBaseUrl(baseUrl) + '/models'
}

function buildChatBody({ model, messages, temperature, json, stream }) {
  const body = {
    model: model || 'deepseek-chat',
    messages,
    temperature: typeof temperature === 'number' ? temperature : 0.3,
    stream: !!stream
  }
  if (json) body.response_format = { type: 'json_object' }
  return body
}

/**
 * 创建一个可嵌入桌面客户端的 Express 应用。
 * dataDir 可指向 Electron 的 userData 目录，distDir 可指向打包后的前端资源。
 */
function createApp({
  dataDir = path.join(__dirname, 'data'),
  distDir = path.join(__dirname, '..', 'client', 'dist')
} = {}) {
  const app = express()
  const store = new Store(dataDir)

  app.disable('x-powered-by')
  app.use(express.json({ limit: '30mb' }))

  // 局域网/自托管场景下允许跨域，便于手机端开发调试
  app.use('/api', (req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Headers', 'content-type, authorization')
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
    if (req.method === 'OPTIONS') return res.sendStatus(204)
    next()
  })

  app.get('/api/health', (req, res) => {
    res.json({ ok: true, app: 'kedu-tasks', time: Date.now() })
  })

  app.get('/api/info', (req, res) => {
    const addresses = []
    const nets = os.networkInterfaces()
    for (const name of Object.keys(nets)) {
      for (const net of nets[name] || []) {
        if (net.family === 'IPv4' && !net.internal) addresses.push(net.address)
      }
    }
    const port = (req.socket && req.socket.localPort) || DEFAULT_PORT
    res.json({
      ok: true,
      port,
      addresses,
      url: `http://${addresses[0] || 'localhost'}:${port}`
    })
  })

  /**
   * 增量同步：客户端推送本地全部实体，服务端按 updatedAt 做 LWW 合并，
   * 再返回 seq 大于 since 的所有实体（包含墓碑，用于删除传播）。
   */
  app.post('/api/sync', async (req, res) => {
    try {
      const { code = '', since = 0, entities = {} } = req.body || {}
      const ns = namespaceFor(code)
      const result = await store.sync(ns, Math.max(0, Number(since) || 0), entities || {})
      res.json({ ok: true, ...result })
    } catch (err) {
      console.error('[sync] 失败:', err)
      res.status(500).json({ ok: false, error: err.message || '同步失败' })
    }
  })

  /** 拉取 OpenAI 兼容接口的模型列表 */
  app.post('/api/ai/models', async (req, res) => {
    const { baseUrl, apiKey } = req.body || {}
    if (!apiKey) return res.status(400).json({ ok: false, error: '请先在设置中填写 API Key' })
    let url
    try {
      url = modelsEndpoint(baseUrl)
    } catch (err) {
      return res.status(400).json({ ok: false, error: err.message })
    }
    try {
      const response = await fetch(url, {
        headers: { authorization: `Bearer ${apiKey}` },
        signal: AbortSignal.timeout(20000)
      })
      const text = await response.text()
      if (!response.ok) {
        return res.status(502).json({
          ok: false,
          error: `模型接口返回 ${response.status}`,
          detail: text.slice(0, 400)
        })
      }
      let data
      try {
        data = JSON.parse(text)
      } catch {
        return res.status(502).json({
          ok: false,
          error: '模型列表接口返回了非 JSON 内容，请检查 Base URL',
          detail: text.slice(0, 400)
        })
      }
      if (data?.error) {
        const error = data.error
        const message =
          typeof error === 'string' ? error : error?.message || error?.code || JSON.stringify(error)
        return res.status(502).json({
          ok: false,
          error: `模型接口返回错误：${message}`,
          detail: text.slice(0, 400)
        })
      }
      const models = Array.isArray(data?.data)
        ? data.data.map((item) => item?.id).filter((id) => typeof id === 'string' && id)
        : []
      res.json({ ok: true, models })
    } catch (err) {
      res.status(502).json({ ok: false, error: `无法连接模型接口：${err.message}` })
    }
  })

  /** OpenAI 兼容接口代理：密钥只在请求内存中出现，不落盘、不打印 */
  app.post('/api/ai/chat', async (req, res) => {
    const { baseUrl, apiKey, model, messages, temperature, json } = req.body || {}
    if (!apiKey) return res.status(400).json({ ok: false, error: '请先在设置中填写 API Key' })
    if (!Array.isArray(messages) || !messages.length) {
      return res.status(400).json({ ok: false, error: 'messages 不能为空' })
    }

    let url
    try {
      url = chatEndpoint(baseUrl)
    } catch (err) {
      return res.status(400).json({ ok: false, error: err.message })
    }

    const body = buildChatBody({ model, messages, temperature, json, stream: false })

    const send = async (payload) => {
      const r = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(60000)
      })
      return { r, text: await r.text() }
    }

    try {
      let { r, text } = await send(body)
      // 部分兼容接口不支持 response_format，自动降级重试一次
      if (!r.ok && json && r.status === 400) {
        delete body.response_format
        ;({ r, text } = await send(body))
      }
      if (!r.ok) {
        console.warn('[ai] 上游返回', r.status)
        return res.status(502).json({
          ok: false,
          error: `模型接口返回 ${r.status}`,
          detail: String(text).slice(0, 600)
        })
      }
      let data
      try {
        data = JSON.parse(text)
      } catch {
        return res.status(502).json({
          ok: false,
          error: '模型接口返回了非 JSON 内容，请检查 Base URL 是否指向 API 地址',
          detail: String(text).slice(0, 600)
        })
      }

      const readError = (payload) => {
        if (!payload?.error) return ''
        const error = payload.error
        if (typeof error === 'string') return error
        return error.message || error.code || JSON.stringify(error)
      }

      let providerError = readError(data)
      if (providerError) {
        return res.status(502).json({
          ok: false,
          error: `模型接口返回错误：${providerError}`,
          detail: String(text).slice(0, 600)
        })
      }

      let content = data?.choices?.[0]?.message?.content ?? data?.choices?.[0]?.text ?? ''

      // 有些兼容接口返回 200 但忽略 response_format 或内容为空，降级重试一次
      if (!content && json) {
        delete body.response_format
        const retry = await send(body)
        if (retry.r.ok) {
          try {
            data = JSON.parse(retry.text)
            providerError = readError(data)
            if (providerError) {
              return res.status(502).json({
                ok: false,
                error: `模型接口返回错误：${providerError}`,
                detail: String(retry.text).slice(0, 600)
              })
            }
            content = data?.choices?.[0]?.message?.content ?? data?.choices?.[0]?.text ?? ''
            text = retry.text
          } catch {
            /* 保持原始响应 */
          }
        }
      }

      if (!content) {
        const finish = data?.choices?.[0]?.finish_reason
        return res.status(502).json({
          ok: false,
          error: `模型没有返回内容${finish ? `（finish_reason: ${finish}）` : ''}，请检查模型名称或接口地址`,
          detail: String(text).slice(0, 600)
        })
      }

      res.json({ ok: true, content, usage: data?.usage || null, model: data?.model || model })
    } catch (err) {
      const isTimeout = err?.name === 'TimeoutError' || err?.name === 'AbortError'
      console.error('[ai] 请求失败:', err?.message)
      res.status(502).json({
        ok: false,
        error: isTimeout ? '模型响应超时（60 秒）' : `无法连接模型接口：${err.message}`
      })
    }
  })

  /** 流式代理：把上游 SSE 原样转发给浏览器 */
  app.post('/api/ai/stream', async (req, res) => {
    const { baseUrl, apiKey, model, messages, temperature, json } = req.body || {}
    if (!apiKey) return res.status(400).json({ ok: false, error: '请先在设置中填写 API Key' })
    if (!Array.isArray(messages) || !messages.length) {
      return res.status(400).json({ ok: false, error: 'messages 不能为空' })
    }

    let url
    try {
      url = chatEndpoint(baseUrl)
    } catch (err) {
      return res.status(400).json({ ok: false, error: err.message })
    }

    const controller = new AbortController()
    // 注意：request 的 close 在请求体读完时就会触发，用 response 的 close 判断客户端是否真正断开
    res.on('close', () => {
      if (!res.writableEnded) controller.abort()
    })

    try {
      const upstream = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
        body: JSON.stringify(buildChatBody({ model, messages, temperature, json, stream: true })),
        signal: controller.signal
      })

      if (!upstream.ok) {
        const detail = await upstream.text()
        console.warn('[ai] 流式上游返回', upstream.status)
        return res.status(502).json({
          ok: false,
          error: `模型接口返回 ${upstream.status}`,
          detail: detail.slice(0, 600)
        })
      }

      res.status(200)
      res.setHeader('Content-Type', 'text/event-stream; charset=utf-8')
      res.setHeader('Cache-Control', 'no-cache, no-transform')
      res.setHeader('Connection', 'keep-alive')
      res.setHeader('X-Accel-Buffering', 'no')
      if (res.flushHeaders) res.flushHeaders()

      const reader = upstream.body.getReader()
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        if (!res.writableEnded) res.write(Buffer.from(value))
      }
      res.end()
    } catch (err) {
      if (controller.signal.aborted) {
        if (!res.writableEnded) res.end()
        return
      }
      console.error('[ai] 流式请求失败:', err?.message)
      if (!res.headersSent) {
        res.status(502).json({ ok: false, error: `无法连接模型接口：${err.message}` })
      } else if (!res.writableEnded) {
        res.end()
      }
    }
  })

  if (fs.existsSync(distDir)) {
    app.get('/sw.js', (req, res) => {
      res.setHeader('Cache-Control', 'no-cache')
      res.sendFile(path.join(distDir, 'sw.js'))
    })
    app.use(express.static(distDir, { index: false, maxAge: '7d' }))
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api/')) return next()
      res.sendFile(path.join(distDir, 'index.html'), (err) => {
        if (err) res.status(404).send('客户端尚未构建：请先运行 npm run build')
      })
    })
  } else {
    app.get('/', (req, res) => {
      res.type('html').send(
        '<h3>刻度清单服务端已启动</h3><p>客户端尚未构建。开发模式请访问 Vite 地址（默认 http://localhost:5173）。</p>'
      )
    })
  }

  app.use((req, res) => res.status(404).json({ ok: false, error: 'Not found' }))

  return app
}

function printBanner(port) {
  const nets = os.networkInterfaces()
  const ips = Object.values(nets)
    .flat()
    .filter((n) => n && n.family === 'IPv4' && !n.internal)
    .map((n) => n.address)
  console.log('')
  console.log('  刻度清单 · 服务端已启动')
  console.log(`  本机:   http://localhost:${port}`)
  for (const ip of ips) console.log(`  手机:   http://${ip}:${port}   (同一 Wi-Fi 下可访问)`)
  console.log('')
}

function startServer({
  port = DEFAULT_PORT,
  host = DEFAULT_HOST,
  dataDir,
  distDir,
  quiet = false
} = {}) {
  const app = createApp({ dataDir, distDir })
  return new Promise((resolve, reject) => {
    const server = app.listen(port, host)
    server.once('listening', () => {
      const actualPort = server.address().port
      if (!quiet) printBanner(actualPort)
      resolve({ app, server, port: actualPort })
    })
    server.once('error', reject)
  })
}

if (require.main === module) {
  startServer().catch((err) => {
    console.error('服务端启动失败:', err.message)
    process.exit(1)
  })
}

module.exports = { createApp, startServer }
