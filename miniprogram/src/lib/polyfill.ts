// ============================================================
//  小程序 Web 标准兼容补丁（终极版）
//  在 app.tsx 第一行 import，早于任何模块
//  用 Object.defineProperty getter，让 Taro 无法覆盖
// ============================================================
import Taro from '@tarojs/taro'

// ========= MiniHeaders =========
class MiniHeaders {
  _m: Record<string, string> = {}
  constructor(init?: any) {
    try {
      if (!init) return
      if (Array.isArray(init)) {
        init.forEach(([k, v]: [any, any]) => { try { this._m[String(k).toLowerCase()] = String(v) } catch {} })
      } else if (init && typeof init.forEach === 'function') {
        init.forEach((v: string, k: string) => { try { this._m[String(k).toLowerCase()] = String(v) } catch {} })
      } else if (init && typeof init === 'object') {
        Object.keys(init).forEach(k => { try { this._m[String(k).toLowerCase()] = String((init as any)[k]) } catch {} })
      }
    } catch {}
  }
  append(n: string, v: string) { try { const k = String(n).toLowerCase(); this._m[k] = this._m[k] ? this._m[k] + ', ' + v : String(v) } catch {} }
  delete(n: string) { try { delete this._m[String(n).toLowerCase()] } catch {} }
  get(n: string): any { try { return this._m[String(n).toLowerCase()] ?? null } catch { return null } }
  has(n: string): boolean { try { return this._m[String(n).toLowerCase()] !== undefined } catch { return false } }
  set(n: string, v: string) { try { this._m[String(n).toLowerCase()] = String(v) } catch {} }
  forEach(cb: any) { try { Object.keys(this._m).forEach(k => cb && cb(this._m[k], k)) } catch {} }
  entries(): any { return Object.keys(this._m).map(k => [k, this._m[k]])[Symbol.iterator]() }
  keys(): any { return Object.keys(this._m)[Symbol.iterator]() }
  values(): any { return Object.keys(this._m).map(k => this._m[k])[Symbol.iterator]() }
  [Symbol.iterator]() { return this.entries() }
}

// ========= Noop WebSocket =========
class NoopWS {
  static CONNECTING = 0
  static OPEN = 1
  static CLOSING = 2
  static CLOSED = 3
  CONNECTING = 0; OPEN = 1; CLOSING = 2; CLOSED = 3
  readyState = 3; bufferedAmount = 0; extensions = ''; protocol = ''; url = ''; binaryType: any = 'arraybuffer'
  addEventListener() {}; removeEventListener() {}; dispatchEvent() { return true }
  onopen: any = null; onmessage: any = null; onerror: any = null; onclose: any = null
  send() {}; close() {}
}

