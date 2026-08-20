const dir = 'D:/Download/SodaMusic-v3.5.1-ug-win32_x64/$Var31/app/resources/app'
const lmdb = require(dir + '/lmdb.node')
console.log('version property:', lmdb.version)
// Try opening the entries.db read-only and iterating
const env = new lmdb.Env()
try {
  env.open({ path: 'C:/Users/12806/AppData/Roaming/SodaMusic/LunaCacheV2', mapSize: 256*1024*1024*1024, readOnly: true, noSubDir: false, maxDbs: 10 })
  console.log('env opened ok')
  console.log('info:', env.info())
  console.log('stat:', env.stat())
  // getMaxKeySize
  console.log('maxKeySize:', env.getMaxKeySize())
  env.close()
} catch (e) {
  console.log('env open error:', e.message)
}
