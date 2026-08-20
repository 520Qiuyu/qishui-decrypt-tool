/**
 * PlayAuth(spade_a) → 32 位 hex 密钥。纯 JS,与 Node 版 lib/decode-spade.js 算法一致。
 *
 * @example
 * decodeSpade('o7wt9WGNMcNguin9VbYZ/2aHH89Wgi/7Zbwo9mSNLd1Rlhm+vg==')
 */

const SPADE_PREFIX = [0xfa, 0x55]

const bitCount = (value) => {
  let current = value >>> 0
  current -= (current >>> 1) & 0x55555555
  current = (current & 0x33333333) + ((current >>> 2) & 0x33333333)
  return (((current + (current >>> 4)) & 0x0f0f0f0f) * 0x01010101) >>> 24
}

const decodeBase36 = (value) => {
  if (value >= 48 && value <= 57) return value - 48
  if (value >= 97 && value <= 122) return value - 97 + 10
  return 0xff
}

const decryptSpadeInner = (bytes) => {
  const result = new Uint8Array(bytes.length)
  const buff = new Uint8Array(SPADE_PREFIX.length + bytes.length)
  buff.set(SPADE_PREFIX, 0)
  buff.set(bytes, SPADE_PREFIX.length)
  for (let i = 0; i < bytes.length; i++) {
    const raw = (bytes[i] ^ buff[i]) - bitCount(i) - 21
    result[i] = raw >= 0 ? raw : ((raw % 255) + 255) % 255
  }
  return result
}

const fromBase64 = (playAuth) => {
  const t = String(playAuth).trim().replace(/\s+/g, '')
  const pad = t.length % 4
  const b64 = pad ? t + '='.repeat(4 - pad) : t
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

/**
 * @param {string} playAuth base64 字符串
 * @returns {string} 32 位小写 hex
 */
export const decodeSpade = (playAuth) => {
  const bytes = fromBase64(playAuth)
  if (bytes.length < 3) throw new Error('playAuth too short')
  const paddingLength = (bytes[0] ^ bytes[1] ^ bytes[2]) - 48
  if (bytes.length < paddingLength + 2) throw new Error('invalid playAuth padding')
  const tmpBuff = decryptSpadeInner(bytes.subarray(1, bytes.length - paddingLength))
  if (!tmpBuff.length) throw new Error('spade inner decrypt failed')
  const endIndex = 1 + (bytes.length - paddingLength - 2) - decodeBase36(tmpBuff[0])
  const keyStr = new TextDecoder().decode(tmpBuff.subarray(1, endIndex))
  if (!/^[0-9a-fA-F]{32}$/.test(keyStr)) {
    throw new Error('key extraction failed (got "' + keyStr + '")')
  }
  return keyStr.toLowerCase()
}
