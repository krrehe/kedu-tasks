import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { ErrorBoundary } from './components/ErrorBoundary'
import { getState, hydrate, setUI } from './store'
import { navigate } from './actions'
import { initSync } from './lib/sync'
import { initPwa, isNativeApp } from './lib/pwa'
import { initReminders } from './lib/reminders'
import './styles.css'

async function setupNativeShell() {
  if (!isNativeApp()) return
  const { App: NativeApp } = await import('@capacitor/app')
  void NativeApp.addListener('backButton', () => {
    const ui = getState().ui
    if (
      ui.aiOpen ||
      ui.settingsOpen ||
      ui.searchOpen ||
      ui.drawerOpen ||
      ui.quickAddOpen ||
      ui.selectedTaskId
    ) {
      setUI({
        aiOpen: false,
        settingsOpen: false,
        searchOpen: false,
        drawerOpen: false,
        quickAddOpen: false,
        selectedTaskId: null
      })
      return
    }
    if (ui.view !== 'today') {
      navigate('today')
      return
    }
    void NativeApp.exitApp()
  })
}

async function bootstrap() {
  await hydrate()
  initSync()
  initPwa()
  if (isNativeApp()) {
    void import('./lib/nativeNotifications').then(({ initNativeNotifications }) =>
      initNativeNotifications()
    )
  } else {
    initReminders()
  }
  void setupNativeShell()

  const container = document.getElementById('root')
  if (!container) return
  createRoot(container).render(
    <React.StrictMode>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </React.StrictMode>
  )

  document.getElementById('boot')?.remove()
}

void bootstrap()
