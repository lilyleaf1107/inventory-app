import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
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
  // 方案A：补充字段
  outQty30d?: number       // 过去30天出库总量
  dailyAvg?: number        // 日均出库量
  sellableDays?: number    // 能卖天数（库存 / 日均）
  usesFallback?: boolean   // 是否使用了固定阈值兜底（新品/无出库）
}

// 低库存预警等级
export type LowStockLevel = 'normal' | 'warning' | 'danger' | 'critical' | 'out'

// ============ 固定阈值（兜底用，新品/30天无出库记录时生效） ============
export const LOW_STOCK_THRESHOLD_WARNING = 30
export const LOW_STOCK_THRESHOLD_DANGER = 15
export const LOW_STOCK_THRESHOLD_CRITICAL = 5

// ============ 方案A：能卖天数字面量阈值 ============
// 能卖天数 ≤3 天红（critical），≤7 天橙（danger），≤15 天黄（warning），>15 天正常
export const DAYS_THRESHOLD_WARNING = 15
export const DAYS_THRESHOLD_DANGER = 7
export const DAYS_THRESHOLD_CRITICAL = 3
export const OUT_30_DAYS_WINDOW = 30 // 统计过去 30 天出库

function getThresholds() {
  const s = getSettings()
  return {
    warning: s.lowStockWarning || LOW_STOCK_THRESHOLD_WARNING,
    danger: s.lowStockDanger || LOW_STOCK_THRESHOLD_DANGER,
    critical: s.lowStockCritical || LOW_STOCK_THRESHOLD_CRITICAL,
  }
}

// ============================================================
// 方案A：核心计算 — 根据 库存数量 + 30天出库量 → 能卖天数 → 预警等级
// 若无出库（日均=0），回退到固定数量阈值逻辑并标记 usesFallback=true
// ============================================================
export interface StockAlertResult {
  level: LowStockLevel
  dailyAvg: number
  sellableDays: number | null   // null 表示无出库记录，走的固定阈值
  usesFallback: boolean
}

export function calcStockAlert(quantity: number, outQty30d: number | undefined | null): StockAlertResult {
  if (quantity <= 0) {
    return { level: 'out', dailyAvg: 0, sellableDays: 0, usesFallback: false }
  }
  const out30 = Number(outQty30d) || 0
  const dailyAvg = out30 / OUT_30_DAYS_WINDOW

  // 30天有出库记录 → 按"能卖天数"分级
  if (out30 > 0) {
    const days = quantity / dailyAvg
    let level: LowStockLevel = 'normal'
    if (days <= DAYS_THRESHOLD_CRITICAL) level = 'critical'
    else if (days <= DAYS_THRESHOLD_DANGER) level = 'danger'
    else if (days <= DAYS_THRESHOLD_WARNING) level = 'warning'
    return { level, dailyAvg, sellableDays: days, usesFallback: false }
  }

  // 无出库 → 回退固定阈值兜底
  const t = getThresholds()
  let level: LowStockLevel = 'normal'
  if (quantity <= t.critical) level = 'critical'
  else if (quantity <= t.danger) level = 'danger'
  else if (quantity <= t.warning) level = 'warning'
  return { level, dailyAvg: 0, sellableDays: null, usesFallback: true }
}

// 兼容老接口：仅传数量，按固定阈值返回等级（不再建议使用，保留以防漏改）
export function getLowStockLevel(quantity: number): LowStockLevel {
  return calcStockAlert(quantity, 0).level
}

