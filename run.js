'use strict'
// 直接改下面三个常量,然后: node run.js
const path = require('path')
const { decryptSodaAudio } = require('./lib')

const PLAYAUTH = 'lLwa9FC9F/ZtjBDcX5cT3WyaPNZ1rSTkX58S4VidItZwrTikpA=='
const AUDIO_URL = 'https://v95-sz-luna.douyinvod.com/ea11678110304dbe879278e206ec17c2/6a8806b7/video/tos/cn/tos-cn-ve-2774/o4Dl4zQdIig4LggBlvnt8BFBfE16Qc6fgCki7Z/?a=8478&ch=0&cr=3&dr=0&er=3&cd=0%7C0%7C0%7C3&br=2986&bt=1493&ft=pEBWG4L1ffPdXP~ka1jNvAq-antLjrKDfRVuRkaQ7jC9UjVhWL6&mime_type=video_mp4&rc=ZDY5aWY0NWQzaDg4NjNpaUBpajM0aG05cmxleTMzODlkNEBgYS01YGBiNmIxMi1fYmAxYSNibWtmMmRzbHJgLS1kYS1zcw%3D%3D&btag=c0000e00028000&dy_q=1787209331&l=2026082015021182A813CB8575B6D6C81F'
const OUT = path.join(__dirname, 'output', 'test.flac')

const main = async () => {
  const { decryptedBytes, codec } = await decryptSodaAudio({
    playAuth: PLAYAUTH,
    url: AUDIO_URL,
    out: OUT,
    onProgress: (...m) => console.log(m.join(' ')),
  })
  console.log('完成:解密', decryptedBytes, 'bytes ->', OUT, '(codec=' + codec + ')')
}

main().catch((e) => {
  console.error('错误:', e.message)
  process.exit(1)
})
