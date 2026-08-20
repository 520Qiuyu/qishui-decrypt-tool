/**
 * 汽水暗房 UI —— 绑定表单,调用 browser-libs 解密。
 */
import { decodeSpade, decryptSodaAudio } from './decrypt.js'

const $ = (id) => document.getElementById(id)

const els = {
  playauth: $('playauth'),
  sourceUrl: $('source-url'),
  sourceFile: $('source-file'),
  urlInput: $('audio-url'),
  fileInput: $('audio-file'),
  drop: $('dropzone'),
  fileName: $('file-name'),
  form: $('decrypt-form'),
  submit: $('btn-decrypt'),
  log: $('log'),
  player: $('player'),
  download: $('btn-download'),
  result: $('result'),
  disc: $('disc'),
  keyReadout: $('key-readout'),
  status: $('disc-status'),
  banner: $('file-banner'),
  progress: $('progress-label'),
}

let fileBuffer = null
let fileLabel = ''
let resultUrl = ''
let loading = false

const setDiscProgress = (ratio) => {
  els.disc.style.setProperty('--p', Math.max(0, Math.min(1, ratio)) * 100 + '%')
}

const setStatus = (text) => {
  els.status.textContent = text
}

const appendLog = (line, kind = '') => {
  const row = document.createElement('p')
  row.className = kind ? 'log__line log__line--' + kind : 'log__line'
  row.textContent = line
  els.log.appendChild(row)
  els.log.scrollTop = els.log.scrollHeight
}

const clearLog = () => {
  els.log.innerHTML = ''
}

const handleSourceChange = () => {
  const isFile = els.sourceFile.checked
  $('pane-url').hidden = isFile
  $('pane-file').hidden = !isFile
}

const handlePlayauthInput = () => {
  const v = els.playauth.value.trim()
  if (!v) {
    els.keyReadout.textContent = '————————'
    setStatus('等待 PlayAuth')
    return
  }
  try {
    const hex = decodeSpade(v)
    els.keyReadout.textContent = hex.slice(0, 8) + ' · ' + hex.slice(8, 16)
    setStatus('密钥已解出')
  } catch (_) {
    els.keyReadout.textContent = 'invalid'
    setStatus('PlayAuth 无法解析')
  }
}

const handleFileChosen = async (file) => {
  if (!file) return
  fileLabel = file.name
  fileBuffer = new Uint8Array(await file.arrayBuffer())
  els.fileName.textContent = fileLabel + '  ·  ' + fileBuffer.length.toLocaleString() + ' bytes'
  els.drop.classList.add('is-loaded')
}

const handleDrop = (e) => {
  e.preventDefault()
  els.drop.classList.remove('is-over')
  const file = e.dataTransfer?.files?.[0]
  handleFileChosen(file)
}

const handleDragOver = (e) => {
  e.preventDefault()
  els.drop.classList.add('is-over')
}

const handleDragLeave = () => {
  els.drop.classList.remove('is-over')
}

const handleDropKeyDown = (e) => {
  if (e.key !== 'Enter' && e.key !== ' ') return
  e.preventDefault()
  els.fileInput.click()
}

const handleFileInput = (e) => {
  handleFileChosen(e.target.files?.[0])
}

const setLoading = (on) => {
  loading = on
  els.submit.disabled = on
  els.disc.disabled = on
  els.submit.setAttribute('aria-busy', on ? 'true' : 'false')
  document.body.classList.toggle('is-working', on)
}

const revokeResult = () => {
  if (resultUrl) URL.revokeObjectURL(resultUrl)
  resultUrl = ''
}

const handleTogglePlay = () => {
  if (!els.player.src) return
  if (els.player.paused) els.player.play()
  else els.player.pause()
}

const handleCopyKey = async (e) => {
  e.preventDefault()
  e.stopPropagation()
  const playAuth = els.playauth.value.trim()
  if (!playAuth) return
  try {
    const hex = decodeSpade(playAuth)
    await navigator.clipboard.writeText(hex)
    setStatus('密钥已复制')
  } catch (_) {
    setStatus('无法复制')
  }
}

