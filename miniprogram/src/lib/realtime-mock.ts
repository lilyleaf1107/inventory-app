/**
 * Realtime 客户端空壳实现。
 * 小程序端不需要 WebSocket 实时推送，但 @supabase/supabase-js 内部
 * 会强制 new RealtimeClient，并在构造时调用 new URL(...)，这个 URL
 * 走到 Taro runtime 内部的 URL 校验实现会 throw。通过 webpack alias
 * 把整个 @supabase/realtime-js 模块替换成本文件即可绕过。
 */

export const REALTIME_CHANNEL_STATES = {
  joined: 'JOINED',
  joining: 'JOINING',
  leaving: 'LEAVING',
  closed: 'CLOSED',
  errored: 'ERRORED',
} as const

export const REALTIME_LISTEN_TYPES = {
  broadcast: 'broadcast',
  presence: 'presence',
  postgres_changes: 'postgres_changes',
} as const

export const REALTIME_POSTGRES_CHANGES_LISTEN_EVENT = {
  ALL: '*',
  INSERT: 'INSERT',
  UPDATE: 'UPDATE',
  DELETE: 'DELETE',
} as const

export const REALTIME_PRESENCE_LISTEN_EVENTS = {
  SYNC: 'sync',
  JOIN: 'join',
  LEAVE: 'leave',
} as const

export const REALTIME_SUBSCRIBE_STATES = {
  SUBSCRIBED: 'SUBSCRIBED',
  TIMED_OUT: 'TIMED_OUT',
  CLOSED: 'CLOSED',
  CHANNEL_ERROR: 'CHANNEL_ERROR',
} as const

type AnyFn = (...args: any[]) => any

export class RealtimeChannel {
  topic: string
  params: any
  socket: any
  state: string = 'joined'
  joinedOnce = true

  constructor(topic: string, params: any = {}, socket: any = null) {
    this.topic = topic
    this.params = params
    this.socket = socket
  }

  on(_type: any, _filter: any, _callback?: AnyFn): this { return this }
  subscribe(_callback?: AnyFn): this {
    if (_callback) { try { _callback('SUBSCRIBED', null) } catch {} }
    return this
  }
  unsubscribe(): Promise<{ ok: boolean; data?: any }> {
    return Promise.resolve({ ok: true })
  }
  send(_payload: any): Promise<{ ok: boolean }> {
    return Promise.resolve({ ok: true })
  }
  off(..._args: any[]): this { return this }
  trigger(_type: any, _payload?: any, _ref?: any) { return this }
  presenceState(): any { return {} }
  track(_payload: any): Promise<{ ok: boolean }> { return Promise.resolve({ ok: true }) }
  untrack(): Promise<{ ok: boolean }> { return Promise.resolve({ ok: true }) }
}

export class RealtimeClient {
  accessToken: string | null = null
  apikey: string | null = null
  channels: RealtimeChannel[] = []
  endPoint: string = ''
  httpEndpoint: string = ''
  wsEndpoint: string = ''
  ref: number = 0
  timeout: number = 10000
  wsTransport: any = null
  webSocket: any = null
  conn: any = null
  sendBuffer: any[] = []
  longPoller: any = null
  pendingHeartbeatRef: any = null
  heartbeatIntervalMs: number = 30000
  reconnectAfterMs: any = () => 1000
  logger: any = () => {}
  logLevel: string = 'error'
  headers: any = {}
  params: any = {}
  status: string = 'CLOSED'

  constructor(endPoint: string = 'wss://default.local/realtime/v1', options: any = {}) {
    this.endPoint = endPoint || 'wss://default.local/realtime/v1'
    this.wsEndpoint = endPoint || 'wss://default.local/realtime/v1'
    this.httpEndpoint = (endPoint || 'https://default.local').replace(/^wss?\:\/\//i, 'https://')
    this.apikey = options?.apikey ?? null
    this.params = options?.params ?? {}
    this.timeout = options?.timeout ?? 10000
    this.logLevel = options?.logLevel ?? 'error'
    this.logger = options?.logger ?? (() => {})
    this.headers = options?.headers ?? {}
    this.heartbeatIntervalMs = options?.heartbeatIntervalMs ?? 30000
    this.reconnectAfterMs = options?.reconnectAfterMs ?? (() => 1000)
    this.wsTransport = options?.transport ?? null
    this.accessToken = options?.accessToken ?? null
  }

  connect() { this.status = 'OPEN' }
  disconnect(_code?: number, _reason?: string): Promise<{ code: number; reason: string }> {
    this.status = 'CLOSED'
    return Promise.resolve({ code: 1000, reason: 'normal' })
  }
  channel(topic: string, params: any = {}): RealtimeChannel {
    const ch = new RealtimeChannel(topic, params, this as any)
    this.channels.push(ch)
    return ch
  }
  getChannels(): RealtimeChannel[] { return this.channels.slice() }
  removeChannel(channel: RealtimeChannel): Promise<{ ok: boolean; data: any }> {
    this.channels = this.channels.filter(c => c !== channel)
    return Promise.resolve({ ok: true, data: 'ok' })
  }
  removeAllChannels(): Promise<{ ok: boolean; data: any }> {
    this.channels = []
    return Promise.resolve({ ok: true, data: 'ok' })
  }
  setAuth(token: string | null): Promise<void> {
    this.accessToken = token
    return Promise.resolve()
  }
  push(_params: any): any { return {} as any }
}

export default RealtimeClient
