import zlib from 'node:zlib'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const resDir = path.join(root, 'client', 'android', 'app', 'src', 'main', 'res')

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
  const z = zlib.deflateSync(raw, { level: 9 })
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', z),
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

function draw(size) {
  const rgba = Buffer.alloc(size * size * 4)
  const top = [110, 139, 255]
  const mid = [76, 111, 255]
  const bottom = [47, 73, 224]
  const aa = 1 / size
  const radius = 0.225
  const p1 = [0.3, 0.515]
  const p2 = [0.445, 0.66]
  const p3 = [0.715, 0.355]
  const stroke = 0.052

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = (x + 0.5) / size
      const v = (y + 0.5) / size
      const i = (y * size + x) * 4
      const t = clamp(u * 0.35 + v * 0.85, 0, 1)
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

      const bgAlpha = clamp(0.5 - sdRoundRect(u - 0.5, v - 0.5, 0.5, radius) / aa, 0, 1)
      const d = Math.min(
        sdSegment(u, v, p1[0], p1[1], p2[0], p2[1]),
        sdSegment(u, v, p2[0], p2[1], p3[0], p3[1])
      )
      const glyphAlpha = clamp((stroke - d) / aa + 0.5, 0, 1)

      rgba[i] = Math.round(r + (255 - r) * glyphAlpha)
      rgba[i + 1] = Math.round(g + (255 - g) * glyphAlpha)
      rgba[i + 2] = Math.round(b + (255 - b) * glyphAlpha)
      rgba[i + 3] = Math.round(bgAlpha * 255)
    }
  }
  return encodePNG(size, size, rgba)
}

const densities = [
  { dir: 'mipmap-mdpi', size: 48 },
  { dir: 'mipmap-hdpi', size: 72 },
  { dir: 'mipmap-xhdpi', size: 96 },
  { dir: 'mipmap-xxhdpi', size: 144 },
  { dir: 'mipmap-xxxhdpi', size: 192 }
]

for (const density of densities) {
  const target = path.join(resDir, density.dir)
  fs.mkdirSync(target, { recursive: true })
  const icon = draw(density.size)
  fs.writeFileSync(path.join(target, 'ic_launcher.png'), icon)
  fs.writeFileSync(path.join(target, 'ic_launcher_round.png'), icon)
  console.log('写入', density.dir, density.size)
}

const anydpi = path.join(resDir, 'mipmap-anydpi-v26')
fs.rmSync(anydpi, { recursive: true, force: true })
console.log('已移除自适应图标，改用品牌图标')
