/**
 * Uint8Array 读写工具,对齐 Node Buffer 的 BE 整数 / latin1 四字符 box type。
 *
 * @example
 * readUInt32BE(buf, 0)
 * writeLatin1(buf, 12, 'mp4a')
 */

export const readUInt16BE = (buf, offset) => (buf[offset] << 8) | buf[offset + 1]

export const readUInt32BE = (buf, offset) =>
  ((buf[offset] << 24) | (buf[offset + 1] << 16) | (buf[offset + 2] << 8) | buf[offset + 3]) >>> 0

export const readInt32BE = (buf, offset) => readUInt32BE(buf, offset) | 0

export const readBigUInt64BE = (buf, offset) => {
  const hi = readUInt32BE(buf, offset)
  const lo = readUInt32BE(buf, offset + 4)
  return BigInt(hi) * 0x100000000n + BigInt(lo)
}

export const readType = (buf, p) =>
  String.fromCharCode(buf[p + 4], buf[p + 5], buf[p + 6], buf[p + 7])

/**
 * 在 [start, end) 内查找 ASCII 子串,返回绝对偏移,未找到返回 -1。
 * @example
 * indexOfAscii(data, 'enca', stsd.dataStart, stsd.dataEnd)
 */
export const indexOfAscii = (buf, ascii, start = 0, end = buf.length) => {
  const n = ascii.length
  const last = end - n
  outer: for (let i = start; i <= last; i++) {
    for (let j = 0; j < n; j++) {
      if (buf[i + j] !== ascii.charCodeAt(j)) continue outer
    }
    return i
  }
  return -1
}

export const writeLatin1 = (buf, offset, str) => {
  for (let i = 0; i < str.length; i++) buf[offset + i] = str.charCodeAt(i)
}

/**
 * 16 进制字符串 → 字节。
 * @example
 * hexToBytes('b35b979c20d441fbb116aa10523c07b5')
 */
export const hexToBytes = (hex) => {
  const h = String(hex).trim().replace(/\s+/g, '')
  if (h.length % 2) throw new Error('hex 长度必须是偶数')
  const out = new Uint8Array(h.length / 2)
  for (let i = 0; i < out.length; i++) {
    const n = parseInt(h.slice(i * 2, i * 2 + 2), 16)
    if (Number.isNaN(n)) throw new Error('非法 hex')
    out[i] = n
  }
  return out
}

export const bytesToHex = (buf) =>
  Array.from(buf, (b) => b.toString(16).padStart(2, '0')).join('')
