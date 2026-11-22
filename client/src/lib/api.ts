import { getState } from '../store'

/** 同步与 AI 代理共用的服务端地址 */
export function apiBase(): string {
  const url = (getState().settings.sync.url || '').trim().replace(/\/+$/, '')
  if (url) return url
  if (typeof location !== 'undefined') return location.origin
  return ''
}

export function appOrigin(): string {
  return typeof location !== 'undefined' ? location.origin : ''
}
