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
// 合并两部分：inventory 库位明细 + products.unallocated_quantity 暂未入仓虚拟项
export function useLowStock() {
  return useQuery({
    queryKey: ['low-stock'],
    queryFn: async () => {
      const t = getThresholds()
      // 1. 库位明细（inventory）
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
        .lte('quantity', t.warning)
        .order('quantity', { ascending: true })

      if (invErr) throw invErr
      const items = (invData || []) as unknown as LowStockItem[]

      // 2. 暂未入仓（products.unallocated_quantity）命中阈值的产品，作为虚拟项补进列表
      const { data: prodData, error: prodErr } = await supabase
        .from('products')
        .select('id, name, sku, barcode, image_path, unit, category, is_material_area, unallocated_quantity')
        .gt('unallocated_quantity', 0)
        .lte('unallocated_quantity', t.warning)

      if (prodErr) throw prodErr

      for (const p of (prodData || []) as any[]) {
        const qty = Number(p.unallocated_quantity) || 0
        if (qty <= 0) continue
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
        })
      }

      // 按数量升序（与原查询一致），数量相同则按库位名排序，暂未入仓放后面
      items.sort((a, b) => {
        if (a.quantity !== b.quantity) return a.quantity - b.quantity
        const aIs = a.location.id === 'unalloc' ? 1 : 0
        const bIs = b.location.id === 'unalloc' ? 1 : 0
        return aIs - bIs
      })

      return items
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
// 合并：inventory 命中 + products.unallocated_quantity 命中
export function useLowStockCountLight() {
  const t = getThresholds()
  return useQuery({
    queryKey: ['low-stock-count', t.warning],
    queryFn: async () => {
      const [
        { count: invCount, error: invErr },
        { count: prodCount, error: prodErr },
      ] = await Promise.all([
        supabase
          .from('inventory')
          .select('*', { count: 'exact', head: true })
          .gt('quantity', 0)
          .lte('quantity', t.warning),
        supabase
          .from('products')
          .select('*', { count: 'exact', head: true })
          .gt('unallocated_quantity', 0)
          .lte('unallocated_quantity', t.warning),
      ])
      if (invErr) throw invErr
      if (prodErr) throw prodErr
      return (invCount || 0) + (prodCount || 0)
    },
    staleTime: 1000 * 60 * 2,
  })
}
