export function uid(prefix = ''): string {
  return (
    prefix +
    Date.now().toString(36) +
    Math.random().toString(36).slice(2, 8)
  )
}

export function cls(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ')
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

export function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** 按顺序出现的模糊匹配，用于搜索与 AI 指令里的任务定位 */
export function fuzzyMatch(query: string, text: string): boolean {
  const q = query.trim().toLowerCase()
  const t = text.toLowerCase()
  if (!q) return false
  if (t.includes(q)) return true
  let i = 0
  for (const ch of t) {
    if (ch === q[i]) i++
    if (i === q.length) return true
  }
  return false
}

export function debounce<F extends (...args: never[]) => void>(fn: F, wait: number) {
  let timer: number | undefined
  return (...args: Parameters<F>) => {
    if (timer) window.clearTimeout(timer)
    timer = window.setTimeout(() => fn(...args), wait)
  }
}

export function download(filename: string, content: string, type = 'application/json') {
  const blob = new Blob([content], { type })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  // 稍后再移除，避免部分浏览器取消下载
  setTimeout(() => {
    a.remove()
    URL.revokeObjectURL(url)
  }, 1500)
}
