/**
 * 浏览器版 CENC AES-128-CTR 解密,对齐 lib/cenc.js(非分片 + 分片)。
 *
 * @example
 * const { buffer, decryptedBytes, codec } = await decryptM4A(data, key16, onProgress)
 */
import { aes128Ctr } from './aes-ctr.js'
import {
  readUInt16BE,
  readUInt32BE,
  readInt32BE,
  readBigUInt64BE,
  readType,
  indexOfAscii,
  writeLatin1,
} from './bytes.js'

const readBoxes = (buf, start, end) => {
  const boxes = []
  let p = start
  while (p + 8 <= end) {
    let size = readUInt32BE(buf, p)
    const type = readType(buf, p)
    let header = 8
    if (size === 1) {
      size = Number(readBigUInt64BE(buf, p + 8))
      header = 16
    } else if (size === 0) {
      size = end - p
    }
    if (size < 8 || p + size > end) break
    boxes.push({ type, start: p, size, header, dataStart: p + header, dataEnd: p + size })
    p += size
  }
  return boxes
}

const find = (boxes, type) => boxes.find((b) => b.type === type)
const findAll = (boxes, type) => boxes.filter((b) => b.type === type)

const decryptSample = (buf, sample, key) => {
  const counter = new Uint8Array(16)
  counter.set(sample.iv, 0)
  return aes128Ctr(key, counter, buf.subarray(sample.off, sample.off + sample.size))
}

const patchSampleEntry = (out, data, stsd) => {
  const encaIdx = indexOfAscii(data, 'enca', stsd.dataStart, stsd.dataEnd)
  if (encaIdx >= 0 && encaIdx < stsd.dataEnd) {
    const target = indexOfAscii(data, 'dfLa', encaIdx + 8, stsd.dataEnd) >= 0 ? 'fLaC' : 'mp4a'
    writeLatin1(out, encaIdx, target)
  }
}

const yieldTick = () => new Promise((r) => setTimeout(r, 0))

/**
 * @param {Uint8Array} data
 * @param {Uint8Array} key 16 字节
 * @param {(done: number, total: number) => void} [onProgress]
 */
