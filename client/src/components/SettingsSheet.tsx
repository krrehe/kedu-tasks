import { useEffect, useRef, useState } from 'react'
import { setUI, updateSettings, useApp } from '../store'
import {
  exportData,
  importDataFile,
  resetTasks,
  restoreDemoData,
  setTheme,
  toast,
  updateAiSettings,
  updateSyncSettings
} from '../actions'
import { apiBase } from '../lib/api'
import { fetchModelList, testAiConnection } from '../lib/ai'
import { exportCalendar } from '../lib/ics'
import { syncNow, syncSummary } from '../lib/sync'
import { canInstall, isNativeApp, isStandalone, promptInstall } from '../lib/pwa'
import {
  ensureNotificationPermission,
  notificationPermissionLabel,
  showNotification
} from '../lib/notify'
import { Modal } from './Modal'
import { Icon } from './Icons'
import { cls } from '../lib/utils'

const PRESETS = [
  { name: 'DeepSeek', baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-chat' },
  { name: 'OpenAI', baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o-mini' },
  { name: '通义千问', baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1', model: 'qwen-plus' },
  { name: 'Kimi', baseUrl: 'https://api.moonshot.cn/v1', model: 'moonshot-v1-8k' },
  { name: 'Ollama', baseUrl: 'http://localhost:11434/v1', model: 'qwen2.5:7b' }
]

const ACCENT_OPTIONS = [
  { key: 'blue', label: '星蓝', color: '#4C6FFF' },
  { key: 'violet', label: '暮紫', color: '#8B5CF6' },
  { key: 'green', label: '松绿', color: '#16A34A' },
  { key: 'orange', label: '暖橙', color: '#EA7A1B' },
  { key: 'rose', label: '玫红', color: '#E5484D' }
] as const

const SETTINGS_SECTIONS = [
  ['settings-appearance', '外观'],
  ['settings-ai', 'AI 助手'],
  ['settings-sync', '多端同步'],
  ['settings-notify', '提醒通知'],
  ['settings-data', '数据'],
  ['settings-about', '关于']
] as const

export function SettingsSheet() {
  const state = useApp()
  const ai = state.settings.ai
  const sync = state.settings.sync
  const [showKey, setShowKey] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ ok: boolean; text: string } | null>(null)
  const [serverInfo, setServerInfo] = useState('')
  const [permissionLabel, setPermissionLabel] = useState(() => notificationPermissionLabel())
  const [models, setModels] = useState<string[]>([])
  const [loadingModels, setLoadingModels] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const standalone = isStandalone()

  useEffect(() => {
    if (!isNativeApp()) return
    let cancelled = false
    void (async () => {
      try {
        const { LocalNotifications } = await import('@capacitor/local-notifications')
        const permission = await LocalNotifications.checkPermissions()
        if (cancelled) return
        setPermissionLabel(
          permission.display === 'granted'
            ? '已授权'
            : permission.display === 'denied'
              ? '已被拒绝，请到系统设置开启'
              : '尚未授权'
        )
      } catch {
        /* 忽略插件异常 */
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  if (!state.ui.settingsOpen) return null

  const close = () => setUI({ settingsOpen: false })

  const runTest = async () => {
    if (testing) return
    setTesting(true)
    setTestResult(null)
    try {
      await testAiConnection()
      setTestResult({ ok: true, text: '连接成功，模型可以正常返回内容' })
    } catch (err) {
      setTestResult({ ok: false, text: (err as Error).message })
    } finally {
      setTesting(false)
    }
  }

  const loadModels = async () => {
    if (loadingModels) return
    setLoadingModels(true)
    try {
      const list = await fetchModelList()
      setModels(list)
      if (!list.length) {
        toast('接口没有返回可用模型，请手动填写模型名称', 'error')
      } else {
        if (!list.includes(ai.model)) updateAiSettings({ model: list[0] })
        toast(`找到 ${list.length} 个模型`, 'success')
      }
    } catch (err) {
      toast((err as Error).message, 'error')
    } finally {
      setLoadingModels(false)
    }
  }

  const checkServer = async () => {
    setServerInfo('检测中…')
    try {
      const base = apiBase()
      const response = await fetch(base + '/api/health')
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      let extra = ''
      try {
        const info = await fetch(base + '/api/info').then((r) => r.json())
        if (info?.addresses?.length) extra = ` · 手机可访问 http://${info.addresses[0]}:${info.port}`
      } catch {
        /* ignore */
      }
      setServerInfo(`服务端在线${extra}`)
    } catch (err) {
      setServerInfo(`无法连接：${(err as Error).message}`)
    }
  }

  const useCurrentAddress = () => {
    const url =
      location.port === '5173' || location.port === '4173'
        ? `${location.protocol}//${location.hostname}:8787`
        : location.origin
    updateSyncSettings({ url })
    toast('已填入当前服务地址', 'success')
  }

  const requestNotifications = async () => {
    const granted = await ensureNotificationPermission()
    if (isNativeApp()) {
      setPermissionLabel(granted ? '已授权' : '尚未授权，请在系统设置中允许通知')
    } else {
      setPermissionLabel(notificationPermissionLabel())
    }
    toast(granted ? '通知权限已开启' : '未获得通知权限', granted ? 'success' : 'error')
  }

  const sendTestNotification = async () => {
    const granted = await ensureNotificationPermission()
    setPermissionLabel(
      isNativeApp()
        ? granted
          ? '已授权'
          : '尚未授权，请在系统设置中允许通知'
        : notificationPermissionLabel()
    )
    if (!granted) {
      toast('请先允许通知权限', 'error')
      return
    }
    const shown = await showNotification(
      '刻度清单',
      '通知已开启，任务提醒和专注结束提醒会出现在这里。',
      'kedu-test'
    )
    toast(shown ? '测试通知已发送' : '当前环境无法发送系统通知', shown ? 'success' : 'error')
  }

  return (
    <Modal
      title="设置"
      subtitle="AI、同步与提醒"
      size="lg"
      onClose={close}
      footer={
        <button className="btn primary" onClick={close}>
          完成
        </button>
      }
    >
      <nav className="settings-nav">
        {SETTINGS_SECTIONS.map(([id, label]) => (
          <button
            key={id}
            className="settings-nav-btn"
            onClick={() =>
              document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
            }
          >
            {label}
          </button>
        ))}
      </nav>

      <section className="settings-section" id="settings-appearance">
        <h3>
          <Icon name="moon" size={16} />
          外观
        </h3>
        <div className="settings-row">
          <div>
            <span className="settings-label">主题</span>
            <p className="settings-desc">默认跟随系统深色模式</p>
          </div>
          <div className="segmented">
            {(
              [
                ['auto', '跟随系统'],
                ['light', '浅色'],
                ['dark', '深色']
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                className={cls('seg-item', state.settings.theme === value && 'active')}
                onClick={() => setTheme(value)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="settings-row">
          <div>
            <span className="settings-label">主题色</span>
            <p className="settings-desc">应用到按钮、选中态和强调色</p>
          </div>
          <div className="accent-row">
            {ACCENT_OPTIONS.map((option) => (
              <button
                key={option.key}
                className={cls(
                  'accent-swatch',
                  state.settings.accent === option.key && 'active'
                )}
                style={{ background: option.color }}
                onClick={() => updateSettings({ accent: option.key })}
                aria-label={`主题色 ${option.label}`}
                title={option.label}
              >
                {state.settings.accent === option.key && (
                  <Icon name="check" size={13} strokeWidth={3} />
                )}
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="settings-section" id="settings-ai">
        <h3>
          <Icon name="sparkles" size={16} />
          AI 助手
          <span className="section-tag">OpenAI 兼容</span>
        </h3>

        <div className="settings-row">
          <div>
            <span className="settings-label">启用 AI</span>
            <p className="settings-desc">关闭后只能使用本地规则解析</p>
          </div>
          <Toggle checked={ai.enabled} onChange={(value) => updateAiSettings({ enabled: value })} />
        </div>

        <label className="field">
          <span>API Base URL</span>
          <input
            value={ai.baseUrl}
            spellCheck={false}
            placeholder="https://api.deepseek.com/v1"
            onChange={(event) => updateAiSettings({ baseUrl: event.target.value })}
          />
        </label>

        <label className="field">
          <span>API Key</span>
          <div className="key-wrap">
            <input
              type={showKey ? 'text' : 'password'}
              value={ai.apiKey}
              spellCheck={false}
              placeholder="sk-..."
              onChange={(event) => updateAiSettings({ apiKey: event.target.value })}
            />
            <button type="button" onClick={() => setShowKey((v) => !v)} aria-label="显示或隐藏密钥">
              <Icon name={showKey ? 'eye-off' : 'eye'} size={16} />
            </button>
          </div>
        </label>

        <label className="field">
          <span>模型名称</span>
          <div className="inline-field">
            <input
              value={ai.model}
              spellCheck={false}
              placeholder="deepseek-chat"
              onChange={(event) => updateAiSettings({ model: event.target.value })}
            />
            <button
              type="button"
              className="btn small"
              onClick={() => void loadModels()}
              disabled={loadingModels || !ai.apiKey}
            >
              {loadingModels ? '获取中…' : '获取列表'}
            </button>
          </div>
        </label>

        {models.length > 0 && (
          <label className="field">
            <span>接口返回的模型（{models.length}）</span>
            <select
              value={models.includes(ai.model) ? ai.model : ''}
              onChange={(event) => updateAiSettings({ model: event.target.value })}
            >
              <option value="">请选择模型</option>
              {models.map((model) => (
                <option key={model} value={model}>
                  {model}
                </option>
              ))}
            </select>
          </label>
        )}

        <div className="preset-row">
          {PRESETS.map((preset) => (
            <button
              key={preset.name}
              className="preset"
              onClick={() =>
                updateAiSettings({ baseUrl: preset.baseUrl, model: preset.model })
              }
            >
              {preset.name}
            </button>
          ))}
        </div>

        <div className="settings-actions">
          <button className="btn" onClick={runTest} disabled={testing || !ai.apiKey}>
            {testing ? '测试中…' : '测试连接'}
          </button>
          {testResult && (
            <span className={cls('test-result', testResult.ok ? 'ok' : 'err')}>{testResult.text}</span>
          )}
        </div>
        <p className="settings-note">
          连接失败时，上方会显示接口返回的具体原因，请优先检查 Base URL、模型名和 Key。
          {isNativeApp()
            ? ' 安卓 App 会直接连接模型接口，API Key 只保存在本机设置中。'
            : ' Key 只保存在当前设备的本地数据库，请求通过本机服务端转发，不会写进日志。'}
          Ollama 等本地模型可随意填写 Key（例如 ollama）。
        </p>
      </section>

      <section className="settings-section" id="settings-sync">
        <h3>
          <Icon name="cloud" size={16} />
          多端同步
        </h3>

        {isNativeApp() && (
          <p className="settings-note native-hint">
            当前是安卓 App：请填写电脑端「检测服务端」显示的局域网地址（例如 http://192.168.1.10:8787）。
            同步会通过它工作；AI 由手机直接连接模型接口，不需要电脑常开。
          </p>
        )}

        <label className="field">
          <span>服务器地址</span>
          <div className="inline-field">
            <input
              value={sync.url}
              spellCheck={false}
              placeholder="http://192.168.1.10:8787"
              onChange={(event) => updateSyncSettings({ url: event.target.value })}
            />
            <button type="button" className="btn small" onClick={useCurrentAddress}>
              当前地址
            </button>
          </div>
        </label>

        <label className="field">
          <span>同步码</span>
          <input
            value={sync.code}
            spellCheck={false}
            placeholder="两端填相同的同步码"
            onChange={(event) => updateSyncSettings({ code: event.target.value })}
          />
        </label>

        <div className="settings-row">
          <div>
            <span className="settings-label">自动同步</span>
            <p className="settings-desc">修改后自动推送，每 2 分钟也会检查一次</p>
          </div>
          <Toggle checked={sync.auto} onChange={(value) => updateSyncSettings({ auto: value })} />
        </div>

        <div className="sync-status-row">
          <span className={cls('sync-state', state.sync.status)}>{syncSummary()}</span>
          <button className="btn small" onClick={() => void syncNow()}>
            <Icon name="refresh" size={14} />
            立即同步
          </button>
          <button className="btn small ghost" onClick={checkServer}>
            检测服务端
          </button>
        </div>
        {serverInfo && <p className="settings-note">{serverInfo}</p>}
        <p className="settings-note">
          手机与电脑连同一个 Wi-Fi：手机浏览器打开服务端局域网地址 → 填入相同同步码即可。
          同步码相当于口令，建议改成只有你知道的内容。安卓 Chrome 菜单里的「添加到主屏幕」可以创建桌面入口；
          想要完整的离线安装体验，可用数据线连接后执行 adb reverse tcp:8787 tcp:8787，再打开 http://localhost:8787 安装。
        </p>
      </section>

      <section className="settings-section" id="settings-notify">
        <h3>
          <Icon name="bell" size={16} />
          提醒通知
        </h3>

        <div className="settings-row">
          <div>
            <span className="settings-label">系统通知权限</span>
            <p className="settings-desc">{permissionLabel}</p>
          </div>
          <button className="btn small" onClick={() => void requestNotifications()}>
            请求权限
          </button>
        </div>

        <div className="settings-actions">
          <button className="btn" onClick={() => void sendTestNotification()}>
            <Icon name="bell" size={14} />
            发送测试通知
          </button>
        </div>
        <p className="settings-note">
          {isNativeApp()
            ? '已接入安卓系统闹钟调度：应用关闭后仍会收到提醒；如果系统限制了精确闹钟，可能延迟几分钟。任务列表里的铃铛表示已设置提醒。'
            : '在任务详情里设置提醒后，应用打开时会按时弹出系统通知并震动，任务列表也会显示铃铛。受浏览器限制，应用完全关闭时无法保证后台提醒；安装为 PWA 后通知体验更接近原生。'}
        </p>
      </section>

      <section className="settings-section" id="settings-data">
        <h3>
          <Icon name="download" size={16} />
          数据
        </h3>
        <div className="settings-row">
          <div>
            <span className="settings-label">最近删除</span>
            <p className="settings-desc">误删的任务和习惯可以在这里恢复</p>
          </div>
          <button className="btn small" onClick={() => setUI({ trashOpen: true })}>
            <Icon name="trash" size={14} />
            打开
          </button>
        </div>
        <div className="settings-actions wrap">
          <button className="btn" onClick={exportData}>
            <Icon name="download" size={14} />
            导出备份
          </button>
          <button
            className="btn"
            onClick={() => {
              exportCalendar()
              toast('日历文件已生成，请查看浏览器下载', 'success')
            }}
          >
            <Icon name="calendar" size={14} />
            导出日历
          </button>
          <button className="btn" onClick={() => fileRef.current?.click()}>
            <Icon name="upload" size={14} />
            导入备份
          </button>
          <button className="btn ghost" onClick={restoreDemoData}>
            恢复示例数据
          </button>
          <button
            className="btn danger-ghost"
            onClick={() => {
              if (window.confirm('确定清空所有任务、习惯与专注记录吗？此操作会同步到其他设备。')) {
                resetTasks()
              }
            }}
          >
            <Icon name="trash" size={14} />
            清空数据
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={(event) => {
              const file = event.target.files?.[0]
              if (file) void importDataFile(file)
              event.target.value = ''
            }}
          />
        </div>
        <p className="settings-note">
          备份文件包含全部任务、清单、习惯与专注记录，不包含 API Key。导出日历会生成 .ics 文件，可导入系统日历或其他日历应用。
        </p>
      </section>

      <section className="settings-section" id="settings-about">
        <h3>
          <Icon name="smartphone" size={16} />
          关于
        </h3>
        <div className="about-card">
          <div>
            <strong>刻度清单 · TickDone</strong>
            <p>版本 3.1.0 · React + PWA + 自托管同步</p>
            <p>3.1 新增：最近删除恢复、离线提示、快捷键说明与崩溃保护</p>
            <p>3.0 新增：概览首页、今日进度、习惯打卡与 AI 每日简报</p>
            <details className="about-history">
              <summary>更早的更新记录</summary>
              <p>2.2.8 优化：视图与面板按需加载，首屏体积减少约 27 KB（gzip）</p>
              <p>2.2.7 新增：任务排序、清理已完成、习惯编辑与每日提醒</p>
              <p>2.2.6 新增：日历、看板、习惯、统计和专注视图的细节优化</p>
              <p>2.2.5 新增：界面细节打磨、移动端顶栏与底部导航优化</p>
              <p>2.2.4 新增：AI 助理可以用对话建立习惯和打卡</p>
              <p>2.2.3 新增：任务行备注预览、子任务展开、快捷删除与撤销</p>
              <p>2.2.2 修复：安卓端 AI 直接连接模型接口，解决配置 API 报错 200</p>
              <p>2.2.1 修复：接口返回 200 时的错误提示与连接测试兼容性</p>
              <p>2.2 新增：主题色、设置页快捷导航、习惯热力图、空状态插画</p>
              <p>2.1 新增：AI 生成筛选、AI 整理收件箱、AI 耗时估算、周视图拖拽改期</p>
              <p>2.0 新增：看板、智能筛选、周视图日历、日历导出</p>
              <p>支持安卓系统分享文字或链接直接创建任务</p>
            </details>

            <div className="about-shortcuts">
              <span className="settings-label">键盘快捷键</span>
              <div className="shortcut-list">
                <span>
                  <kbd>Ctrl / ⌘ K</kbd>搜索
                </span>
                <span>
                  <kbd>Ctrl / ⌘ N</kbd>快速添加
                </span>
                <span>
                  <kbd>Esc</kbd>关闭面板
                </span>
              </div>
            </div>
            <p className="settings-note about-privacy">
              数据与隐私：任务、习惯和设置默认保存在本机；API Key 只保存在当前设备，不会写入日志。同步使用你填写的自托管服务端。
            </p>
          </div>
          {standalone ? (
            <span className="badge-ok">
              <Icon name="check" size={13} strokeWidth={3} />
              已安装
            </span>
          ) : canInstall() ? (
            <button
              className="btn primary small"
              onClick={async () => {
                const result = await promptInstall()
                if (result === 'accepted') toast('正在安装…', 'success')
              }}
            >
              安装到设备
            </button>
          ) : (
            <span className="settings-note inline">用 Chrome 菜单「添加到主屏幕」安装</span>
          )}
        </div>
      </section>
    </Modal>
  )
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <button
      type="button"
      className={cls('toggle', checked && 'on')}
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
    >
      <span />
    </button>
  )
}