const handleDiscClick = (e) => {
  if (loading) {
    e.preventDefault()
    return
  }
  if (els.player.src) {
    e.preventDefault()
    handleTogglePlay()
    return
  }
  if (els.sourceFile.checked && !fileBuffer) {
    e.preventDefault()
    els.fileInput.click()
  }
}

const handleDecrypt = async (e) => {
  e.preventDefault()
  if (loading) return

  const playAuth = els.playauth.value.trim()
  if (!playAuth) {
    appendLog('请填写 PlayAuth', 'err')
    els.playauth.focus()
    return
  }

  const useFile = els.sourceFile.checked
  const url = els.urlInput.value.trim()
  if (useFile && !fileBuffer) {
    appendLog('请选择加密音频文件', 'err')
    return
  }
  if (!useFile && !url) {
    appendLog('请粘贴音频 URL,或改用本地文件', 'err')
    return
  }

  clearLog()
  revokeResult()
  els.result.hidden = true
  setLoading(true)
  setDiscProgress(0)
  setStatus('解盘中')
  els.progress.textContent = '00%'

  const started = performance.now()
  try {
    const { buffer, decryptedBytes, key, codec } = await decryptSodaAudio({
      playAuth,
      url: useFile ? undefined : url,
      file: useFile ? fileBuffer : undefined,
      onProgress: (msg, extra) => {
        appendLog(msg)
        if (extra?.key) {
          els.keyReadout.textContent = extra.key.slice(0, 8) + ' · ' + extra.key.slice(8, 16)
        }
        if (extra?.phase === 'download' && extra.total) {
          setDiscProgress(extra.received / extra.total * 0.35)
          els.progress.textContent = String(Math.round(extra.received / extra.total * 35)).padStart(2, '0') + '%'
        }
        if (extra?.phase === 'decrypt' && extra.total) {
          setDiscProgress(0.35 + extra.done / extra.total * 0.65)
          els.progress.textContent = String(Math.round(35 + extra.done / extra.total * 65)).padStart(2, '0') + '%'
        }
      },
    })

    const ext = 'm4a'
    const blob = new Blob([buffer], { type: 'audio/mp4' })
    resultUrl = URL.createObjectURL(blob)
    els.player.src = resultUrl
    els.download.href = resultUrl
    els.download.download = (fileLabel.replace(/\.[^.]+$/, '') || 'decrypted') + '.' + ext
    els.result.hidden = false
    setDiscProgress(1)
    els.progress.textContent = '100%'
    setStatus(codec === 'fLaC' ? 'FLAC · 可播放' : 'AAC · 可播放')
    const ms = Math.round(performance.now() - started)
    appendLog('完成 ' + decryptedBytes.toLocaleString() + ' bytes  codec=' + codec + '  key=' + key + '  ' + ms + 'ms', 'ok')
  } catch (err) {
    setStatus('失败')
    appendLog('错误: ' + (err?.message || String(err)), 'err')
  } finally {
    setLoading(false)
  }
}

const init = () => {
  if (location.protocol === 'file:') els.banner.hidden = false

  els.sourceUrl.addEventListener('change', handleSourceChange)
  els.sourceFile.addEventListener('change', handleSourceChange)
  els.playauth.addEventListener('input', handlePlayauthInput)
  els.playauth.addEventListener('blur', handlePlayauthInput)
  els.form.addEventListener('submit', handleDecrypt)
  els.fileInput.addEventListener('change', handleFileInput)
  els.drop.addEventListener('click', () => els.fileInput.click())
  els.drop.addEventListener('keydown', handleDropKeyDown)
  els.drop.addEventListener('dragover', handleDragOver)
  els.drop.addEventListener('dragleave', handleDragLeave)
  els.drop.addEventListener('drop', handleDrop)
  els.disc.addEventListener('click', handleDiscClick)
  els.keyReadout.addEventListener('click', handleCopyKey)
  handleSourceChange()
}

init()
