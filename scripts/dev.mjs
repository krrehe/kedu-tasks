import { spawn } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const isWin = process.platform === 'win32'

const children = []

function run(label, command, args, options) {
  const child = spawn(command, args, { stdio: 'inherit', ...options })
  child.on('exit', (code) => {
    if (code !== null && code !== 0) console.log(`[${label}] 退出，代码 ${code}`)
  })
  children.push({ label, child })
  return child
}

run('server', process.execPath, [path.join(root, 'server', 'index.js')], { cwd: root })
run('client', process.execPath, [path.join(root, 'node_modules', 'vite', 'bin', 'vite.js')], {
  cwd: path.join(root, 'client')
})

function shutdown() {
  for (const { child } of children) {
    if (!child.pid || child.killed) continue
    if (isWin) {
      spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' })
    } else {
      child.kill('SIGTERM')
    }
  }
  setTimeout(() => process.exit(0), 300)
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
