'use strict'
// 本地静态预览,与 GitHub Pages 行为一致(无代理)。
//   node serve.js
const http = require('http')
const fs = require('fs')
const path = require('path')
const { exec } = require('child_process')

const PORT = Number(process.env.SODA_UI_PORT) || 3478
const HOST = '127.0.0.1'
const ROOT = __dirname

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
}

const send = (res, status, body, headers = {}) => {
  res.writeHead(status, headers)
  res.end(body)
}

const serveStatic = (reqPath, res) => {
  const rel = reqPath === '/' ? '/index.html' : reqPath
  const abs = path.normalize(path.join(ROOT, decodeURIComponent(rel)))
  const escaped = path.relative(ROOT, abs)
  if (!escaped || escaped.startsWith('..') || path.isAbsolute(escaped)) return send(res, 403, 'forbidden')
  if (!fs.existsSync(abs) || fs.statSync(abs).isDirectory()) return send(res, 404, 'not found')
  const ext = path.extname(abs).toLowerCase()
  res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' })
  fs.createReadStream(abs).pipe(res)
}

const server = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://' + HOST)
  serveStatic(u.pathname, res)
})

server.listen(PORT, HOST, () => {
  const url = 'http://' + HOST + ':' + PORT + '/'
  console.log('汽水暗房  ' + url)
  if (process.platform === 'win32') exec('start ' + url)
})
