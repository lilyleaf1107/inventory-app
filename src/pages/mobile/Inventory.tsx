import { useState, useMemo, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Search,
  ImagePlus,
  MapPin,
  AlertTriangle,
  Package,
  Boxes,
  X,
  ChevronDown,
  Filter,
  ArrowUp,
} from 'lucide-react'
import { supabase, getProductImageUrl } from '@/lib/supabase'
import { useOutOfStock } from '@/hooks/useOutOfStock'
import { getLowStockLevel, getLowStockLevelColor } from '@/hooks/useLowStock'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import type { Warehouse as WarehouseType, Category } from '@/types'

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
    category: string | null
  }
  location: {
    id: string
    code: string
    warehouse: { id: string; code: string; name: string | null }
  }
}

export default function MobileInventory() {
  const [search, setSearch] = useState('')
  const [warehouseId, setWarehouseId] = useState<string>('')
  const [categoryId, setCategoryId] = useState<string>('')
  const [showFilters, setShowFilters] = useState(false)

  // 仓库
  const { data: warehouses } = useQuery({
    queryKey: ['warehouses'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('warehouses')
        .select('*')
        .order('sort_order', { ascending: true })
        .order('name')
      if (error) throw error
      return data as WarehouseType[]
    },
  })

  // 分类
  const { data: categories } = useQuery({
    queryKey: ['categories'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('categories')
        .select('*')
        .order('sort_order', { ascending: true })
        .order('name')
      if (error) throw error
      return data as Category[]
    },
  })

  // 库存
  const { data: inventory, isLoading } = useQuery({
    queryKey: ['inventory', search, warehouseId, categoryId],
    queryFn: async () => {
      // 产品过滤（分类/关键词）
      let productIds: string[] | null = null
      const needProductFilter = search || categoryId
      if (needProductFilter) {
        let pb = supabase.from('products').select('id')
        if (search) {
          pb = pb.or(
            `name.ilike.%${search}%,sku.ilike.%${search}%,barcode.ilike.%${search}%`,
          )
        }
        if (categoryId) {
          pb = pb.eq('category', categoryId)
        }
        const { data: pData, error: pError } = await pb
        if (pError) throw pError
        productIds = (pData as { id: string }[]).map((r) => r.id)
        if (productIds.length === 0) return [] as InventoryItem[]
      }

      // 库位过滤仓库
      let locationIds: string[] | null = null
      if (warehouseId) {
        const { data: lData, error: lError } = await supabase
          .from('locations')
          .select('id')
          .eq('warehouse_id', warehouseId)
        if (lError) throw lError
        locationIds = (lData as { id: string }[]).map((r) => r.id)
        if (locationIds.length === 0) return [] as InventoryItem[]
      }

      let query = supabase
        .from('inventory')
        .select(
          `
          id, quantity, batch_no,
          product:products ( id, name, sku, barcode, image_path, unit, min_stock, is_material_area, category ),
          location:locations ( id, code, warehouse:warehouses ( id, code, name ) )
        `,
        )
        .order('updated_at', { ascending: false })

      if (productIds && productIds.length > 0) query = query.in('product_id', productIds)
      if (locationIds && locationIds.length > 0) query = query.in('location_id', locationIds)

      const { data, error } = await query.limit(500)
      if (error) throw error

      // 按库位排列：仓库 → 库位编码
      const sorted = (data as unknown as InventoryItem[]).slice().sort((a, b) => {
        const wA = (a.location.warehouse?.name || a.location.warehouse?.code || '').toString()
        const wB = (b.location.warehouse?.name || b.location.warehouse?.code || '').toString()
        if (wA !== wB) return wA.localeCompare(wB, 'zh-CN')
        return (a.location.code || '').localeCompare(b.location.code || '')
      })
      return sorted
    },
  })

  // 缺货
  const { data: outOfStockItems } = useOutOfStock()

  // 统计
  const stats = useMemo(() => {
    if (!inventory) return null
    const totalQty = inventory.reduce((s, i) => s + Number(i.quantity), 0)
    const skuCount = new Set(inventory.map((i) => i.product.id)).size
    const lowCount = inventory.filter(
      (i) => getLowStockLevel(i.quantity) !== 'normal' && i.quantity > 0,
    ).length
    const outCount = inventory.filter((i) => i.quantity === 0).length
    return { totalQty, skuCount, lowCount, outCount }
  }, [inventory])

  const filterActive = !!warehouseId || !!categoryId

  const [showTop, setShowTop] = useState(false)
  useEffect(() => {
    const onScroll = () => setShowTop(window.scrollY > 300)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <div className="p-4 space-y-3 pb-2">
      {showTop && (
        <button
          onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          className="fixed bottom-6 right-4 z-30 h-11 w-11 rounded-full bg-primary text-primary-foreground shadow-lg flex items-center justify-center"
          aria-label="返回顶部"
        >
          <ArrowUp className="h-5 w-5" />
        </button>
      )}
      {/* 顶部搜索 */}
      <div className="space-y-2">
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="搜索产品 / SKU / 条码"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 pr-16"
          />
          <button
            type="button"
            onClick={() => setShowFilters((s) => !s)}
            className={`absolute right-2 top-1/2 -translate-y-1/2 h-8 px-2 inline-flex items-center gap-1 rounded-md border text-xs ${
              filterActive
                ? 'bg-primary text-primary-foreground border-primary'
                : 'border-input bg-background'
            }`}
          >
            <Filter className="h-3.5 w-3.5" />
            筛选
            <ChevronDown
              className={`h-3 w-3 transition-transform ${showFilters ? 'rotate-180' : ''}`}
            />
          </button>
        </div>

        {/* 筛选下拉 */}
        {showFilters && (
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground px-0.5">仓库</label>
              <select
                value={warehouseId}
                onChange={(e) => setWarehouseId(e.target.value)}
                className="w-full h-9 rounded-md border border-input bg-background px-2 text-sm"
              >
                <option value="">全部仓库</option>
                {warehouses?.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name || w.code}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground px-0.5">分类</label>
              <select
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                className="w-full h-9 rounded-md border border-input bg-background px-2 text-sm"
              >
                <option value="">全部分类</option>
                {categories?.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            {(warehouseId || categoryId) && (
              <button
                type="button"
                onClick={() => {
                  setWarehouseId('')
                  setCategoryId('')
                }}
                className="col-span-2 h-8 text-xs text-muted-foreground underline underline-offset-2"
              >
                清除筛选条件
              </button>
            )}
          </div>
        )}
      </div>

      {/* 统计卡片 */}
      {stats && (
        <div className="grid grid-cols-4 gap-2">
          <Card className="overflow-hidden">
            <CardContent className="p-2 text-center">
              <div className="flex items-center justify-center text-primary mb-1">
                <Package className="h-3.5 w-3.5" />
              </div>
              <div className="font-bold text-base leading-none text-primary">
                {stats.skuCount}
              </div>
              <div className="text-[10px] text-muted-foreground mt-1">SKU</div>
            </CardContent>
          </Card>
          <Card className="overflow-hidden">
            <CardContent className="p-2 text-center">
              <div className="flex items-center justify-center text-emerald-600 mb-1">
                <Boxes className="h-3.5 w-3.5" />
              </div>
              <div className="font-bold text-base leading-none text-emerald-600">
                {stats.totalQty.toLocaleString()}
              </div>
              <div className="text-[10px] text-muted-foreground mt-1">总件数</div>
            </CardContent>
          </Card>
          <Card className="overflow-hidden">
            <CardContent className="p-2 text-center">
              <div className="flex items-center justify-center text-amber-600 mb-1">
                <AlertTriangle className="h-3.5 w-3.5" />
              </div>
              <div className="font-bold text-base leading-none text-amber-600">
                {stats.lowCount}
              </div>
              <div className="text-[10px] text-muted-foreground mt-1">低库存</div>
            </CardContent>
          </Card>
          <Card className="overflow-hidden">
            <CardContent className="p-2 text-center">
              <div className="flex items-center justify-center text-red-600 mb-1">
                <X className="h-3.5 w-3.5" />
              </div>
              <div className="font-bold text-base leading-none text-red-600">
                {stats.outCount || outOfStockItems?.length || 0}
              </div>
              <div className="text-[10px] text-muted-foreground mt-1">缺货</div>
            </CardContent>
          </Card>
        </div>
      )}

      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground text-sm">加载中...</div>
      ) : inventory?.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground text-sm">暂无库存</div>
      ) : (
        <div className="space-y-2">
          {inventory?.map((item) => {
            const isOutOfStock = item.quantity === 0
            const isMaterial = item.product.is_material_area
            const lowStockLevel = getLowStockLevel(item.quantity)
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
                      <span
                        className={`px-1 py-0.5 rounded text-[10px] font-medium border ${lowStockColor.border} ${lowStockColor.text} ${lowStockColor.bg}`}
                      >
                        {lowStockColor.label}
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                    <MapPin className="h-3 w-3" />
                    {item.location.warehouse?.name || item.location.warehouse?.code || ''} ·{' '}
                    {item.location.code}
                  </div>
                  {item.product.sku && (
                    <div className="text-[10px] text-muted-foreground mt-0.5">
                      SKU: {item.product.sku}
                    </div>
                  )}
                </div>
                <div className="text-right flex-shrink-0">
                  {isMaterial ? (
                    <div className="font-medium text-muted-foreground">***</div>
                  ) : (
                    <>
                      <div className={`font-bold ${isOutOfStock ? 'text-red-600' : ''}`}>
                        {item.quantity}
                      </div>
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
