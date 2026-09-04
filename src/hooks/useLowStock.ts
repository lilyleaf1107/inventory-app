import { useQuery } from '@tanstack/react-query'
import { supabase, columnsExists } from '@/lib/supabase'
import { getSettings } from '@/lib/settings'

export interface LowStockItem {
  id: string
  quantity: number
  product: {
    id: string
    name: string
    sku: string | null
    barcode: string | null
    image_path: string | null
    unit: string
    category: string | null
    is_material_area: boolean
    track_qty?: boolean
    manual_status?: 'normal' | 'low_stock' | 'out_of_stock' | null
  }
  location: {
    id: string
    code: string
    warehouse: {
      id: string
      code: string
      name: string | null
    }
  }
  outQty30d?: number
  dailyAvg?: number
  sellableDays?: number
  usesFallback?: boolean
  /** track_qty=false 时，用 manual_status 覆盖等级；这里明确写出真实等级来源 */
  manualOverrideLevel?: LowStockLevel | null
}

export type LowStockLevel = 'normal' | 'warning' | 'danger' | 'critical' | 'out'

export const LOW_STOCK_THRESHOLD_WARNING = 30
export const LOW_STOCK_THRESHOLD_DANGER = 15
export const LOW_STOCK_THRESHOLD_CRITICAL = 5

export const DAYS_THRESHOLD_WARNING = 15
export const DAYS_THRESHOLD_DANGER = 7
export const DAYS_THRESHOLD_CRITICAL = 3
export const OUT_30_DAYS_WINDOW = 30

function getThresholds() {
  const s = getSettings()
  return {
    warning: s.lowStockWarning || LOW_STOCK_THRESHOLD_WARNING,
    danger: s.lowStockDanger || LOW_STOCK_THRESHOLD_DANGER,
    critical: s.lowStockCritical || LOW_STOCK_THRESHOLD_CRITICAL,
  }
}

export interface StockAlertResult {
  level: LowStockLevel
  dailyAvg: number
  sellableDays: number | null
  usesFallback: boolean
}

export function calcStockAlert(quantity: number, outQty30d: number | undefined | null): StockAlertResult {
  if (quantity <= 0) {
    return { level: 'out', dailyAvg: 0, sellableDays: 0, usesFallback: false }
  }
  const out30 = Number(outQty30d) || 0
  const dailyAvg = out30 / OUT_30_DAYS_WINDOW

  if (out30 > 0) {
    const days = quantity / dailyAvg
    let level: LowStockLevel = 'normal'
    if (days <= DAYS_THRESHOLD_CRITICAL) level = 'critical'
    else if (days <= DAYS_THRESHOLD_DANGER) level = 'danger'
    else if (days <= DAYS_THRESHOLD_WARNING) level = 'warning'
    return { level, dailyAvg, sellableDays: days, usesFallback: false }
  }

  const t = getThresholds()
  let level: LowStockLevel = 'normal'
  if (quantity <= t.critical) level = 'critical'
  else if (quantity <= t.danger) level = 'danger'
  else if (quantity <= t.warning) level = 'warning'
  return { level, dailyAvg: 0, sellableDays: null, usesFallback: true }
}

/** 将 products.manual_status 映射为等级 */
function mapManualStatus(status: 'normal' | 'low_stock' | 'out_of_stock' | null | undefined): LowStockLevel {
  switch (status) {
    case 'out_of_stock': return 'out'
    case 'low_stock': return 'warning'
    case 'normal': return 'normal'
    default: return 'normal'
  }
}

export function getLowStockLevel(quantity: number): LowStockLevel {
  return calcStockAlert(quantity, 0).level
}

export function getLowStockLevelV2(
  quantity: number,
  outQty30d?: number | null,
  opts?: { trackQty?: boolean; manualStatus?: 'normal' | 'low_stock' | 'out_of_stock' | null }
): LowStockLevel {
  // 不计数量的产品：如果设置了 manual_status，优先用它
  if (opts?.trackQty === false && opts?.manualStatus) {
    return mapManualStatus(opts.manualStatus)
  }
  return calcStockAlert(quantity, outQty30d).level
}

