import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Search, ImagePlus, MapPin, Tag, X, AlertTriangle } from 'lucide-react'
import { supabase, getProductImageUrl } from '@/lib/supabase'
import type { Category as CategoryType, Tag as TagType } from '@/types'
import { useOutOfStock } from '@/hooks/useOutOfStock'
import { getLowStockLevel, getLowStockLevelColor } from '@/hooks/useLowStock'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Link } from 'react-router-dom'

const TAG_COLORS = [
  'bg-blue-100 text-blue-700',
  'bg-green-100 text-green-700',
  'bg-yellow-100 text-yellow-700',
  'bg-red-100 text-red-700',
  'bg-purple-100 text-purple-700',
  'bg-pink-100 text-pink-700',
  'bg-indigo-100 text-indigo-700',
  'bg-teal-100 text-teal-700',
  'bg-orange-100 text-orange-700',
  'bg-cyan-100 text-cyan-700',
]

function getTagColor(index: number) {
  return TAG_COLORS[index % TAG_COLORS.length]
}

interface InventoryItem {
  id: string
  quantity: number
  batch_no: string | null
  updated_at: string
  product: {
    id: string
    name: string
    sku: string
    barcode: string | null
    image_path: string | null
    unit: string
    category: string | null
    min_stock: number
    is_material_area: boolean
  }
  location: {
    id: string
    code: string
    description: string | null
    warehouse: {
      id: string
      name: string
      code: string
    }
  }
}

