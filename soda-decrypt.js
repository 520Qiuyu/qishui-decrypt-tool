#!/usr/bin/env node
'use strict'
// 汽水音乐音频解密 —— 命令行入口(核心逻辑见 lib/)
//   node soda-decrypt.js --playauth <spade_a> --url <url> [--out out.m4a] [--probe]
//   node soda-decrypt.js --playauth <spade_a> --file <encrypted.bin> [--out out.m4a]
//   node soda-decrypt.js --key <32hex> --url <url> [--out out.m4a]
const fs = require('fs')
const path = require('path')
const { execFileSync } = require('child_process')
const { decryptSodaAudio } = require('./lib')

const help = `
用法:
  node soda-decrypt.js --playauth <spade_a> --url <audio_url> [--out out.m4a] [--probe]
  node soda-decrypt.js --playauth <spade_a> --url-file <url.txt> [--out out.m4a]
  node soda-decrypt.js --playauth <spade_a> --file <encrypted.bin> [--out out.m4a]
  node soda-decrypt.js --key <32hex> --url <audio_url> [--out out.m4a]

参数:
  --playauth   PlayAuth / spade_a (base64 字符串)
  --url        音频下载链接 (mp4/m4a)
  --url-file   从文本文件读取 URL(Windows 下可避开 & 被 shell 截断)
  --file       本地加密 .bin 文件
  --key        直接给 16 字节密钥(32 hex),跳过 decodeSpade
  --out        输出文件路径 (默认 output/audio_decrypted.m4a)
  --probe      解密后打印 ffprobe 信息

Windows PowerShell 注意:
  URL 里的 & 会被当成命令分隔符。请先赋给变量,或改用 --url-file:
    $u = 'https://...?a=8478&ch=0&cr=3&...'
    node soda-decrypt.js --playauth '...' --url $u --out out.m4a

环境变量:
  SODA_APP_DIR  指定 app 安装目录(默认自动探测 device.node)
`

function parseArgs(argv) {
  const a = {}
  for (let i = 2; i < argv.length; i++) {
    const k = argv[i]
    if (k.startsWith('--')) {
      const key = k.slice(2)
      const val = argv[i + 1]
      if (val && !val.startsWith('--')) { a[key] = val; i++ }
      else a[key] = true
    }
  }
  return a
}

/**
 * 抖音/汽水 CDN 链接几乎总带多个 & 查询参数。
 * Windows 下未正确引用时,shell 会把 & 后面拆成新命令,Node 只能收到 ?a=8478 这一截。
 * @param {string} url
 * @example
 * warnIfUrlLooksTruncated('https://cdn.example/?a=8478')
 */
const warnIfUrlLooksTruncated = (url) => {
  let parsed
  try { parsed = new URL(url) } catch (_) { return }
  const hasAmp = parsed.search.includes('&')
  if (!parsed.search || hasAmp) return
  console.warn('警告: URL 查询串里没有 &,在 Windows 上通常是 shell 把 & 当成了命令分隔符,链接已被截断。')
  console.warn('  后面那些 \'ch\'/\'cr\'/\'dr\' 不是内部命令,以及 --out 没生效,都是同一个原因。')
  console.warn('  PowerShell 请先把完整 URL 赋给变量,或改用 --url-file:')
  console.warn("    $u = '完整URL'")
  console.warn('    node soda-decrypt.js --playauth \'...\' --url $u --out out.m4a')
}

async function main() {
  const args = parseArgs(process.argv)
  if (args['url-file']) {
    args.url = fs.readFileSync(args['url-file'], 'utf8').trim().split(/\r?\n/)[0]
  }
  if (!args.playauth && !args.key) { console.log(help); return }
  if (!args.url && !args.file) { console.log('需要 --url、--url-file 或 --file 输入源'); console.log(help); return }
  if (args.url) warnIfUrlLooksTruncated(args.url)

  const outPath = args.out || path.join(__dirname, 'output', 'audio_decrypted.m4a')
  const { decryptedBytes } = await decryptSodaAudio({
    playAuth: args.playauth,
    key: args.key,
    url: args.url,
    file: args.file,
    out: outPath,
    onProgress: (...m) => console.log(m.join(' ')),
  })
  console.log('完成:解密', decryptedBytes, 'bytes ->', outPath)

  if (args.probe) {
    try {
      console.log(execFileSync('ffprobe', [
        '-v', 'error', '-show_entries', 'format=duration:stream=codec_name,sample_rate,channels',
        '-of', 'default=nw=1', outPath,
      ]).toString())
    } catch (e) {
      console.log('ffprobe 不可用或失败:', e.message)
    }
  }
}

main().catch((e) => {
  console.error('错误:', e.message)
  process.exit(1)
})
