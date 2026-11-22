import { useEffect, useState } from 'react'
import { Icon } from './Icons'

export function OfflineBanner() {
  const [offline, setOffline] = useState(
    () => typeof navigator !== 'undefined' && !navigator.onLine
  )

  useEffect(() => {
    const online = () => setOffline(false)
    const gone = () => setOffline(true)
    window.addEventListener('online', online)
    window.addEventListener('offline', gone)
    return () => {
      window.removeEventListener('online', online)
      window.removeEventListener('offline', gone)
    }
  }, [])

  if (!offline) return null

  return (
    <div className="offline-banner" role="status">
      <Icon name="cloud" size={14} />
      当前处于离线状态，修改会保存在本机，联网后自动同步。
    </div>
  )
}
