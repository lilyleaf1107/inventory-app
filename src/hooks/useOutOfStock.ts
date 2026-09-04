import { useQuery } from '@tanstack/react-query'
import { supabase, columnsExists } from '@/lib/supabase'
import { useSalesVelocity30d, OUT_30_DAYS_WINDOW } from '@/hooks/useLowStock'

export interface OutOfStockItem {
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
    track_qty?: boolean
    manual_status?: 'normal' | 'low_stock' | 'out_of_stock' | null
  }
  location: {
    id: string
    code: string
    description: string | null
    warehouse: {
      id: string
      code: string
      name: string | null
    }
  }
  lastOutAt: string | null
  outQty30d: number       // 近30天出库总量
  dailyAvg: number        // 日均出库量
  manualOverride?: boolean  // 不计数量 手动设置为缺货
}

export function useOutOfStock() {
  const { data: velocityMap } = useSalesVelocity30d()

  return useQuery({
    queryKey: ['out-of-stock-v2', velocityMap ? 'v' : 'l'],
    queryFn: async () => {
      const vMap = velocityMap || new Map<string, number>()

      // 🛡 探测 products 新列
      const cols = await columnsExists('products', ['track_qty', 'manual_status'])
      const baseFields = ['id', 'name', 'sku', 'barcode', 'image_path', 'unit', 'category']
      if (cols.track_qty) baseFields.push('track_qty')
      if (cols.manual_status) baseFields.push('manual_status')
      const productFields = baseFields.join(', ')

      // 1. 所有 inventory quantity=0（正常缺货）
      const { data: zeroInventory, error: invError } = await supabase
        .from('inventory')
        .select(`
          id,
          quantity,
          product:products ( ${productFields} ),
          location:locations (
            id, code, description,
            warehouse:warehouses ( id, code, name )
          )
        `)
        .eq('quantity', 0)
        .order('updated_at', { ascending: false })

      if (invError) throw invError
      const items: OutOfStockItem[] = (zeroInventory || []) as unknown as OutOfStockItem[]

      // 2. 不计数量的产品（track_qty=false）+ manual_status=out_of_stock → 也算缺货
      if (cols.track_qty && cols.manual_status) {
        const { data: manualOut, error: manualErr } = await supabase
          .from('products')
          .select(productFields)
          .eq('track_qty', false)
          .eq('manual_status', 'out_of_stock')
        if (manualErr) throw manualErr
        for (const p of (manualOut || []) as any[]) {
          // 如果 inventory 里已经有该产品=0 项，不要重复
          const already = items.find((i) => i.product.id === p.id)
          if (already) continue
          items.push({
            id: `manual-out-${p.id}`,
            quantity: 0,
            product: {
              id: p.id,
              name: p.name,
              sku: p.sku,
              barcode: p.barcode,
              image_path: p.image_path,
              unit: p.unit,
              category: p.category,
              track_qty: !!p.track_qty,
              manual_status: p.manual_status,
            },
            location: {
              id: 'manual',
              code: '不计数量',
              description: '手动设置为缺货',
              warehouse: { id: 'manual', code: '', name: null },
            },
            lastOutAt: null,
            outQty30d: vMap.get(p.id as string) || 0,
            dailyAvg: (vMap.get(p.id as string) || 0) / OUT_30_DAYS_WINDOW,
            manualOverride: true,
          })
        }
      }

      if (items.length === 0) return []

      // 2. 获取这些缺货项对应的最后一条出库时间
      const productIds = [...new Set(items.map((i) => i.product.id))]
      const locationIds = [...new Set(items.map((i) => i.location.id))]

      const { data: lastOutMoves, error: moveError } = await supabase
        .from('stock_moves')
        .select('product_id, location_id, created_at')
        .eq('move_type', 'out')
        .in('product_id', productIds)
        .in('location_id', locationIds)
        .order('created_at', { ascending: false })

      if (moveError) throw moveError

      // 3. 建立 (product_id + location_id) -> 最后出库时间的映射
      const lastOutMap = new Map<string, string>()
      for (const move of lastOutMoves || []) {
        const key = `${move.product_id}:${move.location_id}`
        if (!lastOutMap.has(key)) {
          lastOutMap.set(key, move.created_at)
        }
      }

      // 4. 合并结果 + 注入30天出库量/日均
      const enriched = items.map((item) => {
        const out30 = vMap.get(item.product.id) || 0
        return {
          ...item,
          lastOutAt: lastOutMap.get(`${item.product.id}:${item.location.id}`) || null,
          outQty30d: out30,
          dailyAvg: out30 / OUT_30_DAYS_WINDOW,
        }
      })

      // 5. 按出货优先级排序：30天出库量降序 → 有出库的在前 → 同量则断货越久越前 → 产品名兜底
      return enriched.sort((a, b) => {
        if (a.outQty30d !== b.outQty30d) return b.outQty30d - a.outQty30d
        const ta = a.lastOutAt ? new Date(a.lastOutAt).getTime() : 0
        const tb = b.lastOutAt ? new Date(b.lastOutAt).getTime() : 0
        if (ta !== tb) return ta - tb
        return (a.product.name || '').localeCompare(b.product.name || '')
      })
    },
  })
}

// 轻量版：仅返回缺货数量（首页用，不拉完整数据）
export function useOutOfStockCount() {
  return useQuery({
    queryKey: ['out-of-stock-count'],
    queryFn: async () => {
      const { count, error } = await supabase
        .from('inventory')
        .select('*', { count: 'exact', head: true })
        .eq('quantity', 0)
      if (error) throw error
      return count || 0
    },
    staleTime: 1000 * 60 * 2,
  })
}

// 格式化缺货时长，如 "3天5小时" / "2小时30分"
export function formatOutOfStockDuration(lastOutAt: string | null): string {
  if (!lastOutAt) return '未知'

  const diff = Date.now() - new Date(lastOutAt).getTime()
  const days = Math.floor(diff / (1000 * 60 * 60 * 24))
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60))
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60))

  if (days > 0) {
    return `${days}天${hours > 0 ? hours + '小时' : ''}`
  }
  if (hours > 0) {
    return `${hours}小时${minutes > 0 ? minutes + '分' : ''}`
  }
  return `${minutes}分钟`
}

// 缺货时长分级（用于颜色区分）
// ≤3天: warning(黄色), ≤7天: danger(橙色), ≤30天或更久: critical(红色)
export type StockoutLevel = 'recent' | 'warning' | 'danger' | 'critical'

export function getStockoutLevel(lastOutAt: string | null): StockoutLevel {
  if (!lastOutAt) return 'critical' // 无出库记录视为长期缺货
  const diff = Date.now() - new Date(lastOutAt).getTime()
  const days = diff / (1000 * 60 * 60 * 24)
  if (days < 3) return 'recent'       // 3天内：正常
  if (days < 7) return 'warning'      // 3-7天：黄色
  if (days < 30) return 'danger'      // 7-30天：橙色
  return 'critical'                    // 30天+：红色
}

export function getStockoutLevelColor(level: StockoutLevel): {
  text: string
  bg: string
  border: string
  label: string
} {
  switch (level) {
    case 'critical':
      return {
        text: 'text-red-800',
        bg: 'bg-red-100/70',
        border: 'border-red-300',
        label: '红色预警',
      }
    case 'danger':
      return {
        text: 'text-orange-700',
        bg: 'bg-orange-50/60',
        border: 'border-orange-200',
        label: '橙色预警',
      }
    case 'warning':
      return {
        text: 'text-yellow-700',
        bg: 'bg-yellow-50/40',
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
