import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const projectRoot = path.resolve(root, '..')
const target = path.join(root, 'app')

fs.rmSync(target, { recursive: true, force: true })
fs.mkdirSync(path.join(target, 'server'), { recursive: true })
fs.mkdirSync(path.join(target, 'client'), { recursive: true })

for (const file of ['index.js', 'store.js', 'package.json']) {
  fs.copyFileSync(path.join(projectRoot, 'server', file), path.join(target, 'server', file))
}

fs.cpSync(path.join(projectRoot, 'client', 'dist'), path.join(target, 'client', 'dist'), {
  recursive: true
})

const iconDir = path.join(root, 'build')
fs.mkdirSync(iconDir, { recursive: true })
fs.copyFileSync(
  path.join(projectRoot, 'client', 'public', 'icons', 'icon-512.png'),
  path.join(iconDir, 'icon.png')
)

console.log('桌面端资源已准备：desktop/app')
