import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

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
}

export function useOutOfStock() {
  return useQuery({
    queryKey: ['out-of-stock'],
    queryFn: async () => {
      // 1. 查询所有缺货记录（quantity = 0）
      const { data: zeroInventory, error: invError } = await supabase
        .from('inventory')
        .select(`
          id,
          quantity,
          product:products ( id, name, sku, barcode, image_path, unit, category ),
          location:locations (
            id, code, description,
            warehouse:warehouses ( id, code, name )
          )
        `)
        .eq('quantity', 0)
        .order('updated_at', { ascending: false })

      if (invError) throw invError
      if (!zeroInventory || zeroInventory.length === 0) return []

      const items = zeroInventory as unknown as OutOfStockItem[]

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

      // 4. 合并结果
      return items.map((item) => ({
        ...item,
        lastOutAt: lastOutMap.get(`${item.product.id}:${item.location.id}`) || null,
      }))
    },
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
