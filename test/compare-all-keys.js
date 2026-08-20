// 全量对比:extractKey(纯 JS) vs decodeSpade(device.node) 在全部 425 个 spade 上的密钥。
const path = require('path')
const fs = require('fs')
const { decodeSpade } = require('../lib/decode-spade')

const SPADE_PREFIX = [0xfa, 0x55]
function bitCount(value) {
  let current = value >>> 0
  current -= (current >>> 1) & 0x55555555
  current = (current & 0x33333333) + ((current >>> 2) & 0x33333333)
  return (((current + (current >>> 4)) & 0x0f0f0f0f) * 0x01010101) >>> 24
}
function decodeBase36(value) {
  if (value >= 48 && value <= 57) return value - 48
  if (value >= 97 && value <= 122) return value - 97 + 10
  return 0xff
}
function decryptSpadeInner(bytes) {
  const result = new Uint8Array(bytes.length)
  const buff = Uint8Array.from([...SPADE_PREFIX, ...bytes])
  for (let i = 0; i < bytes.length; i++) {
    const raw = (bytes[i] ^ buff[i]) - bitCount(i) - 21
    result[i] = raw >= 0 ? raw : ((raw % 255) + 255) % 255
  }
  return result
}
function extractKey(playAuth) {
  const bytes = Buffer.from(playAuth, 'base64')
  if (bytes.length < 3) return null
  const paddingLength = (bytes[0] ^ bytes[1] ^ bytes[2]) - 48
  if (bytes.length < paddingLength + 2) return null
  const tmpBuff = decryptSpadeInner(bytes.subarray(1, bytes.length - paddingLength))
  if (!tmpBuff.length) return null
  const endIndex = 1 + (bytes.length - paddingLength - 2) - decodeBase36(tmpBuff[0])
  return Buffer.from(tmpBuff.subarray(1, endIndex)).toString('utf8')
}

const idx = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/entries-with-keys.json'), 'utf8'))
let match = 0, mismatch = 0
for (const rec of idx) {
  const nativeKey = rec.decryption_key
  if (!nativeKey || nativeKey.startsWith('ERR')) continue
  const jsKey = extractKey(rec.spade)
  const same = jsKey && nativeKey.toLowerCase() === jsKey.toLowerCase()
  if (same) match++
  else { mismatch++; if (mismatch <= 5) console.log('MISMATCH', rec.chunkId, 'native:', nativeKey, 'js:', jsKey, 'spade:', rec.spade) }
}
console.log(`total=${idx.length}  compareable=${match + mismatch}  match=${match}  mismatch=${mismatch}`)