export const decryptM4A = async (data, key, onProgress) => {
  const top = readBoxes(data, 0, data.length)
  const moov = find(top, 'moov')
  if (!moov) throw new Error('no moov box')
  const isFragmented = findAll(top, 'moof').length > 0
  const out = new Uint8Array(data)
  let decryptedBytes = 0
  let codec = 'mp4a'

  if (!isFragmented) {
    const trak = find(readBoxes(data, moov.dataStart, moov.dataEnd), 'trak')
    const mdia = find(readBoxes(data, trak.dataStart, trak.dataEnd), 'mdia')
    const minf = find(readBoxes(data, mdia.dataStart, mdia.dataEnd), 'minf')
    const stbl = find(readBoxes(data, minf.dataStart, minf.dataEnd), 'stbl')
    const stblBoxes = readBoxes(data, stbl.dataStart, stbl.dataEnd)
    const stsz = find(stblBoxes, 'stsz')
    const stco = find(stblBoxes, 'stco')
    const stsc = find(stblBoxes, 'stsc')
    const stsd = find(stblBoxes, 'stsd')
    const senc = find(stblBoxes, 'senc')
    if (!stsz || !stco || !stsc) throw new Error('missing sample tables (stsz/stco/stsc)')

    const sampleCount = readUInt32BE(data, stsz.dataStart + 8)
    const sizes = []
    {
      let p = stsz.dataStart + 12
      for (let i = 0; i < sampleCount; i++) { sizes.push(readUInt32BE(data, p)); p += 4 }
    }
    const chunkCount = readUInt32BE(data, stco.dataStart + 4)
    const chunkOffsets = []
    {
      let p = stco.dataStart + 8
      for (let i = 0; i < chunkCount; i++) { chunkOffsets.push(readUInt32BE(data, p)); p += 4 }
    }
    const stscCount = readUInt32BE(data, stsc.dataStart + 4)
    const stscEntries = []
    {
      let p = stsc.dataStart + 8
      for (let i = 0; i < stscCount; i++) {
        stscEntries.push({ first_chunk: readUInt32BE(data, p), spc: readUInt32BE(data, p + 4) })
        p += 12
      }
    }
    const spcFor = (c) => {
      let spc = stscEntries[0].spc
      for (const e of stscEntries) if (c >= e.first_chunk) spc = e.spc
      return spc
    }
    const samples = []
    let si = 0
    for (let c = 0; c < chunkOffsets.length; c++) {
      const spc = spcFor(c + 1)
      let off = chunkOffsets[c]
      for (let s = 0; s < spc && si < sizes.length; s++) {
        samples.push({ off, size: sizes[si] })
        off += sizes[si]
        si++
      }
    }
    if (si !== sizes.length) throw new Error('sample count mismatch: ' + si + ' != ' + sizes.length)

    if (!senc) throw new Error('no senc box found (not encrypted?)')
    {
      let p = senc.dataStart
      const verFlags = readUInt32BE(data, p)
      const flags = verFlags & 0xffffff
      const scount = readUInt32BE(data, p + 4)
      p += 8
      const ivSize = verFlags >>> 24 === 1 ? 16 : 8
      const ivs = []
      for (let i = 0; i < scount; i++) {
        ivs.push(data.subarray(p, p + ivSize))
        p += ivSize
        if (flags & 0x02) {
          const subCount = readUInt16BE(data, p)
          p += 2 + subCount * 6
        }
      }
      if (ivs.length !== samples.length)
        throw new Error('senc iv count ' + ivs.length + ' != samples ' + samples.length)
      for (let i = 0; i < samples.length; i++) samples[i].iv = ivs[i]
    }

    for (let i = 0; i < samples.length; i++) {
      const s = samples[i]
      out.set(decryptSample(out, s, key), s.off)
      decryptedBytes += s.size
      if (i % 48 === 0) {
        onProgress?.(i + 1, samples.length)
        await yieldTick()
      }
    }
    onProgress?.(samples.length, samples.length)

    const encaIdx = indexOfAscii(data, 'enca', stsd.dataStart, stsd.dataEnd)
    if (encaIdx >= 0 && encaIdx < stsd.dataEnd) {
      codec = indexOfAscii(data, 'dfLa', encaIdx + 8, stsd.dataEnd) >= 0 ? 'fLaC' : 'mp4a'
    }
    patchSampleEntry(out, data, stsd)
  } else {
    const boxes = top
    for (let bi = 0; bi < boxes.length; bi++) {
      const b = boxes[bi]
      if (b.type !== 'moof') continue
      const mdatRegions = []
      for (let j = bi + 1; j < boxes.length; j++) {
        if (boxes[j].type === 'moof') break
        if (boxes[j].type === 'mdat') mdatRegions.push(boxes[j])
      }
      const traf = find(readBoxes(data, b.dataStart, b.dataEnd), 'traf')
      const tfhd = find(readBoxes(data, traf.dataStart, traf.dataEnd), 'tfhd')
      const trun = find(readBoxes(data, traf.dataStart, traf.dataEnd), 'trun')
      const senc = find(readBoxes(data, traf.dataStart, traf.dataEnd), 'senc')
      if (!tfhd || !trun) throw new Error('fragmented: missing tfhd/trun')
      let p = tfhd.dataStart
      const tfFlags = readUInt32BE(data, p) & 0xffffff
      p += 8
      let baseDataOffset = -1
      if (tfFlags & 0x000001) { baseDataOffset = Number(readBigUInt64BE(data, p)); p += 8 }
      else if (tfFlags & 0x000010) { baseDataOffset = Number(readBigUInt64BE(data, p)); p += 8 }
      else if (tfFlags & 0x000020) { baseDataOffset = b.dataEnd }
      else baseDataOffset = b.dataEnd
      let q = trun.dataStart
      const trFlags = readUInt32BE(data, q) & 0xffffff
      const sampleCount = readUInt32BE(data, q + 4)
      q += 8
      let dataOffset = 0
      if (trFlags & 0x000001) { dataOffset = readInt32BE(data, q); q += 4 }
      let off = baseDataOffset + dataOffset
      const sampleSizes = []
      for (let i = 0; i < sampleCount; i++) {
        if (trFlags & 0x000100) { sampleSizes.push(readUInt32BE(data, q)); q += 4 }
        if (trFlags & 0x000200) q += 4
        if (trFlags & 0x000800) q += 4
        if (trFlags & 0x001000) q += 4
        if (!(trFlags & 0x000100)) sampleSizes.push(0)
      }
      const ivs = []
      if (senc) {
        let r = senc.dataStart
        const vf = readUInt32BE(data, r)
        const flags = vf & 0xffffff
        const sc = readUInt32BE(data, r + 4)
        r += 8
        const ivSize = vf >>> 24 === 1 ? 16 : 8
        for (let i = 0; i < sc; i++) {
          ivs.push(data.subarray(r, r + ivSize))
          r += ivSize
          if (flags & 0x02) { const sub = readUInt16BE(data, r); r += 2 + sub * 6 }
        }
      }
      const mdat = mdatRegions[0]
      const dataStart = mdat ? mdat.dataStart : 0
      if (off < dataStart) off = dataStart + (off - 0)
      for (let i = 0; i < sampleCount; i++) {
        const size = sampleSizes[i]
        if (!ivs[i]) throw new Error('fragmented: no IV for sample')
        const sample = { off, size, iv: ivs[i] }
        if (off + size <= data.length && sample.iv) {
          out.set(decryptSample(out, sample, key), off)
          decryptedBytes += size
        }
        off += size
      }
    }
    const moovBoxes = readBoxes(data, moov.dataStart, moov.dataEnd)
    for (const trak of findAll(moovBoxes, 'trak')) {
      const t2 = find(readBoxes(data, trak.dataStart, trak.dataEnd), 'mdia')
      const t3 = find(readBoxes(data, t2.dataStart, t2.dataEnd), 'minf')
      const t4 = find(readBoxes(data, t3.dataStart, t3.dataEnd), 'stbl')
      const t5 = find(readBoxes(data, t4.dataStart, t4.dataEnd), 'stsd')
      if (t5) patchSampleEntry(out, data, t5)
    }
  }

  return { buffer: out, decryptedBytes, codec }
}
