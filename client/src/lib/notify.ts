import { isNativeApp } from './pwa'

export type NotifyPermission = NotificationPermission | 'unsupported'

export function notifyPermission(): NotifyPermission {
  if (typeof Notification === 'undefined') return 'unsupported'
  return Notification.permission
}

export function notificationPermissionLabel(): string {
  const permission = notifyPermission()
  if (permission === 'granted') return '已授权'
  if (permission === 'denied') return '已被拒绝，需要在浏览器设置里重新开启'
  if (permission === 'default') return '尚未授权'
  return '当前浏览器不支持系统通知'
}

export async function ensureNotificationPermission(): Promise<boolean> {
  if (isNativeApp()) {
    const { nativeRequestPermission } = await import('./nativeNotifications')
    return nativeRequestPermission()
  }
  if (typeof Notification === 'undefined') return false
  if (Notification.permission === 'granted') return true
  if (Notification.permission === 'denied') return false
  try {
    const result = await Notification.requestPermission()
    return result === 'granted'
  } catch {
    return false
  }
}

export async function showNotification(title: string, body: string, tag = 'kedu'): Promise<boolean> {
  if (isNativeApp()) {
    const { nativeNotify } = await import('./nativeNotifications')
    return nativeNotify(title, body)
  }
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return false
  const options: NotificationOptions = {
    body,
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-96.png',
    tag,
    data: { url: '/' }
  }
  try {
    if (navigator.serviceWorker) {
      const registration = await navigator.serviceWorker.getRegistration()
      if (registration?.active) {
        await registration.showNotification(title, options)
        return true
      }
    }
    new Notification(title, options)
    return true
  } catch {
    return false
  }
}
