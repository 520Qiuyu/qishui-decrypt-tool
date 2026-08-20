// Read LunaCacheV2/entries.db using the app's OWN @luna/lmdb JS wrapper + native module.
// The native lmdb.node (custom page format) is found via bindings at
// restored-sources/addons/lmdb/build/Release/lmdb.node
// Output: data/entries-index.json
import { open } from '../../restored-sources/addons/lmdb/index.js'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const outFile = path.join(__dirname, '../data/entries-index.json')

const dbPath = 'C:/Users/12806/AppData/Roaming/SodaMusic/LunaCacheV2/entries.db'
console.log('opening', dbPath)

const db = open({
  path: dbPath,
  readOnly: true,
})

let count = 0
const out = []
for (const { key, value } of db.getRange({})) {
  count++
  const entry = value
  const info = entry.info || {}
  const rec = {
    resourceId: entry.resourceId,
    chunkId: entry.chunkId,
    size: entry.size,
    previousAccessTime: entry.previousAccessTime,
    trackId: info.trackId,
    quality: info.quality,
    bitrate: info.bitrate,
    isPreview: info.isPreview,
    spade: info.spade,
    urls: info.urls,
    contentType: entry.headers?.['content-type'],
  }
  out.push(rec)
  if (count <= 3) {
    console.log('sample entry:')
    console.log(JSON.stringify(rec, null, 2))
  }
}

console.log('total entries:', count)
fs.writeFileSync(outFile, JSON.stringify(out, null, 2))
console.log('written', outFile)

// also report which resourceIds have a cached .bin present
const cacheDir = 'C:/Users/12806/AppData/Roaming/SodaMusic/LunaCacheV2'
const bins = fs.readdirSync(cacheDir).filter(f => f.endsWith('.bin'))
const binSet = new Set(bins)
let withBin = 0
for (const rec of out) {
  if (rec.chunkId && binSet.has(rec.chunkId + '.bin')) withBin++
}
console.log('resourceIds whose .bin exists on disk:', withBin, 'of', count)
console.log('total .bin files:', bins.length)

db.close?.()
