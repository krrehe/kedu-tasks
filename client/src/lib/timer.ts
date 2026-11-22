import { useSyncExternalStore } from 'react'
import type { TimerMode } from '../types'
import { addFocusSession } from '../actions'
import { ensureNotificationPermission, showNotification } from './notify'

export const TIMER_MODES: Record<TimerMode, { label: string; minutes: number; color: string }> = {
  focus: { label: '专注', minutes: 25, color: '#4C6FFF' },
  short: { label: '短休息', minutes: 5, color: '#22C55E' },
  long: { label: '长休息', minutes: 15, color: '#06B6D4' }
}

interface TimerSnapshot {
  mode: TimerMode
  total: number
  remaining: number
  running: boolean
  taskId: string | null
  justFinished: boolean
}

let snap: TimerSnapshot = {
  mode: 'focus',
  total: TIMER_MODES.focus.minutes * 60,
  remaining: TIMER_MODES.focus.minutes * 60,
  running: false,
  taskId: null,
  justFinished: false
}

const listeners = new Set<() => void>()
let interval: number | undefined
let startedAt: number | null = null
let startedRemaining = 0

function emit() {
  for (const fn of listeners) fn()
}

export function getTimer(): TimerSnapshot {
  return snap
}

function subscribe(fn: () => void) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

export function useTimer(): TimerSnapshot {
  return useSyncExternalStore(subscribe, getTimer, getTimer)
}

function stopInterval() {
  if (interval) window.clearInterval(interval)
  interval = undefined
}

function beep() {
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Ctx) return
    const ctx = new Ctx()
    const now = ctx.currentTime
    const notes = [880, 1174.66, 1567.98]
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.value = freq
      gain.gain.setValueAtTime(0.0001, now + i * 0.18)
      gain.gain.exponentialRampToValueAtTime(0.18, now + i * 0.18 + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.18 + 0.16)
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.start(now + i * 0.18)
      osc.stop(now + i * 0.18 + 0.2)
    })
    window.setTimeout(() => void ctx.close(), 1200)
  } catch {
    /* 忽略音频错误 */
  }
}

export const requestNotificationPermission = ensureNotificationPermission

function finish() {
  stopInterval()
  const wasFocus = snap.mode === 'focus'
  const minutes = Math.round(snap.total / 60)
  snap = { ...snap, running: false, remaining: 0, justFinished: true }
  emit()
  beep()
  if (wasFocus) {
    addFocusSession(minutes, snap.taskId, startedAt || Date.now())
    void showNotification('专注完成', `已完成 ${minutes} 分钟专注，起来活动一下吧。`, 'kedu-focus')
  } else {
    void showNotification('休息结束', '准备好开始下一轮专注了吗？', 'kedu-focus')
  }
}

function tick() {
  if (!snap.running || startedAt === null) return
  const elapsed = Math.floor((Date.now() - startedAt) / 1000)
  const remaining = Math.max(0, startedRemaining - elapsed)
  snap = { ...snap, remaining }
  emit()
  if (remaining <= 0) finish()
}

export function startTimer() {
  if (snap.running || snap.remaining <= 0) return
  startedAt = Date.now()
  startedRemaining = snap.remaining
  snap = { ...snap, running: true, justFinished: false }
  emit()
  stopInterval()
  interval = window.setInterval(tick, 300)
}

export function pauseTimer() {
  if (!snap.running) return
  const elapsed = startedAt === null ? 0 : Math.floor((Date.now() - startedAt) / 1000)
  const remaining = Math.max(0, startedRemaining - elapsed)
  stopInterval()
  startedAt = null
  snap = { ...snap, running: false, remaining }
  emit()
}

export function resetTimer(nextMode?: TimerMode) {
  stopInterval()
  startedAt = null
  const mode = nextMode || snap.mode
  const total = TIMER_MODES[mode].minutes * 60
  snap = {
    ...snap,
    mode,
    total,
    remaining: total,
    running: false,
    justFinished: false
  }
  emit()
}

export function setTimerMode(mode: TimerMode) {
  resetTimer(mode)
}

export function setTimerTask(taskId: string | null) {
  snap = { ...snap, taskId }
  emit()
}
