const dir = 'D:/Download/SodaMusic-v3.5.1-ug-win32_x64/$Var31/app/resources/app'
const lmdb = require(dir + '/lmdb.node')
console.log('Env proto:', Object.getOwnPropertyNames(lmdb.Env.prototype))
console.log('Dbi proto:', Object.getOwnPropertyNames(lmdb.Dbi.prototype))
console.log('Txn proto:', Object.getOwnPropertyNames(lmdb.Txn.prototype))
console.log('Cursor proto:', Object.getOwnPropertyNames(lmdb.Cursor.prototype))
console.log('globalBuffer?', typeof lmdb.globalBuffer, lmdb.globalBuffer && lmdb.globalBuffer.length)
console.log('getAddress?', typeof lmdb.getAddress, 'getByBinary?', typeof lmdb.getByBinary, 'iterate?', typeof lmdb.iterate)
