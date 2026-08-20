const dir = 'D:/Download/SodaMusic-v3.5.1-ug-win32_x64/$Var31/app/resources/app'
const lmdb = require(dir + '/lmdb.node')
console.log('exports:', Object.keys(lmdb))
console.log('version:', lmdb.version ? lmdb.version() : 'n/a')
