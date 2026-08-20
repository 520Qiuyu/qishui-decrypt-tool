// Batch-decrypt a diverse sample of cached tracks and ffprobe each output.
const fs = require('fs')
const path = require('path')
const { execFileSync } = require('child_process')
const index = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/entries-with-keys.json'), 'utf8'))
const cacheDir = 'C:/Users/12806/AppData/Roaming/SodaMusic/LunaCacheV2'

// sample every 25th + ensure variety in quality
const seen = new Set()
const sample = []
for (let i = 0; i < index.length; i += 25) sample.push(index[i])
// add one of each quality
for (const q of ['low', 'medium', 'high', 'spatial']) {
  const rec = index.find(r => r.quality === q && !seen.has(r.resourceId))
  if (rec) { sample.push(rec); seen.add(rec.resourceId) }
}

let ok = 0, fail = 0
for (const rec of sample) {
  const bin = path.join(cacheDir, rec.chunkId + '.bin')
  if (!fs.existsSync(bin)) continue
  const outFile = path.join(__dirname, '../output/_batch_' + rec.quality + '.m4a')
  try {
    execFileSync(process.execPath, [
      path.join(__dirname, '../soda-decrypt.js'), '--key', rec.decryption_key, '--file', bin, '--out', outFile,
    ], { stdio: 'pipe' })
    const probe = execFileSync('ffprobe', [
      '-v', 'error', '-show_entries', 'stream=codec_name,sample_rate,channels,profile:format=duration',
      '-of', 'csv=p=0', outFile,
    ], { encoding: 'utf8' }).trim()
    ok++
    console.log(`OK  ${rec.quality.padEnd(8)} ${rec.trackId} ${probe}`)
  } catch (e) {
    fail++
    console.log(`FAIL ${rec.quality} ${rec.trackId}: ${e.message.split('\n')[0]}`)
  }
}
console.log(`\nverified ${ok}, failed ${fail}`)