// 新版：同时接受 30 天出库量（优先走方案A）
export function getLowStockLevelV2(quantity: number, outQty30d?: number | null): LowStockLevel {
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

// 能卖天数友好展示（保留1位小数；null 显示"新品/暂无出库"）
export function formatSellableDays(days: number | null, usesFallback: boolean): string {
  if (days === null || usesFallback) return '暂无销售数据'
  if (!isFinite(days)) return '暂无销售数据'
  if (days >= 1000) return '>999 天'
  return days.toFixed(1) + ' 天'
}

// ============================================================
// Hook：拉取「每个产品过去30天的出库总量」— 用于方案A计算
// 结果：Map<productId, outQty30d>
// ============================================================
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
// 方案A：获取「低库存预警列表」
// 核心改动：
// 1. 先拉全部 inventory + unallocated
// 2. 再拉 sales_velocity_30d（每个产品30天出库量）
// 3. 用 calcStockAlert() 按"能卖天数"计算等级
// 4. 保留 level !== 'normal' 的项（按能卖天数升序 + 暂未入仓靠后排序）
// ============================================================
export function useLowStock() {
  // 1) 30天销售速度
  const { data: velocityMap } = useSalesVelocity30d()

  return useQuery({
    queryKey: ['low-stock', velocityMap ? 'v' : 'l'],
    queryFn: async () => {
      const vMap = velocityMap || new Map<string, number>()

      // 1. 所有 inventory（含 > 15天阈值的，后面按能卖天数二次筛选）
      const { data: invData, error: invErr } = await supabase
        .from('inventory')
        .select(`
          id,
          quantity,
          product:products (
            id, name, sku, barcode, image_path, unit, category,
            is_material_area
          ),
          location:locations (
            id, code,
            warehouse:warehouses ( id, code, name )
          )
        `)
        .gt('quantity', 0)
        .order('quantity', { ascending: true })

      if (invErr) throw invErr
      const items: LowStockItem[] = []

      for (const row of (invData || []) as any[]) {
        const qty = Number(row.quantity) || 0
        if (qty <= 0) continue
        const pid = row.product?.id as string
        const out30 = vMap.get(pid) || 0
        const alert = calcStockAlert(qty, out30)
        if (alert.level === 'normal') continue // 正常的不进预警列表
        items.push({
          ...(row as LowStockItem),
          outQty30d: out30,
          dailyAvg: alert.dailyAvg,
          sellableDays: alert.sellableDays ?? undefined,
          usesFallback: alert.usesFallback,
        })
      }

      // 2. products.unallocated_quantity 命中预警的产品
      const { data: prodData, error: prodErr } = await supabase
        .from('products')
        .select('id, name, sku, barcode, image_path, unit, category, is_material_area, unallocated_quantity')
        .gt('unallocated_quantity', 0)

      if (prodErr) throw prodErr

      for (const p of (prodData || []) as any[]) {
        const qty = Number(p.unallocated_quantity) || 0
        if (qty <= 0) continue
        const out30 = vMap.get(p.id) || 0
        const alert = calcStockAlert(qty, out30)
        if (alert.level === 'normal') continue
        items.push({
          id: `unalloc-${p.id}`,
          quantity: qty,
          product: {
            id: p.id,
            name: p.name,
            sku: p.sku,
            barcode: p.barcode,
            image_path: p.image_path,
            unit: p.unit,
            category: p.category,
            is_material_area: !!p.is_material_area,
          },
          location: {
            id: 'unalloc',
            code: '暂未入仓',
            warehouse: {
              id: 'unalloc',
              code: '',
              name: null,
            },
          },
          outQty30d: out30,
          dailyAvg: alert.dailyAvg,
          sellableDays: alert.sellableDays ?? undefined,
          usesFallback: alert.usesFallback,
        })
      }

      // 排序：
      // 1) 能卖天数升序（能卖越少越靠前；回退固定阈值的按数量升序）
      // 2) 暂未入仓放后面
      items.sort((a, b) => {
        const aFallback = !!a.usesFallback || a.sellableDays == null
        const bFallback = !!b.usesFallback || b.sellableDays == null
        // 两者都有天数 → 按天数
        if (!aFallback && !bFallback) {
          const diff = (a.sellableDays as number) - (b.sellableDays as number)
          if (diff !== 0) return diff
        } else if (aFallback && !bFallback) {
          return 1 // 回退位靠后
        } else if (!aFallback && bFallback) {
          return -1
        } else {
          // 都回退 → 按数量升序
          if (a.quantity !== b.quantity) return a.quantity - b.quantity
        }
        // 同等级下暂未入仓放后面
        const aIs = a.location.id === 'unalloc' ? 1 : 0
        const bIs = b.location.id === 'unalloc' ? 1 : 0
        return aIs - bIs
      })

      return items
    },
    enabled: !!velocityMap,
  })
}

// 分级统计（低库存详情页顶部卡片用）
export function useLowStockCount() {
  const { data } = useLowStock()
  return {
    total: data?.length || 0,
    warning: data?.filter((i) => getLowStockLevelV2(i.quantity, i.outQty30d) === 'warning').length || 0,
    danger: data?.filter((i) => getLowStockLevelV2(i.quantity, i.outQty30d) === 'danger').length || 0,
    critical: data?.filter((i) => getLowStockLevelV2(i.quantity, i.outQty30d) === 'critical').length || 0,
  }
}

// 轻量版：仅统计预警总数（首页导航徽标用）
export function useLowStockCountLight() {
  const { data: velocityMap } = useSalesVelocity30d()
  return useQuery({
    queryKey: ['low-stock-count-light', velocityMap ? 'v' : 'l'],
    queryFn: async () => {
      const vMap = velocityMap || new Map<string, number>()
      const t = getThresholds()

      // 1. inventory 全部 > 0
      const { data: invRows, error: invErr } = await supabase
        .from('inventory')
        .select('product_id, quantity')
        .gt('quantity', 0)
      if (invErr) throw invErr

      let total = 0
      for (const row of (invRows || []) as any[]) {
        const qty = Number(row.quantity) || 0
        const out30 = vMap.get(row.product_id as string) || 0
        const alert = calcStockAlert(qty, out30)
        if (alert.level !== 'normal') total++
      }

      // 2. unallocated
      const { data: prodRows, error: prodErr } = await supabase
        .from('products')
        .select('id, unallocated_quantity')
        .gt('unallocated_quantity', 0)
      if (prodErr) throw prodErr
      for (const row of (prodRows || []) as any[]) {
        const qty = Number(row.unallocated_quantity) || 0
        const out30 = vMap.get(row.id as string) || 0
        const alert = calcStockAlert(qty, out30)
        if (alert.level !== 'normal') total++
      }

      void t // 保留 t 读取以防将来需要自定义固定阈值
      return total
    },
    enabled: !!velocityMap,
    staleTime: 1000 * 60 * 2,
  })
}
