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
}

// 低库存预警等级
export type LowStockLevel = 'normal' | 'warning' | 'danger' | 'critical' | 'out'

// 默认阈值（可在设置页面调整）
// ≤5: critical(红色), ≤15: danger(橙色), ≤30: warning(黄色), =0: out(缺货)
export const LOW_STOCK_THRESHOLD_WARNING = 30
export const LOW_STOCK_THRESHOLD_DANGER = 15
export const LOW_STOCK_THRESHOLD_CRITICAL = 5

// 从 settings 读取当前阈值
function getThresholds() {
  const s = getSettings()
  return {
    warning: s.lowStockWarning || LOW_STOCK_THRESHOLD_WARNING,
    danger: s.lowStockDanger || LOW_STOCK_THRESHOLD_DANGER,
    critical: s.lowStockCritical || LOW_STOCK_THRESHOLD_CRITICAL,
  }
}

// 根据库存数量返回预警等级
export function getLowStockLevel(quantity: number): LowStockLevel {
  const t = getThresholds()
  if (quantity <= 0) return 'out'
  if (quantity <= t.critical) return 'critical'
  if (quantity <= t.danger) return 'danger'
  if (quantity <= t.warning) return 'warning'
  return 'normal'
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

// 获取低库存商品列表（库存 > 0 且 ≤ 预警阈值）
export function useLowStock() {
  return useQuery({
    queryKey: ['low-stock'],
    queryFn: async () => {
      const t = getThresholds()
      const { data, error } = await supabase
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
        .lte('quantity', t.warning)
        .order('quantity', { ascending: true })

      if (error) throw error
      return (data || []) as unknown as LowStockItem[]
    },
  })
}

// 获取低库存数量统计（完整版，用于低库存详情页）
export function useLowStockCount() {
  const { data } = useLowStock()
  return {
    total: data?.length || 0,
    warning: data?.filter((i) => getLowStockLevel(i.quantity) === 'warning').length || 0,
    danger: data?.filter((i) => getLowStockLevel(i.quantity) === 'danger').length || 0,
    critical: data?.filter((i) => getLowStockLevel(i.quantity) === 'critical').length || 0,
  }
}

// 轻量版：仅用 count 查询获取总数（首页用，不拉完整数据）
export function useLowStockCountLight() {
  const t = getThresholds()
  return useQuery({
    queryKey: ['low-stock-count', t.warning],
    queryFn: async () => {
      const { count, error } = await supabase
        .from('inventory')
        .select('*', { count: 'exact', head: true })
        .gt('quantity', 0)
        .lte('quantity', t.warning)
      if (error) throw error
      return count || 0
    },
    staleTime: 1000 * 60 * 2,
  })
}
