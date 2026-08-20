'use strict'
// HTTP/HTTPS 下载(支持 Range 断点续传)。
const http = require('http')
const https = require('https')
const { URL } = require('url')

/**
 * @param {string} url
 * @param {{range?: string, maxBytes?: number}} [opts]
 * @returns {Promise<{body: Buffer, status: number}>}
 */
function download(url, { range, maxBytes } = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url)
    const isHttps = u.protocol === 'https:'
    const lib = isHttps ? https : http
    const headers = {}
    if (range) headers.Range = range
    const req = lib.get(
      { hostname: u.hostname, port: u.port, path: u.pathname + u.search, headers },
      (res) => {
        const status = res.statusCode
        if (status !== 200 && status !== 206) {
          res.resume()
          return reject(new Error('HTTP ' + status + ' for ' + url))
        }
        const chunks = []
        let total = 0
        res.on('data', (c) => {
          chunks.push(c)
          total += c.length
          if (maxBytes && total > maxBytes) {
            req.destroy(new Error('exceeded maxBytes'))
          }
        })
        res.on('end', () => resolve({ body: Buffer.concat(chunks), status }))
      },
    )
    req.on('error', reject)
  })
}

module.exports = { download }
