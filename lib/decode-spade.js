'use strict'
// 第一层解密:PlayAuth(spade_a) → 16 字节 AES-128 密钥(32 位 hex)。
//
// 纯 JS 实现,无需 app 的 device.node。算法:
//   1. Base64 解码 playAuth
//   2. paddingLength = (bytes[0] ^ bytes[1] ^ bytes[2]) - 48;有效数据为 bytes[1 .. len-padding]
//   3. decryptSpadeInner:前缀 [0xfa, 0x55],对第 i 字节做
//        raw = bytes[i] ^ buff[i] - popcount(i) - 0x15,负值按 mod 255 归位
//   4. 首字节经 base36 解码得到密钥长度,取后续字节 UTF-8 解码 → hex 密钥
//
// 已验证:与原生 device.node 的 decodeSpade 在全部 425 个缓存 PlayAuth 上产出完全一致。
const fs = require('fs')
const path = require('path')

const SPADE_PREFIX = [0xfa, 0x55]

/** 二进制 popcount(Hamming weight)。 */
function bitCount(value) {
  let current = value >>> 0
  current -= (current >>> 1) & 0x55555555
  current = (current & 0x33333333) + ((current >>> 2) & 0x33333333)
  return (((current + (current >>> 4)) & 0x0f0f0f0f) * 0x01010101) >>> 24
}

/** 0-9 / a-z 的 base36 数值;非法返回 0xff。 */
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

/**
 * 纯 JS:PlayAuth → 32 位 hex 密钥字符串(16 字节 AES-128)。
 */
function decodeSpade(playAuth) {
  const bytes = Buffer.from(playAuth, 'base64')
  if (bytes.length < 3) throw new Error('playAuth too short')
  const paddingLength = (bytes[0] ^ bytes[1] ^ bytes[2]) - 48
  if (bytes.length < paddingLength + 2) throw new Error('invalid playAuth padding')
  const tmpBuff = decryptSpadeInner(bytes.subarray(1, bytes.length - paddingLength))
  if (!tmpBuff.length) throw new Error('spade inner decrypt failed')
  const endIndex = 1 + (bytes.length - paddingLength - 2) - decodeBase36(tmpBuff[0])
  const keyStr = Buffer.from(tmpBuff.subarray(1, endIndex)).toString('utf8')
  if (!/^[0-9a-fA-F]{32}$/.test(keyStr)) {
    throw new Error('key extraction failed (got "' + keyStr + '")')
  }
  return keyStr.toLowerCase()
}

// ---- 原生兜底(可选):经由 app 的 device.node ----

function findDeviceNode() {
  const candidates = []
  if (process.env.SODA_APP_DIR) candidates.push(process.env.SODA_APP_DIR)
  const rel = ['$Var31/app/resources/app', 'resources/app', 'app/resources/app']
  for (const base of [
    'D:/Download/SodaMusic-v3.5.1-ug-win32_x64',
    'D:/Download/SodaMusic-v3.5.1-ug-win32_x64/$Var31/app',
  ]) {
    for (const r of rel) candidates.push(path.join(base, r))
  }
  for (const c of candidates) {
    const p = path.join(c, 'device.node')
    if (fs.existsSync(p)) return p
  }
  return null
}

/** 原生 decodeSpade(需要 app 的 device.node)。 */
function decodeSpadeNative(playAuth) {
  const p = findDeviceNode()
  if (!p) throw new Error('device.node not found. Set SODA_APP_DIR=<dir containing device.node>')
  const device = require(p)
  if (typeof device.decodeSpade !== 'function') {
    throw new Error('device.node does not export decodeSpade')
  }
  return device.decodeSpade(playAuth)
}

/**
 * 带兜底的解码:默认纯 JS;纯 JS 失败时若机器上有 device.node 则退回原生。
 * 设环境变量 SODA_FORCE_NATIVE=1 可强制只用原生。
 */
function decodeSpadeWithFallback(playAuth) {
  if (process.env.SODA_FORCE_NATIVE) return decodeSpadeNative(playAuth)
  try {
    return decodeSpade(playAuth)
  } catch (e) {
    if (findDeviceNode()) return decodeSpadeNative(playAuth)
    throw e
  }
}

module.exports = {
  decodeSpade: decodeSpadeWithFallback,
  decodeSpadePure: decodeSpade,
  decodeSpadeNative,
  findDeviceNode,
}
