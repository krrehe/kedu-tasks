'use strict'

const fs = require('fs')
const fsp = require('fs/promises')
const path = require('path')
const crypto = require('crypto')

const TYPES = ['tasks', 'lists', 'filters', 'habits', 'focus']

function emptyDoc() {
  return { seq: 0, tasks: {}, lists: {}, filters: {}, habits: {}, focus: {} }
}

class Store {
  constructor(dir) {
    this.dir = dir
    this.locks = new Map()
    fs.mkdirSync(dir, { recursive: true })
  }

  file(ns) {
    return path.join(this.dir, `${ns}.json`)
  }

  async read(ns) {
    try {
      const raw = await fsp.readFile(this.file(ns), 'utf8')
      const doc = JSON.parse(raw)
      return { ...emptyDoc(), ...doc }
    } catch (err) {
      if (err.code !== 'ENOENT') console.warn('[store] 读取失败:', err.message)
      return emptyDoc()
    }
  }

  async write(ns, doc) {
    await fsp.mkdir(this.dir, { recursive: true })
    const tmp = this.file(ns) + '.tmp'
    await fsp.writeFile(tmp, JSON.stringify(doc), 'utf8')
    await fsp.rename(tmp, this.file(ns))
  }

  /** 同一个命名空间的同步请求串行执行，避免并发写坏文件 */
  withLock(ns, fn) {
    const prev = this.locks.get(ns) || Promise.resolve()
    const next = prev.then(fn, fn)
    this.locks.set(ns, next.catch(() => {}))
    return next
  }

  async sync(ns, since, entities) {
    return this.withLock(ns, async () => {
      const doc = await this.read(ns)
      let changed = false

      for (const type of TYPES) {
        const list = Array.isArray(entities[type]) ? entities[type] : []
        for (const item of list) {
          if (!item || typeof item !== 'object') continue
          if (typeof item.id !== 'string' || typeof item.updatedAt !== 'number') continue
          const cur = doc[type][item.id]
          // 最后写入者胜出（last-write-wins）
          if (!cur || item.updatedAt > cur.updatedAt) {
            doc.seq += 1
            doc[type][item.id] = { ...item, _seq: doc.seq }
            changed = true
          }
        }
      }

      if (changed) await this.write(ns, doc)

      const out = {}
      for (const type of TYPES) {
        out[type] = Object.values(doc[type])
          .filter((e) => (e._seq || 0) > since)
          .map(({ _seq, ...rest }) => rest)
      }

      return {
        seq: doc.seq,
        now: Date.now(),
        counts: Object.fromEntries(TYPES.map((t) => [t, Object.keys(doc[t]).length])),
        entities: out
      }
    })
  }
}

function namespaceFor(code) {
  const clean = String(code || '').trim()
  if (!clean) return 'default'
  return 'u_' + crypto.createHash('sha256').update(clean).digest('hex').slice(0, 20)
}

module.exports = { Store, namespaceFor, TYPES }