export default function InventoryPage() {
  const [search, setSearch] = useState('')
  const [warehouseFilter, setWarehouseFilter] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [selectedTagFilter, setSelectedTagFilter] = useState<string[]>([])

  const { data: warehouses } = useQuery({
    queryKey: ['warehouses'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('warehouses')
        .select('*')
        .order('name')
      if (error) throw error
      return data
    },
  })

  const { data: categories } = useQuery({
    queryKey: ['categories'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('categories')
        .select('*')
        .order('sort_order', { ascending: false })
        .order('created_at', { ascending: false })
      if (error) throw error
      return data as CategoryType[]
    },
  })

  const { data: tags } = useQuery({
    queryKey: ['tags'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tags')
        .select('*')
        .order('created_at', { ascending: false })
      if (error) throw error
      return data as TagType[]
    },
  })

  const { data: inventory, isLoading } = useQuery({
    queryKey: ['inventory', search, warehouseFilter, categoryFilter, selectedTagFilter],
    queryFn: async () => {
      // 先查询符合条件的产品 ID（PostgREST 不支持跨表深层嵌套过滤）
      let productIds: string[] | null = null
      if (search || categoryFilter || selectedTagFilter.length > 0) {
        let pQuery = supabase.from('products').select('id')
        if (search) {
          pQuery = pQuery.or(
            `name.ilike.%${search}%,sku.ilike.%${search}%,barcode.ilike.%${search}%`,
          )
        }
        if (categoryFilter) {
          pQuery = pQuery.eq('category', categoryFilter)
        }
        if (selectedTagFilter.length > 0) {
          pQuery = pQuery.filter('product_tags.tag_id', 'in', `(${selectedTagFilter.join(',')})`)
        }
        const { data: pData, error: pError } = await pQuery
        if (pError) throw pError
        productIds = (pData as { id: string }[]).map((r) => r.id)
        if (productIds.length === 0) {
          return [] as InventoryItem[]
        }
      }

      let query = supabase
        .from('inventory')
        .select(`
          id,
          quantity,
          batch_no,
          updated_at,
          product:products ( id, name, sku, barcode, image_path, unit, category, min_stock, is_material_area ),
          location:locations (
            id,
            code,
            description,
            warehouse:warehouses ( id, name, code )
          )
        `)
        .order('quantity', { ascending: true })
        .order('updated_at', { ascending: false })

      if (productIds && productIds.length > 0) {
        query = query.in('product_id', productIds)
      }

      const { data, error } = await query.limit(500)
      if (error) throw error

      let result = data as unknown as InventoryItem[]

      if (warehouseFilter) {
        result = result.filter((i) => i.location.warehouse.id === warehouseFilter)
      }

      return result
    },
  })

  const totalQty = inventory?.reduce((sum, item) => sum + Number(item.quantity), 0) || 0
  const totalSku = inventory?.length || 0

  const toggleTagFilter = (tagId: string) => {
    setSelectedTagFilter((prev) =>
      prev.includes(tagId) ? prev.filter((id) => id !== tagId) : [...prev, tagId],
    )
  }

  const clearTagFilter = () => {
    setSelectedTagFilter([])
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">库存查询</h2>
          <p className="text-sm text-muted-foreground">查看所有产品库存及分布</p>
        </div>
      </div>

      {/* 统计卡片 */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              库存 SKU 数
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalSku}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              库存总数量
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {totalQty.toLocaleString()}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              仓库数
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{warehouses?.length || 0}</div>
          </CardContent>
        </Card>
      </div>

      {/* 筛选 */}
      <div className="space-y-3">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative flex-1 min-w-[200px] max-w-md">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="搜索产品名称 / SKU / 条形码"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8"
            />
          </div>
          <div className="w-48">
            <select
              value={warehouseFilter}
              onChange={(e) => setWarehouseFilter(e.target.value)}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              <option value="">全部仓库</option>
              {warehouses?.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
          </div>
          <div className="w-40">
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              <option value="">全部分类</option>
              {categories?.map((c) => (
                <option key={c.id} value={c.name}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1 text-sm text-muted-foreground">
            <Tag className="h-3.5 w-3.5" />
            标签筛选：
          </div>
          {tags?.map((tag, index) => (
            <button
              key={tag.id}
              onClick={() => toggleTagFilter(tag.id)}
              className={`px-2 py-0.5 rounded-full text-xs font-medium transition-colors ${
                selectedTagFilter.includes(tag.id)
                  ? 'ring-2 ring-offset-1 ring-primary'
                  : ''
              } ${getTagColor(index)}`}
            >
              {tag.name}
            </button>
          ))}
          {selectedTagFilter.length > 0 && (
            <Button variant="ghost" size="sm" onClick={clearTagFilter} className="h-6 px-2 text-xs">
              <X className="h-3 w-3 mr-1" />
              清除
            </Button>
          )}
        </div>
      </div>

      {/* 库存列表 */}
      <div className="rounded-md border bg-background">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-16">图片</TableHead>
              <TableHead>产品</TableHead>
              <TableHead>SKU / 条码</TableHead>
              <TableHead>仓库 / 库位</TableHead>
              <TableHead>数量</TableHead>
              <TableHead>批次</TableHead>
              <TableHead>更新时间</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                  加载中...
                </TableCell>
              </TableRow>
            ) : inventory?.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                  暂无库存数据
                </TableCell>
              </TableRow>
            ) : (
              inventory?.map((item) => {
                const isOutOfStock = item.quantity === 0
                const isMaterial = item.product.is_material_area
                const lowStockLevel = getLowStockLevel(item.quantity)
                const lowStockColor = getLowStockLevelColor(lowStockLevel)
                const hasLowStock = lowStockLevel !== 'normal' && !isOutOfStock
                let rowClass = ''
                if (isOutOfStock) rowClass = 'bg-red-50/60'
                else if (hasLowStock) rowClass = lowStockColor.bg

                return (
                  <TableRow key={item.id} className={rowClass}>
                    <TableCell>
                      {item.product.image_path ? (
                        <img
                          src={getProductImageUrl(item.product.image_path)}
                          alt={item.product.name}
                          className="h-10 w-10 rounded object-cover"
                        />
                      ) : (
                        <div className="h-10 w-10 rounded bg-muted flex items-center justify-center">
                          <ImagePlus className="h-5 w-5 text-muted-foreground/50" />
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="font-medium">
                      <div className="flex items-center flex-wrap gap-1.5">
                        {item.product.name}
                        {isMaterial && (
                          <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-blue-100 text-blue-700">
                            物料区
                          </span>
                        )}
                        {isOutOfStock && (
                          <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-red-100 text-red-700">
                            <AlertTriangle className="h-2.5 w-2.5" />
                            缺货
                          </span>
                        )}
                        {hasLowStock && (
                          <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-medium border ${lowStockColor.border} ${lowStockColor.text} ${lowStockColor.bg}`}>
                            {lowStockColor.label}
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {item.product.category || ''}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="font-mono text-xs">{item.product.sku || '-'}</div>
                      <div className="font-mono text-xs text-muted-foreground">
                        {item.product.barcode || '-'}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1 text-sm">
                        <MapPin className="h-3 w-3 text-muted-foreground" />
                        {item.location.warehouse.name || item.location.warehouse.code}
                      </div>
                      <div className="font-mono text-xs text-muted-foreground">
                        {item.location.code}
                        {item.location.description && ` · ${item.location.description}`}
                      </div>
                    </TableCell>
                    <TableCell>
                      {isMaterial ? (
                        <span className="font-medium text-muted-foreground">***</span>
                      ) : (
                        <>
                          <span className={`font-bold ${isOutOfStock ? 'text-red-600' : ''}`}>
                            {Number(item.quantity).toLocaleString()}
                          </span>
                          <span className="text-xs text-muted-foreground ml-1">
                            {item.product.unit}
                          </span>
                        </>
                      )}
                    </TableCell>
                    <TableCell className="text-sm">
                      {item.batch_no || '-'}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {new Date(item.updated_at).toLocaleString('zh-CN')}
                    </TableCell>
                  </TableRow>
                )
              })
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
