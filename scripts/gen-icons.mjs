import zlib from 'node:zlib'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const outDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'client', 'public', 'icons')
fs.mkdirSync(outDir, { recursive: true })

const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c >>> 0
  }
  return table
})()

function crc32(buf) {
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length, 0)
  const name = Buffer.from(type, 'ascii')
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(Buffer.concat([name, data])), 0)
  return Buffer.concat([len, name, data, crc])
}

function encodePNG(width, height, rgba) {
  const raw = Buffer.alloc((width * 4 + 1) * height)
  const stride = width * 4
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride)
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8
  ihdr[9] = 6
  ihdr[10] = 0
  ihdr[11] = 0
  ihdr[12] = 0
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ])
}

const clamp = (v, min, max) => Math.min(max, Math.max(min, v))

function sdRoundRect(px, py, half, radius) {
  const qx = Math.abs(px) - half + radius
  const qy = Math.abs(py) - half + radius
  return Math.min(Math.max(qx, qy), 0) + Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) - radius
}

function sdSegment(px, py, ax, ay, bx, by) {
  const pax = px - ax
  const pay = py - ay
  const bax = bx - ax
  const bay = by - ay
  const h = clamp((pax * bax + pay * bay) / (bax * bax + bay * bay), 0, 1)
  return Math.hypot(pax - bax * h, pay - bay * h)
}

function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

function draw(size, options) {
  const { maskable = false, rounded = true, glyphScale = 1, padding = 0 } = options
  const rgba = Buffer.alloc(size * size * 4)
  const top = hexToRgb('#6E8BFF')
  const mid = hexToRgb('#4C6FFF')
  const bottom = hexToRgb('#2F49E0')
  const aa = 1 / size
  const half = 0.5 - padding
  const radius = rounded ? 0.225 : 0.0

  const p1 = [0.3, 0.515]
  const p2 = [0.445, 0.66]
  const p3 = [0.715, 0.355]
  const stroke = 0.052 * glyphScale
  const glyphHalf = 0.5
  const center = 0.5

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = (x + 0.5) / size
      const v = (y + 0.5) / size
      const i = (y * size + x) * 4

      // 背景：斜向渐变 + 左上高光
      const t = clamp((u * 0.35 + v * 0.85), 0, 1)
      let r, g, b
      if (t < 0.55) {
        const k = t / 0.55
        r = top[0] + (mid[0] - top[0]) * k
        g = top[1] + (mid[1] - top[1]) * k
        b = top[2] + (mid[2] - top[2]) * k
      } else {
        const k = (t - 0.55) / 0.45
        r = mid[0] + (bottom[0] - mid[0]) * k
        g = mid[1] + (bottom[1] - mid[1]) * k
        b = mid[2] + (bottom[2] - mid[2]) * k
      }
      const glow = Math.max(0, 1 - Math.hypot(u - 0.22, v - 0.16) / 0.55) * 0.5
      r += (255 - r) * glow * 0.45
      g += (255 - g) * glow * 0.45
      b += (255 - b) * glow * 0.45

      const bgAlpha = maskable ? 1 : clamp(0.5 - sdRoundRect(u - 0.5, v - 0.5, half, radius) / aa, 0, 1)

      // 对勾
      const gx = (u - center) / glyphScale + 0.5
      const gy = (v - center) / glyphScale + 0.5
      const d = Math.min(sdSegment(gx, gy, p1[0], p1[1], p2[0], p2[1]), sdSegment(gx, gy, p2[0], p2[1], p3[0], p3[1]))
      const glyphAlpha = clamp((stroke - d) / (aa / glyphScale) + 0.5, 0, 1)

      // 白色对勾叠加
      const cr = r + (255 - r) * glyphAlpha
      const cg = g + (255 - g) * glyphAlpha
      const cb = b + (255 - b) * glyphAlpha

      rgba[i] = Math.round(cr)
      rgba[i + 1] = Math.round(cg)
      rgba[i + 2] = Math.round(cb)
      rgba[i + 3] = Math.round(bgAlpha * 255)
    }
  }
  return encodePNG(size, size, rgba)
}

const targets = [
  { file: 'icon-512.png', size: 512, opts: { padding: 0.0, glyphScale: 1 } },
  { file: 'icon-192.png', size: 192, opts: { padding: 0.0, glyphScale: 1 } },
  { file: 'icon-96.png', size: 96, opts: { padding: 0.0, glyphScale: 1 } },
  { file: 'apple-touch-icon.png', size: 180, opts: { rounded: false, padding: 0.0, glyphScale: 0.92 } },
  { file: 'maskable-512.png', size: 512, opts: { maskable: true, glyphScale: 0.74 } }
]

for (const target of targets) {
  const buf = draw(target.size, target.opts)
  fs.writeFileSync(path.join(outDir, target.file), buf)
  console.log('生成', target.file, buf.length + ' bytes')
}

const favicon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#6E8BFF"/>
      <stop offset="1" stop-color="#2F49E0"/>
    </linearGradient>
  </defs>
  <rect width="64" height="64" rx="15" fill="url(#g)"/>
  <path d="M18.5 33.5l8.6 8.4L46 23.6" fill="none" stroke="#fff" stroke-width="6.2" stroke-linecap="round" stroke-linejoin="round"/>
</svg>
`
fs.writeFileSync(path.join(outDir, 'favicon.svg'), favicon)
console.log('生成 favicon.svg')
