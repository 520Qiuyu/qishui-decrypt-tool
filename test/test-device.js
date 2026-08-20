const dir = 'D:/Download/SodaMusic-v3.5.1-ug-win32_x64/$Var31/app/resources/app'
const p = dir + '/device.node'
console.log('loading:', p)
try {
  const d = require(p)
  console.log('loaded OK. exports:', Object.keys(d))
  console.log('getSerial():', d.getSerial ? JSON.stringify(d.getSerial()) : 'n/a')
  console.log('getChannelId():', d.getChannelId ? JSON.stringify(d.getChannelId()) : 'n/a')
  console.log('getComputerName():', d.getComputerName ? JSON.stringify(d.getComputerName()) : 'n/a')
} catch (e) {
  console.log('FAIL:', e.message)
}