export function getLowStockLevelColor(level: LowStockLevel): {
  text: string
  bg: string
  border: string
  label: string
} {
  switch (level) {
    case 'out':
      return {
        text: 'text-red-800',
        bg: 'bg-red-100/70',
        border: 'border-red-300',
        label: '缺货',
      }
    case 'critical':
      return {
        text: 'text-red-700',
        bg: 'bg-red-50/60',
        border: 'border-red-200',
        label: '红色预警',
      }
    case 'danger':
      return {
        text: 'text-orange-700',
        bg: 'bg-orange-50/40',
        border: 'border-orange-200',
        label: '橙色预警',
      }
    case 'warning':
      return {
        text: 'text-yellow-700',
        bg: 'bg-yellow-50/30',
        border: 'border-yellow-200',
        label: '黄色预警',
      }
    default:
      return {
        text: 'text-muted-foreground',
        bg: 'bg-background',
        border: 'border',
        label: '',
      }
  }
}

export function formatSellableDays(days: number | null, usesFallback: boolean): string {
  if (days === null || usesFallback) return '暂无销售数据'
  if (!isFinite(days)) return '暂无销售数据'
  if (days >= 1000) return '>999 天'
  return days.toFixed(1) + ' 天'
}

export function useSalesVelocity30d() {
  return useQuery({
    queryKey: ['sales-velocity-30d'],
    queryFn: async () => {
      const since = new Date()
      since.setDate(since.getDate() - OUT_30_DAYS_WINDOW)
      const { data, error } = await supabase
        .from('stock_moves')
        .select('product_id, quantity')
        .eq('move_type', 'out')
        .gte('created_at', since.toISOString())
      if (error) throw error
      const map = new Map<string, number>()
      for (const row of (data || []) as any[]) {
        const pid = row.product_id as string
        const q = Number(row.quantity) || 0
        map.set(pid, (map.get(pid) || 0) + q)
      }
      return map
    },
    staleTime: 1000 * 60 * 5,
  })
}

// ============================================================
// useLowStock：筛选预警（注意：unallocated_quantity 字段已被 0018 迁移删除，不再读它）
// 同时支持 track_qty=false 的「不计数量」产品：manual_status=low_stock/out_of_stock 时入预警
// ============================================================
export function useLowStock() {
  const { data: velocityMap } = useSalesVelocity30d()

  return useQuery({
    queryKey: ['low-stock-v2', velocityMap ? 'v' : 'l'],
    queryFn: async () => {
      const vMap = velocityMap || new Map<string, number>()

      // 🛡 兼容：探测 products 新列，不存在时从 select 里剔除
      const cols = await columnsExists('products', ['track_qty', 'manual_status'])
      const prodFields = [
        'id', 'name', 'sku', 'barcode', 'image_path', 'unit', 'category', 'is_material_area',
        cols.track_qty ? 'track_qty' : null,
        cols.manual_status ? 'manual_status' : null,
      ].filter(Boolean).join(', ')
      const { data: invData, error: invErr } = await supabase
        .from('inventory')
        .select(`
          id,
          quantity,
          product:products ( ${prodFields} ),
          location:locations ( id, code, warehouse:warehouses ( id, code, name ) )
        `)
        .order('quantity', { ascending: true })

      if (invErr) throw invErr
      const items: LowStockItem[] = []

      for (const row of (invData || []) as any[]) {
        const prod = row.product as LowStockItem['product'] | null
        if (!prod) continue
        const trackQty = prod.track_qty !== false
        const qty = Number(row.quantity) || 0
        const out30 = vMap.get(prod.id) || 0

        let level: LowStockLevel
        if (!trackQty && prod.manual_status) {
          // 不计数量 + 手动状态 → 用手动状态覆盖
          level = mapManualStatus(prod.manual_status)
        } else {
          // 正常产品：数量为 0 也纳入"缺货"预警（此前只选 >0 的，会漏掉缺库存的）
          level = calcStockAlert(qty, out30).level
        }
        if (level === 'normal') continue
        const alert = calcStockAlert(qty, out30)
        items.push({
          id: String(row.id),
          quantity: qty,
          product: prod,
          location: row.location as LowStockItem['location'],
          outQty30d: out30,
          dailyAvg: alert.dailyAvg,
          sellableDays: alert.sellableDays ?? undefined,
          usesFallback: alert.usesFallback,
          manualOverrideLevel: !trackQty && prod.manual_status ? level : null,
        })
      }

      items.sort((a, b) => {
        // 先按等级严重性：out > critical > danger > warning
        const lv = (l: LowStockLevel) =>
          l === 'out' ? 0 : l === 'critical' ? 1 : l === 'danger' ? 2 : l === 'warning' ? 3 : 4
        const aLvl = a.manualOverrideLevel ?? calcStockAlert(a.quantity, a.outQty30d ?? 0).level
        const bLvl = b.manualOverrideLevel ?? calcStockAlert(b.quantity, b.outQty30d ?? 0).level
        const lvd = lv(aLvl) - lv(bLvl)
        if (lvd !== 0) return lvd
        const aFallback = !!a.usesFallback || a.sellableDays == null
        const bFallback = !!b.usesFallback || b.sellableDays == null
        if (!aFallback && !bFallback) {
          const diff = (a.sellableDays as number) - (b.sellableDays as number)
          if (diff !== 0) return diff
        } else if (aFallback && !bFallback) {
          return 1
        } else if (!aFallback && bFallback) {
          return -1
        } else {
          if (a.quantity !== b.quantity) return a.quantity - b.quantity
        }
        return 0
      })

      return items
    },
    enabled: !!velocityMap,
  })
}

