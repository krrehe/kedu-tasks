interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
}

let deferred: BeforeInstallPromptEvent | null = null

export function isNativeApp(): boolean {
  if (typeof window === 'undefined') return false
  const capacitor = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor
  return typeof capacitor?.isNativePlatform === 'function' && capacitor.isNativePlatform()
}

export function initPwa() {
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault()
    deferred = event as BeforeInstallPromptEvent
  })
  if (
    'serviceWorker' in navigator &&
    location.protocol !== 'file:' &&
    !import.meta.env.DEV &&
    !isNativeApp()
  ) {
    const register = () => {
      void navigator.serviceWorker.register('/sw.js').catch(() => undefined)
    }
    if (document.readyState === 'complete') register()
    else window.addEventListener('load', register)
  }
}

export function canInstall(): boolean {
  return !!deferred
}

export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as unknown as { standalone?: boolean }).standalone === true
  )
}

export async function promptInstall(): Promise<'accepted' | 'dismissed' | 'unavailable'> {
  if (!deferred) return 'unavailable'
  await deferred.prompt()
  const choice = await deferred.userChoice
  deferred = null
  return choice.outcome
}
