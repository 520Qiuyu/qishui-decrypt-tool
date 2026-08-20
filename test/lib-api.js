// 直接调用库的示例:require('./decrypt-tool') → decryptSodaAudio()
const path = require('path')
const fs = require('fs')
const { decryptSodaAudio } = require('../lib')   // 也可 require('..')(package.json main)

async function main() {
  const idx = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/entries-with-keys.json'), 'utf8'))
  idx.sort((a, b) => b.previousAccessTime - a.previousAccessTime)
  const rec = idx[0]
  const bin = 'C:/Users/12806/AppData/Roaming/SodaMusic/LunaCacheV2/' + rec.chunkId + '.bin'
  console.log('资源:', rec.trackId, rec.quality)

  const r = await decryptSodaAudio({
    playAuth: rec.spade,                     // PlayAuth → 自动 decodeSpade
    file: bin,                               // 本地加密文件
    out: path.join(__dirname, '../output/lib-api.m4a'),
    onProgress: (...m) => console.log('  ', m.join(' ')),
  })
  console.log('结果: codec=' + r.codec, 'decryptedBytes=' + r.decryptedBytes, 'key=' + r.key)

  // 也可以直接拿 Buffer 用(不写文件)
  const r2 = await decryptSodaAudio({ key: r.key, file: bin })
  console.log('Buffer 模式: ' + r2.buffer.length + ' bytes, codec=' + r2.codec)
}

main().catch((e) => { console.error('FAIL:', e.message); process.exit(1) })
