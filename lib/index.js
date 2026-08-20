'use strict'
// SodaMusic 音频解密库 —— 可直接 require 调用。
//
// 用法:
//   const { decryptSodaAudio } = require('./decrypt-tool')   // 或 require('./decrypt-tool/lib')
//   await decryptSodaAudio({ playAuth, url, out: 'song.m4a' })
//
// 两层解密:
//   1. decodeSpade(PlayAuth) → 16 字节 AES-128 密钥(纯 JS,无需 app;可选 device.node 兜底)
//   2. CENC AES-CTR 解密 MP4 样本流,并把 stsd `enca` 补丁回真实 codec(fLaC/mp4a)
const fs = require('fs')
const path = require('path')
const { decodeSpade } = require('./decode-spade')
const { decryptM4A } = require('./cenc')
const { download } = require('./download')

/**
 * 解密一首汽水音乐音频资源。
 * @param {object} opts
 * @param {string} [opts.playAuth]   spade_a / PlayAuth(base64 字符串)
 * @param {string} [opts.key]        16 字节密钥(32 位 hex);提供则跳过 decodeSpade
 * @param {string} [opts.url]        音频下载链接(http/https)
 * @param {string|Buffer} [opts.file] 本地加密文件路径或 Buffer(与 url 二选一)
 * @param {string} [opts.out]        可选:解密结果同时写入该文件(自动建目录)
 * @param {(msg: string) => void} [opts.onProgress] 进度回调,默认静默
 * @returns {Promise<{buffer: Buffer, decryptedBytes: number, key: string, codec: string}>}
 */
async function decryptSodaAudio(opts) {
  if (!opts) throw new Error('missing options')
  if (!opts.playAuth && !opts.key) throw new Error('需要 playAuth(spade_a) 或 key(32 hex)')
  if (!opts.url && !opts.file) throw new Error('需要 url 或 file 作为输入源')
  const log = opts.onProgress || (() => {})

  // 第一层:PlayAuth → 密钥
  let key
  if (opts.key) {
    key = Buffer.from(opts.key, 'hex')
    if (key.length !== 16) throw new Error('--key 需要 32 个 hex 字符')
  } else {
    log('decodeSpade...')
    const hex = decodeSpade(opts.playAuth)
    log('decryption_key =', hex)
    key = Buffer.from(hex, 'hex')
  }

  // 获取加密数据:本地文件 / Buffer / 网络下载
  let data
  if (opts.file) {
    data = Buffer.isBuffer(opts.file) ? opts.file : fs.readFileSync(opts.file)
  } else {
    log('下载', opts.url)
    const { body, status } = await download(opts.url)
    log('下载完成', body.length, 'bytes (HTTP', status + ')')
    data = body
  }

  // 第二层:CENC AES-CTR 解密
  log('解密中...')
  const { buffer, decryptedBytes, codec } = decryptM4A(data, key)
  const result = { buffer, decryptedBytes, key: key.toString('hex'), codec }

  if (opts.out) {
    fs.mkdirSync(path.dirname(path.resolve(opts.out)), { recursive: true })
    fs.writeFileSync(opts.out, buffer)
  }
  return result
}

module.exports = {
  decryptSodaAudio,
  decodeSpade,
  decryptM4A,
  download,
}
