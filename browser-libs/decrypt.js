/**
 * 浏览器高层 API:PlayAuth + (URL | 本地文件) → 可播放 M4A。
 *
 * @example
 * const r = await decryptSodaAudio({
 *   playAuth: '...',
 *   file: uint8,
 *   onProgress: (msg) => console.log(msg),
 * })
 */
import { decodeSpade } from './decode-spade.js'
import { decryptM4A } from './cenc.js'
import { hexToBytes } from './bytes.js'

/**
 * 浏览器直连拉取加密音频(无代理,可部署 GitHub Pages)。
 * CDN 若未放行 CORS,会失败,此时请改用本地文件。
 *
 * @example
 * const buf = await fetchEncrypted('https://cdn.example/audio.m4a', console.log)
 */
export const fetchEncrypted = async (url, onBytes) => {
  let res
  try {
    res = await fetch(url, {
      mode: 'cors',
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
    })
  } catch (e) {
    throw new Error('无法直连该 URL（跨域被拦截）。请改用「本地文件」：先在浏览器打开链接另存，再拖进本页。')
  }
  if (!res.ok) {
    throw new Error('下载失败 HTTP ' + res.status + '。CDN 可能校验了来源，请改用「本地文件」。')
  }
  const total = Number(res.headers.get('content-length')) || 0
  if (!res.body) {
    const buf = new Uint8Array(await res.arrayBuffer())
    onBytes?.(buf.length, buf.length)
    return buf
  }
  const reader = res.body.getReader()
  const chunks = []
  let received = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value)
    received += value.length
    onBytes?.(received, total)
  }
  const out = new Uint8Array(received)
  let o = 0
  for (const c of chunks) { out.set(c, o); o += c.length }
  return out
}

/**
 * @param {object} opts
 * @param {string} [opts.playAuth]
 * @param {string} [opts.key] 32 hex,提供则跳过 decodeSpade
 * @param {string} [opts.url]
 * @param {Uint8Array|ArrayBuffer} [opts.file]
 * @param {(msg: string, extra?: object) => void} [opts.onProgress]
 */
export const decryptSodaAudio = async (opts) => {
  if (!opts) throw new Error('missing options')
  if (!opts.playAuth && !opts.key) throw new Error('需要 PlayAuth 或 32 hex 密钥')
  if (!opts.url && opts.file == null) throw new Error('需要音频 URL 或本地文件')
  const log = opts.onProgress || (() => {})

  let key
  if (opts.key) {
    key = hexToBytes(opts.key)
    if (key.length !== 16) throw new Error('密钥需要 32 个 hex 字符')
  } else {
    log('decodeSpade...')
    const hex = decodeSpade(opts.playAuth)
    log('decryption_key = ' + hex, { key: hex })
    key = hexToBytes(hex)
  }

  let data
  if (opts.file != null) {
    data = opts.file instanceof Uint8Array ? opts.file : new Uint8Array(opts.file)
    log('本地文件 ' + data.length + ' bytes')
  } else {
    log('下载 ' + opts.url)
    data = await fetchEncrypted(opts.url, (received, total) => {
      log('下载中 ' + received + (total ? ' / ' + total : '') + ' bytes', {
        phase: 'download',
        received,
        total,
      })
    })
    log('下载完成 ' + data.length + ' bytes')
  }

  log('解密中...')
  const { buffer, decryptedBytes, codec } = await decryptM4A(data, key, (done, total) => {
    log('解密样本 ' + done + ' / ' + total, { phase: 'decrypt', done, total })
  })
  return { buffer, decryptedBytes, key: Array.from(key, (b) => b.toString(16).padStart(2, '0')).join(''), codec }
}

export { decodeSpade, decryptM4A }
