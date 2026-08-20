// 对 data/entries-index.json 里每个 spade 执行 decodeSpade(device.node),
// 得到密钥映射表 → data/entries-with-keys.json
const fs = require('fs')
const path = require('path')
const { decodeSpade } = require('../lib/decode-spade')

const index = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/entries-index.json'), 'utf8'))

console.log('decodeSpade type:', typeof decodeSpade)

const out = index.map(rec => {
  let key = ''
  try {
    key = decodeSpade(rec.spade)
  } catch (e) {
    key = 'ERR: ' + e.message
  }
  return { ...rec, decryption_key: key }
})

fs.writeFileSync(
  path.join(__dirname, '../data/entries-with-keys.json'),
  JSON.stringify(out, null, 2),
)

// print first few keys
for (const rec of out.slice(0, 5)) {
  console.log(rec.resourceId, '->', rec.decryption_key)
}
console.log('total:', out.length)
