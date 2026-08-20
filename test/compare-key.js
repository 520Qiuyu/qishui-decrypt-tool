// 对比 extractKey(纯 JS,来自 qishui 项目 sodaDecryptor.ts)与 decodeSpade(device.node)
// 在相同 PlayAuth 下产出的密钥是否一致。
const { decodeSpade } = require('../lib/decode-spade')

// ---- 复刻 sodaDecryptor.ts 的 SpadeDecryptor.extractKey(纯 JS,无依赖) ----
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

// ---- 测试用例:已知 PlayAuth + decodeSpade 产出的密钥 ----
const cases = [
  { spade: 'rLwi81i1CMhFhQr+Wq4W0F+pD+5DqTn4aYQg/3GuC+NBqwmTkw==', want: 'a9c09f578d894f0c9040b97e1c89a402', note: 'lossless' },
  { spade: 'lLwa9We+Lu5UoSztV5Eb2GCfGdVnhR3JY4YryWGDHc5itCqvrw==', want: '93f529b9a5ce41b1b3f9b4e80712c4ed', note: 'highest AAC' },
]

for (const c of cases) {
  const nativeKey = decodeSpade(c.spade)
  const jsKey = extractKey(c.spade)
  console.log('[' + c.note + ']')
  console.log('  decodeSpade (device.node):', nativeKey)
  console.log('  extractKey   (纯 JS)     :', jsKey)
  console.log('  一致?', (jsKey && nativeKey.toLowerCase() === jsKey.toLowerCase()) ? '✅ YES' : '❌ NO')
  console.log()
}
