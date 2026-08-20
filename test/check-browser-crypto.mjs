import crypto from 'crypto'
import { createRequire } from 'module'
import { aes128Ctr } from '../browser-libs/aes-ctr.js'
import { decodeSpade } from '../browser-libs/decode-spade.js'

const require = createRequire(import.meta.url)
const { decodeSpadePure } = require('../lib/decode-spade.js')

const key = Buffer.from('000102030405060708090a0b0c0d0e0f', 'hex')
const iv = Buffer.from('f0f1f2f3f4f5f6f7f8f9fafbfcfdfeff', 'hex')
const plain = Buffer.from('00112233445566778899aabbccddeeff10111213', 'hex')
const cip = crypto.createCipheriv('aes-128-ctr', key, iv)
const nodeOut = Buffer.concat([cip.update(plain), cip.final()])
const mine = Buffer.from(aes128Ctr(new Uint8Array(key), new Uint8Array(iv), new Uint8Array(plain)))
console.log('aes match', nodeOut.equals(mine))
if (!nodeOut.equals(mine)) {
  console.log('node', nodeOut.toString('hex'))
  console.log('mine', mine.toString('hex'))
  process.exit(1)
}

const pa = 'o7wt9WGNMcNguin9VbYZ/2aHH89Wgi/7Zbwo9mSNLd1Rlhm+vg=='
const a = decodeSpadePure(pa)
const b = decodeSpade(pa)
console.log('spade match', a === b, a)
if (a !== b) process.exit(1)