// ========= MiniURL / MiniUSP（永远不 throw） =========
function parseSearch(raw: string): [string, string][] {
  const out: [string, string][] = []
  try {
    const s = raw.startsWith('?') ? raw.slice(1) : raw
    s.split('&').filter(Boolean).forEach(pair => {
      const idx = pair.indexOf('=')
      const k = idx >= 0 ? decodeURIComponent(pair.slice(0, idx)) : decodeURIComponent(pair)
      const v = idx >= 0 ? decodeURIComponent(pair.slice(idx + 1)) : ''
      out.push([k, v])
    })
  } catch {}
  return out
}
class MiniUSP {
  _p: [string, string][] = []
  constructor(init?: any) {
    try {
      if (!init) return
      if (typeof init === 'string') this._p = parseSearch(init)
      else if (Array.isArray(init)) init.forEach(([k, v]: [any, any]) => this._p.push([String(k), String(v)]))
      else if (init && typeof init === 'object') Object.keys(init).forEach(k => this._p.push([k, String((init as any)[k])]))
    } catch {}
  }
  append(n: string, v: string) { try { this._p.push([String(n), String(v)]) } catch {} }
  delete(n: string) { try { const k = String(n); this._p = this._p.filter(([x]) => x !== k) } catch {} }
  get(n: string): any { try { const h = this._p.find(([k]) => k === String(n)); return h ? h[1] : null } catch { return null } }
  getAll(n: string): any { try { return this._p.filter(([k]) => k === String(n)).map(([, v]) => v) } catch { return [] } }
  has(n: string): boolean { try { return this._p.some(([k]) => k === String(n)) } catch { return false } }
  set(n: string, v: string) {
    try {
      const key = String(n), val = String(v)
      let found = false
      const out: [string, string][] = []
      this._p.forEach(([k, x]) => { if (k === key) { if (!found) { out.push([k, val]); found = true } } else out.push([k, x]) })
      if (!found) out.push([key, val])
      this._p = out
    } catch {}
  }
  sort() { try { this._p.sort((a, b) => a[0].localeCompare(b[0])) } catch {} }
  toString(): string { try { return this._p.map(([k, v]) => encodeURIComponent(k) + '=' + encodeURIComponent(v)).join('&') } catch { return '' } }
  forEach(cb: any) { try { this._p.forEach(([k, v]) => cb && cb(v, k)) } catch {} }
  entries(): any { return this._p.slice()[Symbol.iterator]() }
  keys(): any { return this._p.map(([k]) => k)[Symbol.iterator]() }
  values(): any { return this._p.map(([, v]) => v)[Symbol.iterator]() }
  [Symbol.iterator]() { return this.entries() }
}
function makeURLSafe(input: any, base?: any) {
  const raw = (input == null ? '' : String(input)).trim() || 'https://default.local/'
  let href = raw
  try {
    if (base && !/^[a-z][a-z0-9+\-.]*:/i.test(raw)) {
      href = String(base).replace(/\/+$/, '') + '/' + raw.replace(/^\/+/, '')
    }
    if (!/^[a-z][a-z0-9+\-.]*:/i.test(href)) {
      href = 'https://' + (href.startsWith('//') ? href.slice(2) : href || 'default.local')
    }
  } catch {}
  let protocol = 'https:', host = '', hostname = '', port = '', username = '', password = ''
  let pathname = '/', search = '', hash = ''
  try {
    const pm = /^([a-z][a-z0-9+\-.]*:)(\/\/)?/i.exec(href)
    if (pm) {
      protocol = pm[1].toLowerCase()
      const after = href.slice(pm[0].length)
      const slash = after.search(/[\/?#]/)
      const authority = slash >= 0 ? after.slice(0, slash) : after
      const rest = slash >= 0 ? after.slice(slash) : ''
      const at = authority.lastIndexOf('@')
      const authPart = at >= 0 ? authority.slice(0, at) : ''
      const hostPart = at >= 0 ? authority.slice(at + 1) : authority
      const uc = authPart.indexOf(':')
      username = uc >= 0 ? authPart.slice(0, uc) : ''
      password = uc >= 0 ? authPart.slice(uc + 1) : ''
      const bracket = hostPart.startsWith('[')
      const endB = hostPart.indexOf(']')
      const lastC = bracket && endB >= 0 ? -1 : hostPart.lastIndexOf(':')
      if (lastC >= 0) { hostname = hostPart.slice(0, lastC); port = hostPart.slice(lastC + 1) }
      else { hostname = hostPart; port = '' }
      host = port ? hostname + ':' + port : hostname
      const origin = protocol + '//' + host
      const hi = rest.indexOf('#'), qi = rest.indexOf('?')
      hash = hi >= 0 ? rest.slice(hi) : ''
      const endQ = hi >= 0 ? hi : rest.length
      search = qi >= 0 ? rest.slice(qi, endQ) : ''
      const pEnd = qi >= 0 ? qi : (hi >= 0 ? hi : rest.length)
      pathname = rest.slice(0, pEnd) || '/'
    } else { host = 'default.local'; hostname = host; pathname = href || '/' }
  } catch {}
  const origin = protocol + '//' + host
  return {
    protocol, hostname, host, port, username, password,
    pathname, search, hash, href, origin,
    searchParams: new MiniUSP(search),
    toString() { return href }, toJSON() { return href },
  }
}
class MiniURL {
  hash: string; host: string; hostname: string; href: string; origin: string
  password: string; pathname: string; port: string; protocol: string
  search: string; username: string; searchParams: any
  constructor(input: any, base?: any) {
    const u = makeURLSafe(input, base)
    this.hash = u.hash; this.host = u.host; this.hostname = u.hostname
    this.href = u.href; this.origin = u.origin; this.password = u.password
    this.pathname = u.pathname; this.port = u.port; this.protocol = u.protocol
    this.search = u.search; this.username = u.username; this.searchParams = u.searchParams
  }
  toString(): string { return this.href }
  toJSON(): string { return this.href }
  static createObjectURL() { return '' }
  static revokeObjectURL() {}
}

// ========= 终极挂载：用 getter + configurable = false，避免 Taro 覆盖 =========
function lockGlobal(name: string, value: any) {
  const list: any[] = []
  try { list.push(globalThis) } catch {}
  try { list.push((global as any)) } catch {}
  try { list.push((window as any)) } catch {}
  try { list.push((self as any)) } catch {}
  try { list.push((wx as any)) } catch {}
  list.forEach(obj => {
    if (!obj) return
    try { Object.defineProperty(obj, name, { get: () => value, set: () => {}, configurable: false, enumerable: true }) } catch {}
  })
}

lockGlobal('Headers', MiniHeaders)
lockGlobal('WebSocket', NoopWS)
lockGlobal('URL', MiniURL)
lockGlobal('URLSearchParams', MiniUSP)

export {}
