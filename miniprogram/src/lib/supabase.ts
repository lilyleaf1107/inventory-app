// ==========================================================
//  小程序环境 polyfill（必须在 import Supabase 之前执行）
//  Supabase 客户端初始化时需要 Headers / WebSocket
// ==========================================================
import Taro from '@tarojs/taro'

// ---- 1. Headers ----
class MiniHeaders {
  private _map: Record<string, string> = {}
  constructor(init?: any) {
    if (!init) return
    if (Array.isArray(init)) {
      init.forEach(([k, v]: [string, string]) => {
        this._map[String(k).toLowerCase()] = String(v)
      })
    } else if (typeof init.forEach === 'function') {
      ;(init as any).forEach((v: string, k: string) => {
        this._map[String(k).toLowerCase()] = String(v)
      })
    } else if (typeof init === 'object') {
      Object.keys(init).forEach(k => {
        this._map[String(k).toLowerCase()] = String((init as any)[k])
      })
    }
  }
  append(name: string, value: string) {
    const k = String(name).toLowerCase()
    this._map[k] = this._map[k] ? this._map[k] + ', ' + value : String(value)
  }
  delete(name: string) { delete this._map[String(name).toLowerCase()] }
  get(name: string): string | null {
    const v = this._map[String(name).toLowerCase()]
    return v === undefined ? null : v
  }
  has(name: string): boolean { return this._map[String(name).toLowerCase()] !== undefined }
  set(name: string, value: string) { this._map[String(name).toLowerCase()] = String(value) }
  forEach(callback: (value: string, key: string) => void) {
    Object.keys(this._map).forEach(k => callback(this._map[k], k))
  }
  entries(): Iterator<[string, string]> {
    return Object.keys(this._map).map(k => [k, this._map[k]] as [string, string])[Symbol.iterator]()
  }
  keys(): Iterator<string> { return Object.keys(this._map)[Symbol.iterator]() }
  values(): Iterator<string> { return Object.keys(this._map).map(k => this._map[k])[Symbol.iterator]() }
  [Symbol.iterator]() { return this.entries() }
}
function exposeGlobal(key: string, value: any) {
  const targets: any[] = []
  try { targets.push(globalThis) } catch {}
  try { targets.push((window as any)) } catch {}
  try { targets.push((self as any)) } catch {}
  try { targets.push((global as any)) } catch {}
  try { targets.push((wx as any)) } catch {}
  targets.forEach(t => {
    try { if (t && typeof t[key] === 'undefined') t[key] = value } catch {}
  })
}
exposeGlobal('Headers', MiniHeaders)

// ---- 2. WebSocket（空实现，避免 Realtime 初始化崩溃） ----
// 库存管理场景不需要实时订阅，这里只占位防止 Supabase Realtime 初始化 throw
class NoopWebSocket {
  static readonly CLOSED = 3
  static readonly CLOSING = 2
  static readonly CONNECTING = 0
  static readonly OPEN = 1
  readonly CONNECTING = 0
  readonly OPEN = 1
  readonly CLOSING = 2
  readonly CLOSED = 3
  readonly readyState = 3
  readonly bufferedAmount = 0
  readonly extensions = ''
  readonly protocol = ''
  readonly url = ''
  readonly binaryType = 'arraybuffer' as BinaryType
  addEventListener() {}
  removeEventListener() {}
  dispatchEvent() { return true }
  onopen: any = null
  onmessage: any = null
  onerror: any = null
  onclose: any = null
  send() {}
  close() {}
}
exposeGlobal('WebSocket', NoopWebSocket)

