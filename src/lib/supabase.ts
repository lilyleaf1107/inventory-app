import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn(
    '缺少 Supabase 配置未设置，请配置 VITE_SUPABASE_URL 和 VITE_SUPABASE_ANON_KEY',
  )
}

// 提前建立到 Supabase 的连接（DNS 预解析 + TLS 握手），减少安卓首屏等待
if (supabaseUrl && typeof document !== 'undefined') {
  try {
    const origin = new URL(supabaseUrl).origin
    const dns = document.createElement('link')
    dns.rel = 'dns-prefetch'
    dns.href = origin
    document.head.appendChild(dns)
    const pre = document.createElement('link')
    pre.rel = 'preconnect'
    pre.href = origin
    pre.crossOrigin = 'anonymous'
    document.head.appendChild(pre)
  } catch {
    /* ignore */
  }
}

export const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseAnonKey || 'placeholder',
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false, // 移动端不需要 URL 检测，减少开销
    },
  },
)

export function getPublicUrl(bucket: string, path: string) {
  const { data } = supabase.storage.from(bucket).getPublicUrl(path)
  return data.publicUrl
}

export function getProductImageUrl(path: string | null) {
  if (!path) return ''
  return getPublicUrl('product-images', path)
}

export async function uploadProductImage(file: File) {
  const ext = file.name.split('.').pop()
  const fileName = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`
  const { error } = await supabase.storage
    .from('product-images')
    .upload(fileName, file)
  if (error) throw error
  return fileName
}

export async function deleteProductImage(path: string) {
  await supabase.storage.from('product-images').remove([path])
}

// ============================================================
// 列存在性探测（缓存）：解决"迁移SQL未执行时schema cache找不到列"报错
// 典型使用：
//   if (await columnExists('products', 'manual_status')) patch.manual_status = x
// ============================================================
const _colCache = new Map<string, boolean>()
const _colInFlight = new Map<string, Promise<boolean>>()

export function columnExists(table: string, column: string): Promise<boolean> {
  const key = `${table}.${column}`
  if (_colCache.has(key)) return Promise.resolve(_colCache.get(key)!)
  let inflight = _colInFlight.get(key)
  if (inflight) return inflight
  inflight = (async () => {
    try {
      // 尝试从 information_schema 查（通常受RLS限制返回空，但不会抛错）
      const { data, error } = await supabase
        .from('information_schema.columns')
        .select('column_name')
        .eq('table_schema', 'public')
        .eq('table_name', table)
        .eq('column_name', column)
        .limit(1)
      if (!error && Array.isArray(data) && data.length > 0) {
        _colCache.set(key, true); return true
      }
    } catch { /* ignore, fall through to probe */ }
    // 兜底探测：只 select 该列 limit 0，若成功说明存在（schema cache命中则成功）
    try {
      const probe: any = supabase.from(table).select(column).limit(0)
      const { error: err } = await probe
      if (!err) { _colCache.set(key, true); return true }
      const msg = String(err?.message || '').toLowerCase()
      if (msg.includes('column') && (msg.includes('not found') || msg.includes('does not exist') || msg.includes("couldn't find"))) {
        _colCache.set(key, false); return false
      }
      // 其他错误（权限/RPC）保守地认为列存在，避免误杀
      _colCache.set(key, true); return true
    } catch (e: any) {
      const msg = String(e?.message || '').toLowerCase()
      if (msg.includes('column') && (msg.includes('not found') || msg.includes('does not exist') || msg.includes("couldn't find"))) {
        _colCache.set(key, false); return false
      }
      _colCache.set(key, true); return true
    } finally {
      _colInFlight.delete(key)
    }
  })()
  _colInFlight.set(key, inflight)
  return inflight
}

// 批量版：一次性返回给定 (table, col[]) 的 Map
export async function columnsExists(table: string, columns: string[]): Promise<Record<string, boolean>> {
  const res: Record<string, boolean> = {}
  await Promise.all(columns.map(async (c) => { res[c] = await columnExists(table, c) }))
  return res
}
