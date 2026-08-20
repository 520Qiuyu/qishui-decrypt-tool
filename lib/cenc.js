'use strict'
// 第二层解密:CENC 加密 MP4 → 明文。标准 AES-128-CTR。
//
// 加密结构(逆向自 SodaMusic v3.5.1):
//  - 容器是标准 MP4:`enca`(加密音频)sample entry + `senc` box
//  - senc version 0:每个 sample 一条 8 字节 IV
//  - 对每个 sample 做 AES-128-CTR:counter 初始块 = 8 字节 IV 置于高 8 字节、
//    低 8 字节为 0,每 16 字节块按 128 位大端整数 +1
//  - 解密后把 stsd 的 `enca` 改回真实 codec:
//      * 内层是 FLAC 音频条目(含 `dfLa` box) → `fLaC`(lossless 曲目,24-bit FLAC 装 MP4)
//      * 否则(MPEG-4 音频,含 `esds`) → `mp4a`
const crypto = require('crypto')

/** 读取一段字节流中的所有 box(支持 size=1 的 64 位扩展)。 */
function readBoxes(buf, start, end) {
  const boxes = []
  let p = start
  while (p + 8 <= end) {
    let size = buf.readUInt32BE(p)
    const type = buf.toString('latin1', p + 4, p + 8)
    let header = 8
    if (size === 1) {
      size = Number(buf.readBigUInt64BE(p + 8))
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

/** 用 AES-128-CTR 解密单个 sample。ivMode: 'high'=IV 放高 8 字节(默认), 'low'=低 8 字节。 */
function decryptSample(buf, sample, key, ivMode) {
  const counter = Buffer.alloc(16)
  if (ivMode === 'low') sample.iv.copy(counter, 8)
  else sample.iv.copy(counter, 0)
  const cip = crypto.createCipheriv('aes-128-ctr', key, counter)
  return Buffer.concat([
    cip.update(buf.subarray(sample.off, sample.off + sample.size)),
    cip.final(),
  ])
}

/**
 * 把 stsd 的 `enca` sample entry 补丁回真实 codec。
 * 依据:enca 内层是 FLAC 音频条目(含 `dfLa` box)则改 `fLaC`,否则按 MPEG-4 音频改 `mp4a`。
 */
function patchSampleEntry(out, data, stsd) {
  const encaIdx = data.indexOf('enca', stsd.dataStart)
  if (encaIdx >= 0 && encaIdx < stsd.dataEnd) {
    const inner = data.subarray(encaIdx + 8, stsd.dataEnd)
    const target = inner.indexOf('dfLa') >= 0 ? 'fLaC' : 'mp4a'
    out.write(target, encaIdx, 4, 'latin1')
  }
}

/**
 * 解密一个 CENC 加密的 MP4 文件,返回明文 Buffer(副本,不修改入参)。
 * @param {Buffer} data 加密文件原始字节
 * @param {Buffer} key  16 字节 AES-128 密钥
 * @returns {{buffer: Buffer, decryptedBytes: number, codec: string}}
 */
function decryptM4A(data, key) {
  const top = readBoxes(data, 0, data.length)
  const moov = find(top, 'moov')
  if (!moov) throw new Error('no moov box')
  const isFragmented = findAll(top, 'moof').length > 0

  const out = Buffer.from(data)
  let decryptedBytes = 0
  let codec = 'mp4a'

  if (!isFragmented) {
    // ---- 非分片:单 trak + stbl 样本表 ----
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

    // stsz:version/flags(4) + sample_size(4) + sample_count(4) + 每样本 size(4)
    const sampleCount = data.readUInt32BE(stsz.dataStart + 8)
    const sizes = []
    {
      let p = stsz.dataStart + 12
      for (let i = 0; i < sampleCount; i++) { sizes.push(data.readUInt32BE(p)); p += 4 }
    }
    // stco:version/flags(4) + entry_count(4) + 每 chunk 偏移(4)
    const chunkCount = data.readUInt32BE(stco.dataStart + 4)
    const chunkOffsets = []
    {
      let p = stco.dataStart + 8
      for (let i = 0; i < chunkCount; i++) { chunkOffsets.push(data.readUInt32BE(p)); p += 4 }
    }
    // stsc:version/flags(4) + entry_count(4) + 每项 {first_chunk, samples_per_chunk, desc_idx}(12)
    const stscCount = data.readUInt32BE(stsc.dataStart + 4)
    const stscEntries = []
    {
      let p = stsc.dataStart + 8
      for (let i = 0; i < stscCount; i++) {
        stscEntries.push({ first_chunk: data.readUInt32BE(p), spc: data.readUInt32BE(p + 4) })
        p += 12
      }
    }
    const spcFor = (c) => {
      let spc = stscEntries[0].spc
      for (const e of stscEntries) if (c >= e.first_chunk) spc = e.spc
      return spc
    }
    // 由 chunk/sample 映射重建每个样本在 mdat 中的偏移
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

    // senc IVs:fullbox ver/flags(4) + sample_count(4),其后每样本 1 条 IV
    let ivs = []
    if (senc) {
      let p = senc.dataStart
      const verFlags = data.readUInt32BE(p)
      const flags = verFlags & 0xffffff
      const scount = data.readUInt32BE(p + 4)
      p += 8
      const ivSize = verFlags >>> 24 === 1 ? 16 : 8
      for (let i = 0; i < scount; i++) {
        ivs.push(Buffer.from(data.subarray(p, p + ivSize)))
        p += ivSize
        if (flags & 0x02) {
          const subCount = data.readUInt16BE(p)
          p += 2 + subCount * 6
        }
      }
      if (ivs.length !== samples.length)
        throw new Error('senc iv count ' + ivs.length + ' != samples ' + samples.length)
      for (let i = 0; i < samples.length; i++) samples[i].iv = ivs[i]
    } else {
      throw new Error('no senc box found (not encrypted?)')
    }

    // 逐个样本解密
    for (const s of samples) {
      const dec = decryptSample(out, s, key, 'high')
      dec.copy(out, s.off)
      decryptedBytes += s.size
    }

    // 补丁 stsd enca → 真实 codec
    const encaIdx = data.indexOf('enca', stsd.dataStart)
    if (encaIdx >= 0 && encaIdx < stsd.dataEnd) {
      codec = data.subarray(encaIdx + 8, stsd.dataEnd).indexOf('dfLa') >= 0 ? 'fLaC' : 'mp4a'
    }
    patchSampleEntry(out, data, stsd)
  } else {
    // ---- 分片:moof + mdat 序列(尽力实现;缓存文件均为非分片) ----
    const boxes = top
    for (let bi = 0; bi < boxes.length; bi++) {
      const b = boxes[bi]
      if (b.type === 'moof') {
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
        const tfFlags = data.readUInt32BE(p) & 0xffffff
        p += 8
        let baseDataOffset = -1
        if (tfFlags & 0x000001) { baseDataOffset = Number(data.readBigUInt64BE(p)); p += 8 }
        else if (tfFlags & 0x000010) { baseDataOffset = Number(data.readBigUInt64BE(p)); p += 8 }
        else if (tfFlags & 0x000020) { baseDataOffset = b.dataEnd }
        else baseDataOffset = b.dataEnd
        let q = trun.dataStart
        const trFlags = data.readUInt32BE(q) & 0xffffff
        const sampleCount = data.readUInt32BE(q + 4)
        q += 8
        let dataOffset = 0
        if (trFlags & 0x000001) { dataOffset = data.readInt32BE(q); q += 4 }
        const firstSampleOffset = baseDataOffset + dataOffset
        let off = firstSampleOffset
        const sampleSizes = []
        for (let i = 0; i < sampleCount; i++) {
          if (trFlags & 0x000100) { sampleSizes.push(data.readUInt32BE(q)); q += 4 }
          if (trFlags & 0x000200) q += 4
          if (trFlags & 0x000800) q += 4
          if (trFlags & 0x001000) q += 4
          if (!(trFlags & 0x000100)) sampleSizes.push(0)
        }
        let ivs = []
        if (senc) {
          let r = senc.dataStart
          const vf = data.readUInt32BE(r)
          const flags = vf & 0xffffff
          const sc = data.readUInt32BE(r + 4)
          r += 8
          const ivSize = vf >>> 24 === 1 ? 16 : 8
          for (let i = 0; i < sc; i++) {
            ivs.push(Buffer.from(data.subarray(r, r + ivSize)))
            r += ivSize
            if (flags & 0x02) { const sub = data.readUInt16BE(r); r += 2 + sub * 6 }
          }
        }
        const mdat = mdatRegions[0]
        let dataStart = mdat ? mdat.dataStart : 0
        if (off < dataStart) off = dataStart + (off - 0)
        for (let i = 0; i < sampleCount; i++) {
          const size = sampleSizes[i]
          if (!ivs[i]) throw new Error('fragmented: no IV for sample')
          const sample = { off, size, iv: ivs[i] }
          if (off + size <= data.length && sample.iv) {
            const dec = decryptSample(out, sample, key, 'high')
            dec.copy(out, off)
            decryptedBytes += size
          }
          off += size
        }
      }
    }
    // 补丁 moov 里的 stsd
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

module.exports = { readBoxes, decryptM4A }