export function useLowStockCount() {
  const { data } = useLowStock()
  return {
    total: data?.length || 0,
    warning: data?.filter((i) => getLowStockLevelV2(i.quantity, i.outQty30d, {
      trackQty: i.product.track_qty !== false,
      manualStatus: i.product.manual_status ?? null,
    }) === 'warning').length || 0,
    danger: data?.filter((i) => getLowStockLevelV2(i.quantity, i.outQty30d, {
      trackQty: i.product.track_qty !== false,
      manualStatus: i.product.manual_status ?? null,
    }) === 'danger').length || 0,
    critical: data?.filter((i) => getLowStockLevelV2(i.quantity, i.outQty30d, {
      trackQty: i.product.track_qty !== false,
      manualStatus: i.product.manual_status ?? null,
    }) === 'critical').length || 0,
    out: data?.filter((i) => getLowStockLevelV2(i.quantity, i.outQty30d, {
      trackQty: i.product.track_qty !== false,
      manualStatus: i.product.manual_status ?? null,
    }) === 'out').length || 0,
  }
}

export function useLowStockCountLight() {
  const { data: velocityMap } = useSalesVelocity30d()
  return useQuery({
    queryKey: ['low-stock-count-light-v2', velocityMap ? 'v' : 'l'],
    queryFn: async () => {
      const vMap = velocityMap || new Map<string, number>()
      // 🛡 兼容：列不存在时不 select
      const cols = await columnsExists('products', ['track_qty', 'manual_status'])
      const prodFields = [
        cols.track_qty ? 'track_qty' : null,
        cols.manual_status ? 'manual_status' : null,
      ].filter(Boolean)
      const selectPart = prodFields.length > 0
        ? `product_id, quantity, product:products ( ${prodFields.join(', ')} )`
        : 'product_id, quantity'
      const { data: rows, error } = await supabase
        .from('inventory')
        .select(selectPart)
      if (error) throw error
      let total = 0
      for (const r of (rows || []) as any[]) {
        const prod = r.product || {}
        const trackQty = prod.track_qty !== false
        if (!trackQty && prod.manual_status) {
          const l = mapManualStatus(prod.manual_status)
          if (l !== 'normal') { total++; continue }
        }
        const qty = Number(r.quantity) || 0
        const out30 = vMap.get(r.product_id as string) || 0
        const alert = calcStockAlert(qty, out30)
        if (alert.level !== 'normal') total++
      }
      return total
    },
    enabled: !!velocityMap,
    staleTime: 1000 * 60 * 2,
  })
}
