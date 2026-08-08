const OSS = require('ali-oss')
const fs = require('fs')
const path = require('path')

const accessKeyId = 'LTAI5t9qzzzoHzYMtQErzuXy'
const accessKeySecret = '72ZHVwkAqE98XPZNRDOWnncjkxmaqH'
const region = 'cn-shenzhen'
const bucketName = 'inventory-app-2026'
const distDir = path.join(__dirname, 'dist')
const endpoint = `oss-${region}.aliyuncs.com`
const client = new OSS({ accessKeyId, accessKeySecret, region, bucket: bucketName, endpoint, secure: true, timeout: 60000 })

function walkSync(dir, list = []) {
  const items = fs.readdirSync(dir)
  for (const item of items) {
    const full = path.join(dir, item)
    const stat = fs.statSync(full)
    if (stat.isDirectory()) walkSync(full, list)
    else list.push(full)
  }
  return list
}

function getContentType(file) {
  const ext = path.extname(file).toLowerCase()
  const map = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
    '.gif': 'image/gif', '.ico': 'image/x-icon',
    '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf',
    '.map': 'application/json; charset=utf-8',
    '.webmanifest': 'application/manifest+json',
  }
  return map[ext] || 'application/octet-stream'
}

;(async () => {
  try {
    console.log('1. Clear old objects...')
    let marker = null, deleted = 0
    do {
      const list = await client.list({ marker, maxKeys: 1000 })
      const objects = list.objects || []
      if (objects.length) {
        await client.deleteMulti(objects.map(o => o.name))
        deleted += objects.length
        console.log(`   Deleted ${deleted} so far`)
      }
      marker = list.isTruncated ? list.nextMarker : null
    } while (marker)

    console.log('\n2. Upload files with Content-Disposition: inline...')
    const files = walkSync(distDir)
    let ok = 0, fail = 0
    for (let i = 0; i < files.length; i++) {
      const file = files[i]
      const rel = path.relative(distDir, file).split(path.sep).join('/')
      try {
        await client.put(rel, file, {
          headers: {
            'Content-Type': getContentType(file),
            'Content-Disposition': 'inline',
            'Cache-Control': (rel.startsWith('assets/') || rel.endsWith('.woff2') || rel.endsWith('.ttf'))
              ? 'public, max-age=31536000, immutable'
              : (rel === 'index.html' ? 'public, max-age=30' : 'public, max-age=600'),
          },
          meta: {},
        })
        ok++
        if ((i + 1) % 10 === 0 || i === files.length - 1) process.stdout.write(`   ${i + 1}/${files.length}\n`)
      } catch (e) {
        console.log(`   FAIL ${rel}: ${e.code} ${e.message}`)
        fail++
      }
    }
    console.log(`   Result: ${ok} OK, ${fail} failed`)

    console.log('\n3. Verify index.html header...')
    const head = await client.head('index.html')
    console.log('   index.html meta/res:', JSON.stringify(head.res ? head.res.headers : head).slice(0, 500))

    console.log('\nDone. Links:')
    console.log(' HTTP : http://inventory-app-2026.oss-cn-shenzhen.aliyuncs.com/index.html')
    console.log(' HTTPS: https://inventory-app-2026.oss-cn-shenzhen.aliyuncs.com/index.html')
  } catch (e) {
    console.error('FATAL:', e.code || e.message)
    process.exit(1)
  }
})()