// ---- 3. URL / URLSearchParams ----
// RealtimeClient 初始化时会 new URL(wsUrl)，这里提供稳健实现避免崩
class MiniURLSearchParams {
  private _params: [string, string][] = []
  constructor(init?: any) {
    if (!init) return
    if (typeof init === 'string') {
      const s = init.startsWith('?') ? init.slice(1) : init
      s.split('&').filter(Boolean).forEach(pair => {
        const [k, v = ''] = pair.split('=')
        this._params.push([decodeURIComponent(k), decodeURIComponent(v)])
      })
    } else if (Array.isArray(init)) {
      init.forEach(([k, v]: [string, string]) => this._params.push([String(k), String(v)]))
    } else if (typeof init === 'object') {
      Object.keys(init).forEach(k => this._params.push([k, String((init as any)[k])]))
    }
  }
  append(name: string, value: string) { this._params.push([String(name), String(value)]) }
  delete(name: string) { this._params = this._params.filter(([k]) => k !== name) }
  get(name: string): string | null {
    const hit = this._params.find(([k]) => k === name)
    return hit ? hit[1] : null
  }
  getAll(name: string): string[] { return this._params.filter(([k]) => k === name).map(([, v]) => v) }
  has(name: string): boolean { return this._params.some(([k]) => k === name) }
  set(name: string, value: string) {
    let found = false
    this._params = this._params.map(([k, v]) => {
      if (k === name) {
        if (!found) { found = true; return [k, String(value)] }
        return null as any
      }
      return [k, v]
    }).filter(Boolean)
    if (!found) this._params.push([String(name), String(value)])
  }
  sort() { this._params.sort((a, b) => a[0].localeCompare(b[0])) }
  toString(): string {
    return this._params.map(([k, v]) => encodeURIComponent(k) + '=' + encodeURIComponent(v)).join('&')
  }
  forEach(callback: (value: string, key: string) => void) {
    this._params.forEach(([k, v]) => callback(v, k))
  }
  entries(): Iterator<[string, string]> { return this._params.slice()[Symbol.iterator]() }
  keys(): Iterator<string> { return this._params.map(([k]) => k)[Symbol.iterator]() }
  values(): Iterator<string> { return this._params.map(([, v]) => v)[Symbol.iterator]() }
  [Symbol.iterator]() { return this.entries() }
}
class MiniURL {
  hash: string
  host: string
  hostname: string
  href: string
  readonly origin: string
  password: string
  pathname: string
  port: string
  protocol: string
  search: string
  username: string
  readonly searchParams: MiniURLSearchParams
  constructor(input: string, base?: string) {
    const raw = String(input || '')
    let href = raw
    if (base && !/^[a-z][a-z0-9+\-.]*:/i.test(raw)) {
      href = base.replace(/\/+$/, '') + '/' + raw.replace(/^\/+/, '')
    }
    this.href = href
    const m = /^([a-z][a-z0-9+\-.]*:)?(\/\/)?([^\/?#]*)/i.exec(href) || []
    this.protocol = m[1] || 'https:'
    const hostFull = m[3] || ''
    const atSplit = hostFull.split('@')
    const auth = atSplit.length > 1 ? atSplit[0] : ''
    const hostPart = atSplit.length > 1 ? atSplit[1] : hostFull
    const userColon = auth.indexOf(':')
    this.username = userColon >= 0 ? auth.slice(0, userColon) : ''
    this.password = userColon >= 0 ? auth.slice(userColon + 1) : ''
    const lastColon = hostPart.lastIndexOf(':')
    const hasBrackets = hostPart.startsWith('[')
    if (lastColon >= 0 && !hasBrackets) {
      this.hostname = hostPart.slice(0, lastColon)
      this.port = hostPart.slice(lastColon + 1)
    } else {
      this.hostname = hostPart
      this.port = ''
    }
    this.host = this.port ? this.hostname + ':' + this.port : this.hostname
    this.origin = this.protocol + '//' + this.host
    const afterHost = hasBrackets
      ? href.slice(href.indexOf(']') + 1) || ''
      : (this.host ? href.slice(this.origin.length) : href)
    const hashIdx = afterHost.indexOf('#')
    const qIdx = afterHost.indexOf('?')
    if (hashIdx >= 0) {
      this.hash = afterHost.slice(hashIdx)
    } else {
      this.hash = ''
    }
    const pathEnd = qIdx >= 0 ? qIdx : (hashIdx >= 0 ? hashIdx : afterHost.length)
    const searchEnd = hashIdx >= 0 ? hashIdx : afterHost.length
    this.pathname = afterHost.slice(0, pathEnd) || '/'
    this.search = qIdx >= 0 ? afterHost.slice(qIdx, searchEnd) : ''
    this.searchParams = new MiniURLSearchParams(this.search)
  }
  toString(): string { return this.href }
  toJSON(): string { return this.href }
}
exposeGlobal('URL', MiniURL)
exposeGlobal('URLSearchParams', MiniURLSearchParams)

// ==========================================================
//  Supabase 客户端初始化
// ==========================================================
import { createClient, SupabaseClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://nmydgsnobkxsyjfznwvg.supabase.co'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5teWRnc25vYmt4c3lqZnpud3ZnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODUyMjIyMDAsImV4cCI6MjEwMDc5ODIwMH0.IO4VG1UUgcwMO6TiLmsmiDHsPICyM6RZkuzoM3YE7iM'

// ---- storage 适配器 ----
const taroStorageAdapter = {
  getItem: (key: string): Promise<string | null> =>
    Promise.resolve().then(() => {
      try {
        const v = Taro.getStorageSync(key)
        return v == null || v === '' ? null : String(v)
      } catch { return null }
    }),
  setItem: (key: string, value: string): Promise<void> =>
    Promise.resolve().then(() => { try { Taro.setStorageSync(key, value) } catch {} }),
  removeItem: (key: string): Promise<void> =>
    Promise.resolve().then(() => { try { Taro.removeStorageSync(key) } catch {} }),
}

// ---- fetch 适配：用 Taro.request 代替浏览器 fetch ----
// 关键：Supabase-js 会把 session token 以 Authorization: Bearer <token> 形式放进 init.headers
//      我们必须把这两个 token（Authorization + apikey）原样转发给 Taro.request，
//      否则 Supabase 服务端会把请求当成 anon，被 RLS 策略全部拦截，导致 0 条数据。
let _sbRef: any = null
const SB_ACCESS_TOKEN_KEY = 'sb_access_token' // auth.ts 登录成功后写入

function getAccessTokenSync(): string | null {
  // 1. 优先从固定 key 读取（最可靠，由 auth.ts checkAuth 写入）
  try {
    const v = Taro.getStorageSync(SB_ACCESS_TOKEN_KEY)
    if (v) return String(v)
  } catch {}
  // 2. 从 Supabase SDK 内部 session 读
  try {
    const sb = _sbRef || (globalThis as any).__sbClientRef
    if (sb?.auth) {
      const session = (sb.auth as any)._session || (sb.auth as any).currentSession
      if (session?.access_token) return session.access_token
    }
  } catch {}
  // 3. 兜底：扫描本地存储找 sb-*-auth-token
  try {
    const allKeys: string[] = Taro.getStorageInfoSync?.().keys || []
    const authKey = allKeys.find(k => k.startsWith('sb-') && k.endsWith('-auth-token'))
    if (authKey) {
      const raw = Taro.getStorageSync(authKey)
      if (raw) {
        const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw
        if (parsed?.access_token) return parsed.access_token
      }
    }
  } catch {}
  return null
}

function taroFetch(input: any, init?: any): Promise<any> {
  const url = typeof input === 'string' ? input : (input && input.url) || ''
  const method = ((init?.method as any) || 'GET').toUpperCase()
  const initHeaders = init?.headers
  const header: Record<string, string> = {}

  // 1. 先展开 init.headers（Supabase 传入的是 Headers 实例或普通对象）
  if (initHeaders) {
    if (typeof initHeaders.forEach === 'function') {
      ;(initHeaders as any).forEach((v: string, k: string) => { header[String(k).toLowerCase()] = String(v) })
    } else if (Array.isArray(initHeaders)) {
      initHeaders.forEach(([k, v]: [string, string]) => { header[String(k).toLowerCase()] = String(v) })
    } else if (typeof initHeaders === 'object') {
      Object.keys(initHeaders).forEach(k => { header[String(k).toLowerCase()] = String((initHeaders as any)[k]) })
    }
  }

  // 2. 兜底补 apikey
  if (!header['apikey']) {
    header['apikey'] = SUPABASE_ANON_KEY
  }

  // 3. 关键：确保 Authorization 带的是用户登录后的 access_token，而不是 anon key
  const hasAuth = !!header['authorization']
  const token = getAccessTokenSync()
  if (token) {
    // 不管 SDK 有没有塞，我们都用从本地读到的 token 覆盖（最可靠）
    header['authorization'] = 'Bearer ' + token
  } else if (!hasAuth) {
    header['authorization'] = 'Bearer ' + SUPABASE_ANON_KEY
  }

  // ★ 调试日志（排查数据为空的问题，确认后可删除）
  const isDataReq = url.indexOf('/rest/v1/') >= 0
  if (isDataReq) {
    console.log('[taroFetch]', method, url.substring(url.indexOf('/rest/v1/')))
    console.log('[taroFetch] token:', token ? token.substring(0, 20) + '...' : 'NULL')
    console.log('[taroFetch] auth header:', header['authorization']?.substring(0, 30) + '...')
  }

  // 4. 处理 body
  let bodyData: any = init?.body
  const ct = header['content-type'] || ''
  if (typeof bodyData === 'string' && ct.indexOf('application/json') >= 0) {
    try { bodyData = JSON.parse(bodyData) } catch {}
  }

  return new Promise((resolve, reject) => {
    Taro.request({
      url,
      method: method as any,
      header,
      data: bodyData,
      dataType: 'json',
      responseType: 'text',
      success: (res: any) => {
        const status = res.statusCode || 200
        const isObj = res.data != null && typeof res.data === 'object' && !ArrayBuffer.isView(res.data)
        const textBody: string = typeof res.data === 'string' ? res.data : (isObj ? JSON.stringify(res.data) : '')

        // ★ 调试日志
        if (isDataReq) {
          const preview = textBody.substring(0, 200)
          console.log('[taroFetch] response status:', status, 'body:', preview)
        }

        resolve({
          ok: status >= 200 && status < 300,
          status,
          statusText: '',
          headers: new (MiniHeaders as any)(res.header || {}),
          url,
          redirected: false,
          type: 'basic' as any,
          bodyUsed: false,
          text: () => Promise.resolve(textBody),
          json: () => Promise.resolve(isObj ? res.data : (textBody ? JSON.parse(textBody) : null)),
          arrayBuffer: () => Promise.resolve(new Uint8Array(0)),
          blob: () => Promise.resolve({} as any),
          body: null,
          clone() { return this as any },
        })
      },
      fail: (err) => {
        if (isDataReq) console.error('[taroFetch] request failed:', err)
        reject(err)
      },
    })
  })
}

export const supabase: SupabaseClient = createClient(
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
      storage: taroStorageAdapter,
    },
    realtime: {
      url: SUPABASE_URL.replace('https://', 'wss://') + '/realtime/v1',
      logLevel: 'error',
    },
    global: {
      fetch: taroFetch as any,
    },
  },
)
// 让 taroFetch 兜底逻辑能拿到 supabase.auth.session 的 access_token
_sbRef = supabase as any
try { (globalThis as any).__sbClientRef = supabase } catch {}

// 小程序端不需要 Realtime，把内部的 realtime client 替换成空壳，避免 URL / WebSocket 报错
try {
  const sb = supabase as any
  if (sb && sb.realtime) {
    const empty = {
      channel: () => ({
        on: () => empty.channel(),
        subscribe: (cb?: any) => { if (cb) cb && cb('SUBSCRIBED', null); return empty.channel() },
        unsubscribe: () => Promise.resolve(),
        send: () => Promise.resolve({ ok: true }),
        off: () => empty.channel(),
        remove: () => {},
        state: 'SUBSCRIBED',
      }),
      removeChannel: () => Promise.resolve({ ok: true, data: null } as any),
      removeAllChannels: () => Promise.resolve({ ok: true, data: null } as any),
      getChannels: () => [],
      setAuth: () => Promise.resolve(),
      connect: () => {},
      disconnect: () => Promise.resolve({ code: 1000, reason: '' } as any),
      status: 'CLOSED',
    }
    sb.realtime = empty
  }
} catch {}

export function getPublicUrl(bucket: string, path: string) {
  const { data } = supabase.storage.from(bucket).getPublicUrl(path)
  return data.publicUrl
}

export function getProductImageUrl(path: string | null) {
  if (!path) return ''
  return getPublicUrl('product-images', path)
}
