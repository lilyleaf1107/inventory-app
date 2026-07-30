import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Search, ImagePlus, MapPin, AlertTriangle, Clock } from 'lucide-react'
import { supabase, getProductImageUrl } from '@/lib/supabase'
import { useOutOfStock } from '@/hooks/useOutOfStock'
import { getLowStockLevel, getLowStockLevelColor } from '@/hooks/useLowStock'
import { Input } from '@/components/ui/input'

interface InventoryItem {
  id: string
  quantity: number
  batch_no: string | null
  product: {
    id: string
    name: string
    sku: string
    barcode: string | null
    image_path: string | null
    unit: string
    min_stock: number
    is_material_area: boolean
  }
  location: {
    id: string
    code: string
    warehouse: { id: string; code: string; name: string | null }
  }
}

export default function MobileInventory() {
  const [search, setSearch] = useState('')

  const { data: inventory, isLoading } = useQuery({
    queryKey: ['inventory', search],
    queryFn: async () => {
      let query = supabase
        .from('inventory')
        .select(`
          id, quantity, batch_no,
          product:products ( id, name, sku, barcode, image_path, unit, min_stock, is_material_area ),
          location:locations ( id, code, warehouse:warehouses ( id, code, name ) )
        `)
        .order('quantity', { ascending: true })
        .order('updated_at', { ascending: false })

      if (search) {
        query = query.or(
          `product.name.ilike.%${search}%,product.sku.ilike.%${search}%,product.barcode.ilike.%${search}%`,
        )
      }

      const { data, error } = await query.limit(100)
      if (error) throw error
      return data as unknown as InventoryItem[]
    },
  })

  return (
    <div className="p-4 space-y-3">
      <div className="relative">
        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="搜索产品 / SKU / 条码"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-8"
        />
      </div>

      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground text-sm">加载中...</div>
      ) : inventory?.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground text-sm">暂无库存</div>
      ) : (
        <div className="space-y-2">
          {inventory?.map((item) => {
            const isOutOfStock = item.quantity === 0
            const isMaterial = item.product.is_material_area
            const lowStockLevel = getLowStockLevel(item.quantity, item.product.min_stock)
            const lowStockColor = getLowStockLevelColor(lowStockLevel)
            const hasLowStock = lowStockLevel !== 'normal' && !isOutOfStock
            let cardClass = 'bg-background border'
            if (isOutOfStock) cardClass = 'bg-red-50/60 border-red-200'
            else if (hasLowStock) cardClass = `${lowStockColor.border} ${lowStockColor.bg}`
            return (
              <div
                key={item.id}
                className={`flex items-center gap-3 p-3 rounded-lg border ${cardClass}`}
              >
                {item.product.image_path ? (
                  <img
                    src={getProductImageUrl(item.product.image_path)}
                    alt={item.product.name}
                    className="h-12 w-12 rounded-lg object-cover flex-shrink-0"
                  />
                ) : (
                  <div className="h-12 w-12 rounded-lg bg-muted flex items-center justify-center flex-shrink-0">
                    <ImagePlus className="h-5 w-5 text-muted-foreground/50" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm truncate flex items-center flex-wrap gap-1">
                    {item.product.name}
                    {isMaterial && (
                      <span className="px-1 py-0.5 rounded text-[10px] bg-blue-100 text-blue-700">
                        物料区
                      </span>
                    )}
                    {isOutOfStock && (
                      <span className="inline-flex items-center gap-0.5 px-1 py-0.5 rounded text-[10px] font-medium bg-red-100 text-red-700">
                        <AlertTriangle className="h-2.5 w-2.5" />
                        缺货
                      </span>
                    )}
                    {hasLowStock && (
                      <span className={`px-1 py-0.5 rounded text-[10px] font-medium border ${lowStockColor.border} ${lowStockColor.text} ${lowStockColor.bg}`}>
                        {lowStockColor.label}
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground flex items-center gap-1">
                    <MapPin className="h-3 w-3" />
                    {item.location.warehouse.name || item.location.warehouse.code} · {item.location.code}
                  </div>
                </div>
                <div className="text-right flex-shrink-0">
                  {isMaterial ? (
                    <div className="font-medium text-muted-foreground">***</div>
                  ) : (
                    <>
                      <div className={`font-bold ${isOutOfStock ? 'text-red-600' : ''}`}>{item.quantity}</div>
                      <div className="text-xs text-muted-foreground">{item.product.unit}</div>
                    </>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
