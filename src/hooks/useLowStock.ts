import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export interface LowStockItem {
  id: string
  quantity: number
  minStock: number
  stockRatio: number // 当前库存 / min_stock 的比例
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
}

// 低库存预警等级
export type LowStockLevel = 'normal' | 'warning' | 'danger' | 'critical'

// 根据库存比例返回预警等级
// >50%: normal, 30-50%: warning(黄色), 10-30%: danger(橙色), <10%: critical(红色)
export function getLowStockLevel(quantity: number, minStock: number): LowStockLevel {
  if (minStock <= 0) return 'normal'
  const ratio = quantity / minStock
  if (ratio <= 0.1) return 'critical'
  if (ratio <= 0.3) return 'danger'
  if (ratio <= 0.5) return 'warning'
  return 'normal'
}

export function getLowStockLevelColor(level: LowStockLevel): {
  text: string
  bg: string
  border: string
  label: string
} {
  switch (level) {
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

// 获取低库存商品列表（库存 > 0 但低于 min_stock 的 50%）
export function useLowStock() {
  return useQuery({
    queryKey: ['low-stock'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('inventory')
        .select(`
          id,
          quantity,
          product:products (
            id, name, sku, barcode, image_path, unit, category,
            min_stock, is_material_area
          ),
          location:locations (
            id, code,
            warehouse:warehouses ( id, code, name )
          )
        `)
        .gt('quantity', 0)
        .order('updated_at', { ascending: true })

      if (error) throw error

      const items = (data || []) as unknown as LowStockItem[]

      // 过滤出有 min_stock 且库存低于 min_stock 50% 的项
      return items
        .filter((item) => {
          const minStock = (item.product as any).min_stock
          if (!minStock || minStock <= 0) return false
          const ratio = item.quantity / minStock
          return ratio <= 0.5
        })
        .map((item) => {
          const minStock = (item.product as any).min_stock
          item.minStock = minStock
          item.stockRatio = item.quantity / minStock
          return item
        })
        .sort((a, b) => a.stockRatio - b.stockRatio)
    },
  })
}

// 获取低库存数量统计
export function useLowStockCount() {
  const { data } = useLowStock()
  return {
    total: data?.length || 0,
    warning: data?.filter((i) => getLowStockLevel(i.quantity, i.minStock) === 'warning').length || 0,
    danger: data?.filter((i) => getLowStockLevel(i.quantity, i.minStock) === 'danger').length || 0,
    critical: data?.filter((i) => getLowStockLevel(i.quantity, i.minStock) === 'critical').length || 0,
  }
}
