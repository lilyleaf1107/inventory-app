import { useState, useMemo, useDeferredValue, useEffect, useLayoutEffect, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Plus, Search, Edit2, Trash2, ImagePlus, X, Tag, MapPin, Package, ArrowUp } from 'lucide-react'
import { supabase, getProductImageUrl, uploadProductImage, deleteProductImage } from '@/lib/supabase'
import type { Product, Category as CategoryType, Tag as TagType } from '@/types'
import { useAuthStore } from '@/store/auth'
import { getLowStockLevel, getLowStockLevelColor } from '@/hooks/useLowStock'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { LocationPicker } from '@/components/LocationPicker'
import {
  Table,
  TableBody,
  TableCell,
  TableRow,
} from '@/components/ui/table'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

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

interface ProductForm {
  sku: string
  name: string
  barcode: string
  category: string
  spec: string
  unit: string
  cost: string
  description: string
  imageFile: File | null
  imagePreview: string | null
  selectedTagIds: string[]
  newTagName: string
}

const emptyForm: ProductForm = {
  sku: '',
  name: '',
  barcode: '',
  category: '',
  spec: '',
  unit: '个',
  cost: '',
  description: '',
  imageFile: null,
  imagePreview: null,
  selectedTagIds: [],
  newTagName: '',
}

function getTagColor(index: number) {
  return TAG_COLORS[index % TAG_COLORS.length]
}

interface ProductWithTags extends Product {
  tags?: { tag_id: string; tags: { id: string; name: string; color: string | null } }[]
}

export default function ProductsPage() {
  const queryClient = useQueryClient()
  const [searchParams, setSearchParams] = useSearchParams()
  const { canWrite, canViewCost } = useAuthStore()
  const [search, setSearch] = useState('')
  const deferredSearch = useDeferredValue(search)
  const [categoryFilter, setCategoryFilter] = useState('')
  const [selectedTagFilter, setSelectedTagFilter] = useState<string[]>([])
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<Product | null>(null)
  const [form, setForm] = useState<ProductForm>(emptyForm)
  const [submitting, setSubmitting] = useState(false)
  const [editingProductId, setEditingProductId] = useState<string | null>(null)
  const [newLocId, setNewLocId] = useState('')
  const [newLocQty, setNewLocQty] = useState('')
  // 新增产品时的初始库位
  const [createLocId, setCreateLocId] = useState('')
  const [createLocQty, setCreateLocQty] = useState('')
  // 新增产品时的暂未入仓数量（无库位）
  const [createUnallocQty, setCreateUnallocQty] = useState('')
  // 列表内联库位编辑
  const [inlineLocProductId, setInlineLocProductId] = useState<string | null>(null)
  const [inlineLocId, setInlineLocId] = useState('')
  const [inlineLocQty, setInlineLocQty] = useState('')
  // 暂未入仓数量内联编辑
  const [editUnallocProductId, setEditUnallocProductId] = useState<string | null>(null)
  const [editUnallocQty, setEditUnallocQty] = useState('')

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

  // 每个产品的总库存汇总（按产品 id 聚合）
  //  总库存 = inventory 聚合数量 + unallocated_quantity（暂未入仓部分）
  const { data: productQtyMap } = useQuery({
    queryKey: ['products-qty-map'],
    queryFn: async () => {
      const [{ data: invData, error: invErr }, { data: prodData, error: prodErr }] = await Promise.all([
        supabase.from('inventory').select('product_id, quantity'),
        supabase.from('products').select('id, unallocated_quantity'),
      ])
      if (invErr) throw invErr
      if (prodErr) throw prodErr
      const map = new Map<string, number>()
      for (const row of invData || []) {
        const qty = Number((row as any).quantity) || 0
        const pid = (row as any).product_id as string
        map.set(pid, (map.get(pid) || 0) + qty)
      }
      for (const row of prodData || []) {
        const qty = Number((row as any).unallocated_quantity) || 0
        const pid = (row as any).id as string
        if (qty > 0) map.set(pid, (map.get(pid) || 0) + qty)
      }
      return map
    },
    staleTime: 30 * 1000,
  })

  // 每个产品的库位明细（按产品 id 聚合，显示每个库位 + 暂未入仓）
  const { data: productLocationsMap } = useQuery({
    queryKey: ['products-locations-map'],
    queryFn: async () => {
      const [{ data: invData, error: invErr }, { data: prodData, error: prodErr }] = await Promise.all([
        supabase.from('inventory').select(`
          product_id, quantity,
          location:locations ( id, code, warehouse:warehouses ( code, name ) )
        `),
        supabase.from('products').select('id, unallocated_quantity').gt('unallocated_quantity', 0),
      ])
      if (invErr) throw invErr
      if (prodErr) throw prodErr
      const map = new Map<string, { id: string; code: string; warehouseName: string | null; quantity: number; isUnallocated?: boolean }[]>()
      for (const row of (invData || []) as any[]) {
        const pid = row.product_id as string
        const loc = row.location
        if (!loc) continue
        const list = map.get(pid) || []
        list.push({
          id: loc.id,
          code: loc.code,
          warehouseName: loc.warehouse?.name || loc.warehouse?.code || null,
          quantity: Number(row.quantity) || 0,
        })
        map.set(pid, list)
      }
      // 暂未入仓挂在库位列表最后，id 用 "unalloc"（仅前端渲染用，无真实库位）
      for (const row of (prodData || []) as any[]) {
        const qty = Number(row.unallocated_quantity) || 0
        if (qty <= 0) continue
        const pid = row.id as string
        const list = map.get(pid) || []
        list.push({
          id: 'unalloc',
          code: '暂未入仓',
          warehouseName: null,
          quantity: qty,
          isUnallocated: true,
        })
        map.set(pid, list)
      }
      return map
    },
    staleTime: 30 * 1000,
  })

  // 编辑时加载该产品的库存明细
  const { data: productInventory } = useQuery({
    queryKey: ['product-inventory-edit', editingProductId],
    enabled: !!editingProductId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('inventory')
        .select(`
          id, quantity,
          location:locations ( id, code, zone, rack, level, position, warehouse:warehouses ( id, name, code ) )
        `)
        .eq('product_id', editingProductId)
        .order('updated_at', { ascending: false })
      if (error) throw error
      return data as any[]
    },
  })

  // 所有库位（列表内联编辑 + 编辑弹窗共用，长缓存）
  const { data: allLocations } = useQuery({
    queryKey: ['all-locations-for-select'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('locations')
        .select(`
          id, code, zone, rack, level, position,
          warehouse:warehouses ( id, name, code )
        `)
        .order('code')
      if (error) throw error
      return data as any[]
    },
    staleTime: 5 * 60 * 1000,
  })

  const { data: products, isLoading } = useQuery({
    queryKey: ['products', deferredSearch, categoryFilter, selectedTagFilter],
    queryFn: async () => {
      let query = supabase
        .from('products')
        .select(`
          *,
          tags:product_tags ( tag_id, tags ( id, name, color ) )
        `)
        .order('created_at', { ascending: false })
      if (deferredSearch) {
        query = query.or(
          `name.ilike.%${deferredSearch}%,sku.ilike.%${deferredSearch}%,barcode.ilike.%${deferredSearch}%,category.ilike.%${deferredSearch}%`,
        )
      }
      if (categoryFilter) {
        query = query.eq('category', categoryFilter)
      }
      if (selectedTagFilter.length > 0) {
        query = query.filter('product_tags.tag_id', 'in', `(${selectedTagFilter.join(',')})`)
      }
      const { data, error } = await query
      if (error) throw error
      return data as ProductWithTags[]
    },
  })

  // 修改/清零暂未入仓数量
  const updateUnalloc = useMutation({
    mutationFn: async ({ productId, qty }: { productId: string; qty: number }) => {
      const { error } = await supabase
        .from('products')
        .update({ unallocated_quantity: qty })
        .eq('id', productId)
      if (error) throw error
    },
    onSuccess: () => {
      toast.success('暂未入仓数量已更新')
      queryClient.invalidateQueries({ queryKey: ['products-qty-map'] })
      queryClient.invalidateQueries({ queryKey: ['products-locations-map'] })
      queryClient.invalidateQueries({ queryKey: ['products'] })
      setEditUnallocProductId(null)
      setEditUnallocQty('')
    },
    onError: (err: any) => toast.error(err.message || '更新失败'),
  })

  const createMutation = useMutation({
    mutationFn: async (args: { form: ProductForm; unallocatedQty: number }) => {
      const { form: data, unallocatedQty } = args
      let imagePath = null
      if (data.imageFile) {
        imagePath = await uploadProductImage(data.imageFile)
      }
      const { data: product, error } = await supabase
        .from('products')
        .insert({
          sku: data.sku || null,
          name: data.name,
          barcode: data.barcode || null,
          category: data.category || null,
          spec: data.spec || null,
          unit: data.unit,
          cost: data.cost ? Number(data.cost) : null,
          image_path: imagePath,
          description: data.description || null,
          on_shelf: true,
          unallocated_quantity: unallocatedQty > 0 ? unallocatedQty : 0,
        })
        .select()
        .single()
      if (error) {
        if (imagePath) await deleteProductImage(imagePath)
        throw error
      }

      if (data.selectedTagIds.length > 0) {
        const { error: tagError } = await supabase
          .from('product_tags')
          .insert(
            data.selectedTagIds.map((tagId) => ({
              product_id: product.id,
              tag_id: tagId,
            })),
          )
        if (tagError) throw tagError
      }
      return product
    },
    onSuccess: () => {
      toast.success('产品创建成功')
      queryClient.invalidateQueries({ queryKey: ['products'] })
      queryClient.invalidateQueries({ queryKey: ['products-qty-map'] })
      queryClient.invalidateQueries({ queryKey: ['products-locations-map'] })
      setDialogOpen(false)
      setEditingProductId(null)
      setCreateLocId('')
      setCreateLocQty('')
      setCreateUnallocQty('')
      setForm(emptyForm)
    },
    onError: (err: any) => toast.error(err.message || '创建失败'),
  })

  const updateMutation = useMutation({
    mutationFn: async (data: { id: string; form: ProductForm; oldImagePath: string | null }) => {
      let imagePath = data.oldImagePath
      if (data.form.imageFile) {
        imagePath = await uploadProductImage(data.form.imageFile)
        if (data.oldImagePath) {
          await deleteProductImage(data.oldImagePath)
        }
      }
      const { error } = await supabase
        .from('products')
        .update({
          sku: data.form.sku || null,
          name: data.form.name,
          barcode: data.form.barcode || null,
          category: data.form.category || null,
          spec: data.form.spec || null,
          unit: data.form.unit,
          cost: data.form.cost ? Number(data.form.cost) : null,
          image_path: imagePath,
          description: data.form.description || null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', data.id)
      if (error) throw error

      const { error: deleteTagError } = await supabase
        .from('product_tags')
        .delete()
        .eq('product_id', data.id)
      if (deleteTagError) throw deleteTagError

      if (data.form.selectedTagIds.length > 0) {
        const { error: insertTagError } = await supabase
          .from('product_tags')
          .insert(
            data.form.selectedTagIds.map((tagId) => ({
              product_id: data.id,
              tag_id: tagId,
            })),
          )
        if (insertTagError) throw insertTagError
      }
    },
    onMutate: async (data) => {
      const key = ['products', deferredSearch, categoryFilter, selectedTagFilter] as const
      await queryClient.cancelQueries({ queryKey: key })
      const prev = queryClient.getQueryData<ProductWithTags[]>(key)
      queryClient.setQueryData(key, (old: ProductWithTags[] | undefined) => {
        if (!old) return old
        return old.map((p) =>
          p.id === data.id
            ? {
                ...p,
                sku: data.form.sku || null,
                name: data.form.name,
                barcode: data.form.barcode || null,
                category: data.form.category || null,
                spec: data.form.spec || null,
                unit: data.form.unit,
                cost: data.form.cost ? Number(data.form.cost) : null,
                description: data.form.description || null,
              }
            : p,
        )
      })
      return { prev, key }
    },
    onSuccess: () => {
      toast.success('产品更新成功')
      // 不再全量 invalidate products，乐观更新已同步缓存
      setDialogOpen(false)
      setEditing(null)
      setEditingProductId(null)
      setForm(emptyForm)
    },
    onError: (err: any, _vars, ctx: any) => {
      if (ctx) queryClient.setQueryData(ctx.key, ctx.prev)
      toast.error(err.message || '更新失败')
    },
  })

  const toggleShelfMutation = useMutation({
    mutationFn: async ({ id, value }: { id: string; value: boolean }) => {
      const { error } = await supabase
        .from('products')
        .update({ on_shelf: value, updated_at: new Date().toISOString() })
        .eq('id', id)
      if (error) throw error
    },
    onMutate: async ({ id, value }) => {
      await queryClient.cancelQueries({ queryKey: ['products'] })
      const previousData = queryClient.getQueryData(['products', deferredSearch, categoryFilter, selectedTagFilter])
      queryClient.setQueryData(
        ['products', deferredSearch, categoryFilter, selectedTagFilter],
        (old: ProductWithTags[] | undefined) => {
          if (!old) return old
          return old.map((p) => (p.id === id ? { ...p, on_shelf: value } : p))
        },
      )
      return { previousData }
    },
    onError: (_err: any, _vars, context: any) => {
      if (context?.previousData) {
        queryClient.setQueryData(
          ['products', deferredSearch, categoryFilter, selectedTagFilter],
          context.previousData,
        )
      }
      toast.error('状态更新失败')
    },
  })

  const deleteMutation = useMutation({
    mutationFn: async (product: Product) => {
      // 按外键依赖顺序清理：stock_moves → inventory → product_tags → products
      const { error: movesErr } = await supabase
        .from('stock_moves')
        .delete()
        .eq('product_id', product.id)
      if (movesErr) throw movesErr

      const { error: invErr } = await supabase
        .from('inventory')
        .delete()
        .eq('product_id', product.id)
      if (invErr) throw invErr

      const { error: ptErr } = await supabase
        .from('product_tags')
        .delete()
        .eq('product_id', product.id)
      if (ptErr) throw ptErr

      if (product.image_path) {
        await deleteProductImage(product.image_path)
      }

      const { error } = await supabase.from('products').delete().eq('id', product.id)
      if (error) throw error
    },
    onSuccess: () => {
      toast.success('产品删除成功')
      queryClient.invalidateQueries({ queryKey: ['products'] })
      queryClient.invalidateQueries({ queryKey: ['products-qty-map'] })
      queryClient.invalidateQueries({ queryKey: ['products-locations-map'] })
    },
    onError: (err: any) => toast.error(err.message || '删除失败'),
  })

  const createTagMutation = useMutation({
    mutationFn: async (name: string) => {
      const { data, error } = await supabase
        .from('tags')
        .insert({ name })
        .select()
        .single()
      if (error) throw error
      return data as TagType
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tags'] })
    },
    onError: (err: any) => toast.error(err.message || '创建标签失败'),
  })

  // 更新库存数量 - 乐观更新
  const updateInvQty = useMutation({
    mutationFn: async ({ id, quantity }: { id: string; quantity: number }) => {
      const { error } = await supabase
        .from('inventory')
        .update({ quantity, updated_at: new Date().toISOString() })
        .eq('id', id)
      if (error) throw error
    },
    onMutate: async ({ id, quantity }) => {
      const invKey = ['product-inventory-edit', editingProductId] as const
      await queryClient.cancelQueries({ queryKey: invKey })
      const prevInv = queryClient.getQueryData<any[]>(invKey)
      queryClient.setQueryData(invKey, (old: any[] | undefined) =>
        old?.map((inv) => (inv.id === id ? { ...inv, quantity } : inv)),
      )
      // 乐观更新 products-qty-map：找到对应产品，调整差值
      const qtyKey = ['products-qty-map'] as const
      const prevQty = queryClient.getQueryData<Map<string, number>>(qtyKey)
      if (prevInv && prevQty && editingProductId) {
        const oldItem = prevInv.find((i) => i.id === id)
        if (oldItem) {
          const diff = quantity - Number(oldItem.quantity || 0)
          const next = new Map(prevQty)
          next.set(editingProductId, (next.get(editingProductId) || 0) + diff)
          queryClient.setQueryData(qtyKey, next)
        }
      }
      // 乐观更新 products-locations-map
      const locKey = ['products-locations-map'] as const
      const prevLoc = queryClient.getQueryData<Map<string, any[]>>(locKey)
      if (prevInv && prevLoc && editingProductId) {
        const oldItem = prevInv.find((i: any) => i.id === id)
        if (oldItem?.location) {
          const list = prevLoc.get(editingProductId) || []
          const next = list.map((l: any) =>
            l.code === oldItem.location.code ? { ...l, quantity } : l,
          )
          const newMap = new Map(prevLoc)
          newMap.set(editingProductId, next)
          queryClient.setQueryData(locKey, newMap)
        }
      }
      return { prevInv, prevQty, prevLoc, invKey, qtyKey, locKey, pid: editingProductId }
    },
    onError: (err: any, _vars, ctx: any) => {
      if (ctx) {
        if (ctx.prevInv !== undefined) queryClient.setQueryData(ctx.invKey, ctx.prevInv)
        if (ctx.prevQty !== undefined) queryClient.setQueryData(ctx.qtyKey, ctx.prevQty)
        if (ctx.prevLoc !== undefined) queryClient.setQueryData(ctx.locKey, ctx.prevLoc)
      }
      toast.error(err.message || '更新数量失败')
    },
    onSuccess: () => {
      // 仅精确失效当前编辑的库存明细，其余已通过乐观更新保持一致
      queryClient.invalidateQueries({ queryKey: ['product-inventory-edit', editingProductId], refetchType: 'none' })
    },
  })

  // 删除某库位的库存 - 乐观更新
  const deleteInv = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('inventory').delete().eq('id', id)
      if (error) throw error
    },
    onMutate: async (id: string) => {
      const invKey = ['product-inventory-edit', editingProductId] as const
      await queryClient.cancelQueries({ queryKey: invKey })
      const prevInv = queryClient.getQueryData<any[]>(invKey)
      const deleted = prevInv?.find((i) => i.id === id)
      queryClient.setQueryData(invKey, (old: any[] | undefined) =>
        old?.filter((inv) => inv.id !== id),
      )
      // 乐观更新 products-qty-map：减去该记录的数量
      const qtyKey = ['products-qty-map'] as const
      const prevQty = queryClient.getQueryData<Map<string, number>>(qtyKey)
      if (deleted && prevQty && editingProductId) {
        const q = Number(deleted.quantity || 0)
        const next = new Map(prevQty)
        next.set(editingProductId, Math.max(0, (next.get(editingProductId) || 0) - q))
        queryClient.setQueryData(qtyKey, next)
      }
      // 乐观更新 products-locations-map
      const locKey = ['products-locations-map'] as const
      const prevLoc = queryClient.getQueryData<Map<string, any[]>>(locKey)
      if (deleted?.location && prevLoc && editingProductId) {
        const list = prevLoc.get(editingProductId) || []
        const next = list.filter((l: any) => l.code !== deleted.location.code)
        const newMap = new Map(prevLoc)
        newMap.set(editingProductId, next)
        queryClient.setQueryData(locKey, newMap)
      }
      return { prevInv, prevQty, prevLoc, invKey, qtyKey, locKey }
    },
    onSuccess: () => {
      toast.success('已移除')
      queryClient.invalidateQueries({ queryKey: ['product-inventory-edit', editingProductId], refetchType: 'none' })
    },
    onError: (err: any, _vars, ctx: any) => {
      if (ctx) {
        if (ctx.prevInv !== undefined) queryClient.setQueryData(ctx.invKey, ctx.prevInv)
        if (ctx.prevQty !== undefined) queryClient.setQueryData(ctx.qtyKey, ctx.prevQty)
        if (ctx.prevLoc !== undefined) queryClient.setQueryData(ctx.locKey, ctx.prevLoc)
      }
      toast.error(err.message || '移除失败')
    },
  })

  // 添加新库位库存 - 乐观更新（支持列表内联和编辑弹窗两种场景）
  const addInv = useMutation({
    mutationFn: async ({ productId, locationId, quantity }: { productId: string; locationId: string; quantity: number }) => {
      const { data, error } = await supabase
        .from('inventory')
        .insert({
          product_id: productId,
          location_id: locationId,
          quantity,
        })
        .select(`
          id, quantity,
          location:locations ( id, code, zone, rack, level, position, warehouse:warehouses ( id, name, code ) )
        `)
        .single()
      if (error) throw error
      return data
    },
    onMutate: async ({ productId, locationId, quantity }) => {
      const invKey = ['product-inventory-edit', productId] as const
      const locsKey = ['all-locations-for-select'] as const
      await queryClient.cancelQueries({ queryKey: invKey })
      const prevInv = queryClient.getQueryData<any[]>(invKey)
      const prevLocs = queryClient.getQueryData<any[]>(locsKey)
      const selLoc = prevLocs?.find((l) => l.id === locationId)
      // 构造一个临时的乐观 inventory 项（id 暂时用 temp-xxx）
      if (selLoc && prevInv) {
        const tempItem: any = {
          id: `temp-${Date.now()}`,
          quantity,
          location: selLoc,
        }
        queryClient.setQueryData(invKey, [tempItem, ...prevInv])
      }
      // 乐观更新 products-qty-map
      const qtyKey = ['products-qty-map'] as const
      const prevQty = queryClient.getQueryData<Map<string, number>>(qtyKey)
      if (prevQty && productId) {
        const next = new Map(prevQty)
        next.set(productId, (next.get(productId) || 0) + Number(quantity || 0))
        queryClient.setQueryData(qtyKey, next)
      }
      // 乐观更新 products-locations-map
      const locMapKey = ['products-locations-map'] as const
      const prevLoc = queryClient.getQueryData<Map<string, any[]>>(locMapKey)
      if (selLoc && prevLoc && productId) {
        const list = prevLoc.get(productId) || []
        const next = [
          ...list,
          {
            code: selLoc.code,
            warehouseName: selLoc.warehouse?.name || selLoc.warehouse?.code || null,
            quantity: Number(quantity) || 0,
          },
        ]
        const newMap = new Map(prevLoc)
        newMap.set(productId, next)
        queryClient.setQueryData(locMapKey, newMap)
      }
      return { prevInv, prevQty, prevLoc, invKey, qtyKey, locMapKey, productId }
    },
    onSuccess: (_data, vars) => {
      toast.success('已添加库位')
      queryClient.invalidateQueries({ queryKey: ['product-inventory-edit', vars.productId] })
      // 清理对应的状态
      if (vars.productId === editingProductId) {
        setNewLocId('')
        setNewLocQty('')
      }
      if (vars.productId === inlineLocProductId) {
        setInlineLocId('')
        setInlineLocQty('')
        setInlineLocProductId(null)
      }
    },
    onError: (err: any, _vars, ctx: any) => {
      if (ctx) {
        if (ctx.prevInv !== undefined) queryClient.setQueryData(ctx.invKey, ctx.prevInv)
        if (ctx.prevQty !== undefined) queryClient.setQueryData(ctx.qtyKey, ctx.prevQty)
        if (ctx.prevLoc !== undefined) queryClient.setQueryData(ctx.locMapKey, ctx.prevLoc)
      }
      toast.error(err.message || '添加失败')
    },
  })

  const openCreate = () => {
    setEditing(null)
    setEditingProductId(null)
    setNewLocId('')
    setNewLocQty('')
    setCreateLocId('')
    setCreateLocQty('')
    setForm(emptyForm)
    setDialogOpen(true)
  }

  const openEdit = async (product: Product) => {
    setEditing(product)
    setEditingProductId(product.id)
    setNewLocId('')
    setNewLocQty('')
    setForm({
      sku: product.sku || '',
      name: product.name,
      barcode: product.barcode || '',
      category: product.category || '',
      spec: product.spec || '',
      unit: product.unit,
      cost: product.cost ? String(product.cost) : '',
      description: product.description || '',
      imageFile: null,
      imagePreview: product.image_path ? getProductImageUrl(product.image_path) : null,
      selectedTagIds: [],
      newTagName: '',
    })

    const { data: productTags, error } = await supabase
      .from('product_tags')
      .select('tag_id')
      .eq('product_id', product.id)
    if (error) {
      toast.error(error.message || '加载产品标签失败')
    } else {
      setForm((prev) => ({
        ...prev,
        selectedTagIds: productTags.map((pt) => pt.tag_id),
      }))
    }

    setDialogOpen(true)
  }

  // 支持 URL ?open=<product_id> 自动打开编辑（由仓库管理页跳转触发）
  useEffect(() => {
    const openId = searchParams.get('open')
    if (!openId || !products) return
    const product = products.find((p) => p.id === openId)
    if (product) {
      setSearchParams((prev) => {
        const n = new URLSearchParams(prev)
        n.delete('open')
        return n
      })
      openEdit(product as Product)
    }
  }, [searchParams, products])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    try {
      // SKU 归一化：空字符串 / 全空白统一为 null，避免 '' 被 Postgres unique 当成冲突
      const normalizedSku = form.sku.trim() || null

      // 唯一性校验（编辑场景排除自身）
      if (normalizedSku) {
        const { data: dup, error: dupErr } = await supabase
          .from('products')
          .select('id, name')
          .eq('sku', normalizedSku)
          .limit(2)
        if (dupErr) throw dupErr
        const other = dup?.filter((p) => p.id !== editing?.id) || []
        if (other.length > 0) {
          toast.error(`SKU「${normalizedSku}」已被产品「${other[0].name}」占用，请更换`)
          return
        }
      }

      const safeForm = { ...form, sku: normalizedSku ? normalizedSku : '' }

      if (editing) {
        await updateMutation.mutateAsync({
          id: editing.id,
          form: safeForm,
          oldImagePath: editing.image_path,
        })
      } else {
        const unallocQty = Number(createUnallocQty) || 0
        const created: any = await createMutation.mutateAsync({
          form: safeForm,
          unallocatedQty: unallocQty > 0 ? unallocQty : 0,
        })
        if (createLocId && createLocQty) {
          const qty = Number(createLocQty)
          if (qty > 0) {
            const { error: invErr } = await supabase.from('inventory').insert({
              product_id: created.id,
              location_id: createLocId,
              quantity: qty,
            })
            if (invErr) throw invErr
          }
        }
      }
    } finally {
      setSubmitting(false)
    }
  }

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      setForm({
        ...form,
        imageFile: file,
        imagePreview: URL.createObjectURL(file),
      })
    }
  }

  const handleRemoveImage = () => {
    setForm({ ...form, imageFile: null, imagePreview: null })
  }

  const handleDelete = (product: Product) => {
    if (confirm(`确定删除产品「${product.name}」吗？`)) {
      deleteMutation.mutate(product)
    }
  }

  const handleTagToggle = (tagId: string) => {
    setForm((prev) => {
      if (prev.selectedTagIds.includes(tagId)) {
        return { ...prev, selectedTagIds: prev.selectedTagIds.filter((id) => id !== tagId) }
      } else {
        return { ...prev, selectedTagIds: [...prev.selectedTagIds, tagId] }
      }
    })
  }

  const handleAddNewTag = async () => {
    if (!form.newTagName.trim()) return
    const existingTag = tags?.find((t) => t.name === form.newTagName.trim())
    if (existingTag) {
      if (!form.selectedTagIds.includes(existingTag.id)) {
        setForm((prev) => ({
          ...prev,
          selectedTagIds: [...prev.selectedTagIds, existingTag.id],
          newTagName: '',
        }))
      } else {
        setForm((prev) => ({ ...prev, newTagName: '' }))
      }
      return
    }
    try {
      const newTag = await createTagMutation.mutateAsync(form.newTagName.trim())
      setForm((prev) => ({
        ...prev,
        selectedTagIds: [...prev.selectedTagIds, newTag.id],
        newTagName: '',
      }))
    } catch {
    }
  }

  const toggleTagFilter = (tagId: string) => {
    setSelectedTagFilter((prev) =>
      prev.includes(tagId) ? prev.filter((id) => id !== tagId) : [...prev, tagId],
    )
  }

  const clearTagFilter = () => {
    setSelectedTagFilter([])
  }

  const getProductTags = (product: ProductWithTags) => {
    if (!product.tags) return []
    return product.tags.map((pt) => pt.tags).filter(Boolean)
  }

  // 产品列表按库位顺序排列：先按仓库名/编码，再按库位编码
  const PAGE_SIZE = 30
  const [page, setPage] = useState(1)
  const [showTop, setShowTop] = useState(false)

  // 排序：无 SKU 在最前，其他按 SKU 升序（数字段自然排序）
  const sortedProducts = useMemo(() => {
    if (!products) return products
    return [...products].sort((a, b) => {
      const aSku = (a.sku || '').trim()
      const bSku = (b.sku || '').trim()
      const aNo = !aSku
      const bNo = !bSku
      if (aNo !== bNo) return aNo ? -1 : 1
      if (aNo && bNo) return (b.created_at || '').localeCompare(a.created_at || '')
      return aSku.localeCompare(bSku, 'zh-CN', { numeric: true })
    })
  }, [products])

  // 搜索/筛选变化时回到第 1 页
  useEffect(() => { setPage(1) }, [deferredSearch, categoryFilter, selectedTagFilter])

  const totalPages = Math.max(1, Math.ceil((sortedProducts?.length || 0) / PAGE_SIZE))
  const pagedProducts = useMemo(
    () => sortedProducts?.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [sortedProducts, page],
  )

  useEffect(() => {
    const onScroll = () => setShowTop(window.scrollY > 300)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  const colgroupRef = useRef<HTMLTableColElement>(null)
  const [colWidths, setColWidths] = useState<number[]>([])

  useLayoutEffect(() => {
    const measure = () => {
      if (colgroupRef.current) {
        const cols = Array.from(colgroupRef.current.children) as HTMLElement[]
        setColWidths(cols.map((c) => c.getBoundingClientRect().width))
      }
    }
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [products?.length, canViewCost])

  const headerCols = [
    { label: '图片', w: 80 },
    { label: 'SKU', w: 0 },
    { label: '名称', w: 0 },
    { label: '条形码', w: 0 },
    { label: '分类', w: 0 },
    { label: '标签', w: 0 },
    { label: '规格', w: 0 },
    ...(canViewCost() ? [{ label: '成本', w: 0 }] : []),
    { label: '当前库存', w: 0 },
    { label: '库位', w: 0 },
    { label: '上架状态', w: 0 },
    { label: '操作', w: 96 },
  ]

  return (
    <div className="space-y-4">
      <div className="sticky top-0 z-30 bg-background border-b shadow-sm space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold tracking-tight">产品管理</h2>
            <p className="text-sm text-muted-foreground">管理所有产品信息和图片</p>
          </div>
          {canWrite() && (
            <Button onClick={openCreate}>
              <Plus className="mr-2 h-4 w-4" />
              新增产品
            </Button>
          )}
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="搜索名称 / SKU / 条形码 / 分类"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8"
            />
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
              className={`px-2 py-0.5 rounded-full text-xs font-medium transition-colors ${selectedTagFilter.includes(tag.id) ? 'ring-2 ring-offset-1 ring-primary' : ''} ${getTagColor(index)}`}
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

        {/* 表头行 - 与下方表格列宽对齐 */}
        <div className="flex items-center border-t border-b bg-muted/50">
          {headerCols.map((col, i) => (
            <div
              key={i}
              className={`px-4 py-3 text-left align-middle font-medium text-muted-foreground text-sm ${col.label === '操作' ? 'text-right' : ''}`}
              style={{ width: colWidths[i] || col.w || 'auto' }}
            >
              {col.label}
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-md border bg-background">
        <Table>
          <colgroup ref={colgroupRef}>
            <col className="w-20" />
            <col />
            <col />
            <col />
            <col />
            <col />
            <col />
            {canViewCost() && <col />}
            <col />
            <col />
            <col />
            <col className="w-24" />
          </colgroup>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={canViewCost() ? 12 : 11} className="text-center text-muted-foreground py-8">
                  加载中...
                </TableCell>
              </TableRow>
            ) : sortedProducts?.length === 0 ? (
              <TableRow>
                <TableCell colSpan={canViewCost() ? 12 : 11} className="text-center text-muted-foreground py-8">
                  暂无产品，点击右上角新增
                </TableCell>
              </TableRow>
            ) : (
              pagedProducts?.map((p) => {
                const productTags = getProductTags(p)
                const totalQty = productQtyMap?.get(p.id) || 0
                const isOutOfStock = totalQty === 0
                const lowStockLevel = getLowStockLevel(totalQty)
                const lowStockColor = getLowStockLevelColor(lowStockLevel)
                const hasLowStock = lowStockLevel !== 'normal' && !isOutOfStock
                const locations = productLocationsMap?.get(p.id) || []
                let rowClass = ''
                if (isOutOfStock) rowClass = 'bg-red-100/60'
                else if (hasLowStock) rowClass = lowStockColor.bg
                return (
                  <TableRow key={p.id} className={rowClass}>
                    <TableCell>
                      {p.image_path ? (
                        <img
                          src={getProductImageUrl(p.image_path)}
                          alt={p.name}
                          className="h-10 w-10 rounded object-cover"
                        />
                      ) : (
                        <div className="h-10 w-10 rounded bg-muted flex items-center justify-center">
                          <ImagePlus className="h-5 w-5 text-muted-foreground/50" />
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="font-mono text-xs">{p.sku || '-'}</TableCell>
                    <TableCell className="font-medium">
                      <div className="flex items-center flex-wrap gap-1.5">
                        {p.name}
                        {isOutOfStock && (
                          <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-red-100 text-red-700">
                          <X className="h-2.5 w-2.5" />
                          缺货
                        </span>
                        )}
                        {hasLowStock && (
                          <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-medium border ${lowStockColor.border} ${lowStockColor.text} ${lowStockColor.bg}`}>
                            {lowStockColor.label}
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {p.barcode || '-'}
                    </TableCell>
                    <TableCell>{p.category || '-'}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1 max-w-[200px]">
                        {productTags.length === 0 ? (
                          <span className="text-muted-foreground text-xs">-</span>
                        ) : (
                          productTags.map((tag, idx) => (
                            <span
                              key={tag.id}
                              className={`px-2 py-0.5 rounded-full text-xs font-medium ${getTagColor(
                                idx,
                              )}`}
                            >
                              {tag.name}
                            </span>
                          ))
                        )}
                      </div>
                    </TableCell>
                    <TableCell>{p.spec || '-'}</TableCell>
                    {canViewCost() && (
                      <TableCell>
                        {p.cost == null ? (
                          <span className="text-muted-foreground">-</span>
                        ) : (
                          <span className="font-mono">¥{Number(p.cost).toFixed(2)}</span>
                        )}
                      </TableCell>
                    )}
                    <TableCell>
                      <span className={`font-semibold ${isOutOfStock ? 'text-red-700' : hasLowStock ? lowStockColor.text : ''}`}>
                        {totalQty}
                      </span>
                    </TableCell>
                    <TableCell className="min-w-[180px]">
                      <div className="flex flex-col gap-1">
                        {locations.length === 0 ? (
                          <span className="text-muted-foreground text-xs">-</span>
                        ) : (
                          locations.map((loc, idx) => {
                            const isUnalloc = !!loc.isUnallocated
                            const editing = isUnalloc && editUnallocProductId === p.id
                            return (
                            <div
                              key={idx}
                              className={`flex items-center gap-1 text-xs px-1.5 py-0.5 rounded ${
                                isUnalloc ? 'bg-amber-50 border border-amber-200' : ''
                              }`}
                            >
                              {isUnalloc ? (
                                <Package className="h-3 w-3 text-amber-600" />
                              ) : (
                                <MapPin className="h-3 w-3 text-muted-foreground" />
                              )}
                              <span
                                className={`font-mono ${
                                  isUnalloc ? 'text-amber-700 font-medium' : ''
                                }`}
                              >
                                {loc.code}
                              </span>
                              {loc.warehouseName && (
                                <span className="text-muted-foreground">({loc.warehouseName})</span>
                              )}
                              {editing ? (
                                <>
                                  <input
                                    type="number"
                                    value={editUnallocQty}
                                    onChange={(e) => setEditUnallocQty(e.target.value)}
                                    className="w-14 h-5 rounded border border-amber-300 px-1 text-xs bg-white"
                                    autoFocus
                                  />
                                  <button
                                    type="button"
                                    className="text-emerald-600 hover:text-emerald-800 px-0.5 font-bold"
                                    onClick={() => {
                                      const q = Number(editUnallocQty)
                                      if (Number.isNaN(q) || q < 0) { toast.error('数量无效'); return }
                                      updateUnalloc.mutate({ productId: p.id, qty: q })
                                    }}
                                  >✓</button>
                                  <button
                                    type="button"
                                    className="text-muted-foreground hover:text-foreground px-0.5"
                                    onClick={() => { setEditUnallocProductId(null); setEditUnallocQty('') }}
                                  ><X className="h-3 w-3" /></button>
                                </>
                              ) : (
                                <span
                                  className={
                                    isUnalloc ? 'text-amber-700 font-medium' : 'text-muted-foreground'
                                  }
                                >
                                  : {loc.quantity}
                                </span>
                              )}
                              {isUnalloc && canWrite() && !editing && (
                                <>
                                  <button
                                    type="button"
                                    className="text-amber-600 hover:text-amber-800 px-0.5"
                                    title="修改暂未入仓数量"
                                    onClick={() => { setEditUnallocProductId(p.id); setEditUnallocQty(String(loc.quantity)) }}
                                  ><Edit2 className="h-2.5 w-2.5" /></button>
                                  <button
                                    type="button"
                                    className="text-red-500 hover:text-red-700 px-0.5"
                                    title="清零暂未入仓数量"
                                    onClick={() => {
                                      if (window.confirm('清零该产品的暂未入仓数量？')) {
                                        updateUnalloc.mutate({ productId: p.id, qty: 0 })
                                      }
                                    }}
                                  ><Trash2 className="h-2.5 w-2.5" /></button>
                                </>
                              )}
                            </div>
                            )
                          })
                        )}
                        {canWrite() && inlineLocProductId === p.id ? (
                          <div className="flex items-center gap-1 mt-1">
                            <LocationPicker
                              locations={allLocations || []}
                              excludeIds={locations
                                .filter((l: any) => !l.isUnallocated)
                                .map((l: any) => l.id)}
                              onSelect={(locId) => setInlineLocId(locId)}
                              placeholder="搜索库位..."
                              className="flex-1 min-w-[120px]"
                            />
                            <input
                              type="number"
                              value={inlineLocQty}
                              onChange={(e) => setInlineLocQty(e.target.value)}
                              placeholder="数量"
                              className="w-16 h-7 rounded-md border border-input bg-background px-1 text-xs"
                            />
                            <Button
                              type="button"
                              size="sm"
                              className="h-7 px-2"
                              disabled={!inlineLocId || !inlineLocQty}
                              onClick={() => {
                                addInv.mutate({
                                  productId: p.id,
                                  locationId: inlineLocId,
                                  quantity: Number(inlineLocQty),
                                })
                              }}
                            >
                              确认
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-7 px-2"
                              onClick={() => {
                                setInlineLocProductId(null)
                                setInlineLocId('')
                                setInlineLocQty('')
                              }}
                            >
                              <X className="h-3 w-3" />
                            </Button>
                          </div>
                        ) : canWrite() ? (
                          <button
                            type="button"
                            onClick={() => {
                              setInlineLocProductId(p.id)
                              setInlineLocId('')
                              setInlineLocQty('')
                            }}
                            className="flex items-center gap-0.5 text-xs text-primary hover:text-primary/80 transition-colors mt-0.5"
                          >
                            <Plus className="h-3 w-3" />
                            添加库位
                          </button>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell>
                      {canWrite() ? (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className={p.on_shelf
                            ? 'border-green-300 bg-green-50 text-green-700 hover:bg-green-100'
                            : 'border-gray-300 bg-gray-50 text-gray-600 hover:bg-gray-100'}
                          onClick={() =>
                            toggleShelfMutation.mutate({ id: p.id, value: !p.on_shelf })}
                        >
                          {p.on_shelf ? '已上架' : '未上架'}
                        </Button>
                      ) : (
                        <span className={`inline-flex px-2 py-0.5 rounded text-xs ${p.on_shelf ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
                          {p.on_shelf ? '已上架' : '未上架'}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {canWrite() ? (
                        <div className="flex justify-end gap-1">
                          <Button variant="ghost" size="icon" onClick={() => openEdit(p)}>
                            <Edit2 className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="text-destructive hover:text-destructive"
                            onClick={() => handleDelete(p)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">只读</span>
                      )}
                    </TableCell>
                  </TableRow>
                )
              })
            )}
          </TableBody>
        </Table>
      </div>

      {(sortedProducts?.length || 0) > PAGE_SIZE && (
        <div className="flex items-center justify-center gap-1 py-2 text-sm flex-wrap">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => { setPage(1); window.scrollTo({ top: 0, behavior: 'smooth' }) }}>
            首页
          </Button>
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => { setPage(page - 1); window.scrollTo({ top: 0, behavior: 'smooth' }) }}>
            上一页
          </Button>
          {(() => {
            const range: (number | string)[] = []
            if (totalPages <= 7) {
              for (let i = 1; i <= totalPages; i++) range.push(i)
            } else {
              range.push(1)
              const start = Math.max(2, page - 1)
              const end = Math.min(totalPages - 1, page + 1)
              if (start > 2) range.push('...')
              for (let i = start; i <= end; i++) range.push(i)
              if (end < totalPages - 1) range.push('...')
              range.push(totalPages)
            }
            return range.map((p, i) =>
              typeof p === 'number' ? (
                <Button key={i} variant={p === page ? 'default' : 'outline'} size="sm" onClick={() => { setPage(p); window.scrollTo({ top: 0, behavior: 'smooth' }) }}>
                  {p}
                </Button>
              ) : (
                <span key={i} className="px-1 text-muted-foreground">…</span>
              ),
            )
          })()}
          <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => { setPage(page + 1); window.scrollTo({ top: 0, behavior: 'smooth' }) }}>
            下一页
          </Button>
          <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => { setPage(totalPages); window.scrollTo({ top: 0, behavior: 'smooth' }) }}>
            末页
          </Button>
          <span className="text-muted-foreground ml-2">第 {page}/{totalPages} 页 · 共 {sortedProducts?.length} 个</span>
        </div>
      )}

      {showTop && (
        <button
          onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          className="fixed bottom-6 right-6 z-30 h-11 w-11 rounded-full bg-primary text-primary-foreground shadow-lg flex items-center justify-center hover:opacity-90"
          aria-label="返回顶部"
        >
          <ArrowUp className="h-5 w-5" />
        </button>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <form onSubmit={handleSubmit}>
            <DialogHeader>
              <DialogTitle>{editing ? '编辑产品' : '新增产品'}</DialogTitle>
              <DialogDescription>
                填写产品基本信息，支持上传产品图片
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="sku">SKU 编码</Label>
                <Input
                  id="sku"
                  value={form.sku}
                  onChange={(e) => setForm({ ...form, sku: e.target.value })}
                  placeholder="可留空，后续补充"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="name">产品名称 *</Label>
                <Input
                  id="name"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="barcode">条形码</Label>
                <Input
                  id="barcode"
                  value={form.barcode}
                  onChange={(e) => setForm({ ...form, barcode: e.target.value })}
                  placeholder="扫码枪可识别的条码"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="category">分类</Label>
                <select
                  id="category"
                  value={form.category}
                  onChange={(e) => setForm({ ...form, category: e.target.value })}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                >
                  <option value="">请选择分类</option>
                  {categories?.map((c) => (
                    <option key={c.id} value={c.name}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="spec">规格</Label>
                <Input
                  id="spec"
                  value={form.spec}
                  onChange={(e) => setForm({ ...form, spec: e.target.value })}
                  placeholder="如：500ml / 大号"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="unit">单位</Label>
                <Input
                  id="unit"
                  value={form.unit}
                  onChange={(e) => setForm({ ...form, unit: e.target.value })}
                />
              </div>
              {canViewCost() && (
                <div className="space-y-2">
                  <Label htmlFor="cost">成本（元）</Label>
                  <Input
                    id="cost"
                    type="number"
                    step="0.01"
                    value={form.cost}
                    onChange={(e) => setForm({ ...form, cost: e.target.value })}
                    placeholder="选填，未填则不显示"
                  />
                </div>
              )}
              <div className="md:col-span-2 space-y-2">
                <Label>产品标签</Label>
                <div className="flex flex-wrap gap-2 mb-2">
                  {tags?.map((tag, index) => (
                    <button
                      key={tag.id}
                      type="button"
                      onClick={() => handleTagToggle(tag.id)}
                      className={`px-3 py-1 rounded-full text-sm font-medium transition-colors ${form.selectedTagIds.includes(tag.id) ? 'ring-2 ring-offset-1 ring-primary' : ''} ${getTagColor(index)}`}
                    >
                      {tag.name}
                    </button>
                  ))}
                </div>
                <div className="flex gap-2">
                  <Input
                    placeholder="输入新标签名称，按回车快速创建"
                    value={form.newTagName}
                    onChange={(e) => setForm({ ...form, newTagName: e.target.value })}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        handleAddNewTag()
                      }
                    }}
                  />
                  <Button type="button" onClick={handleAddNewTag} variant="secondary">
                    添加
                  </Button>
                </div>
              </div>
              {!editing && (
                <div className="md:col-span-2 space-y-4">
                  <div className="space-y-2">
                    <Label className="flex items-center gap-1">
                      <Package className="h-3.5 w-3.5" />
                      暂未入仓数量
                      <span className="text-xs text-muted-foreground font-normal">
                        （可选：有数量但暂时没确定库位时填这里）
                      </span>
                    </Label>
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      value={createUnallocQty}
                      onChange={(e) => setCreateUnallocQty(e.target.value)}
                      placeholder="例：100"
                      className="max-w-xs"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label className="flex items-center gap-1">
                      <MapPin className="h-3.5 w-3.5" />
                      初始库位 + 数量
                      <span className="text-xs text-muted-foreground font-normal">
                        （可选：已知道具体放哪里时填）
                      </span>
                    </Label>
                    <div className="flex items-center gap-2 flex-wrap">
                      <LocationPicker
                        locations={allLocations || []}
                        onSelect={(locId) => setCreateLocId(locId)}
                        placeholder="搜索库位编码 / 仓库名..."
                        className="flex-1 min-w-64"
                      />
                      {createLocId && (
                        <span className="text-xs text-muted-foreground whitespace-nowrap">
                          已选: {allLocations?.find((l) => l.id === createLocId)?.code}
                        </span>
                      )}
                      <Input
                        type="number"
                        min="0"
                        step="0.01"
                        value={createLocQty}
                        onChange={(e) => setCreateLocQty(e.target.value)}
                        placeholder="数量"
                        className="w-32"
                        disabled={!createLocId}
                      />
                    </div>
                  </div>
                </div>
              )}
              <div className="md:col-span-2 space-y-2">
                <Label>产品图片</Label>
                <div className="flex items-start gap-4">
                  {form.imagePreview ? (
                    <div className="relative">
                      <img
                        src={form.imagePreview}
                        alt="preview"
                        className="h-24 w-24 rounded-lg object-cover border"
                      />
                      <button
                        type="button"
                        onClick={handleRemoveImage}
                        className="absolute -top-2 -right-2 flex h-6 w-6 items-center justify-center rounded-full bg-destructive text-destructive-foreground"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ) : (
                    <label className="flex h-24 w-24 items-center justify-center rounded-lg border border-dashed cursor-pointer hover:bg-muted/50 transition-colors">
                      <ImagePlus className="h-8 w-8 text-muted-foreground" />
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={handleImageChange}
                      />
                    </label>
                  )}
                  <div className="text-xs text-muted-foreground pt-2">
                    <p>支持 JPG / PNG 格式</p>
                    <p>建议尺寸：正方形，不超过 2MB</p>
                  </div>
                </div>
              </div>
              <div className="md:col-span-2 space-y-2">
                <Label htmlFor="description">描述</Label>
                <Textarea
                  id="description"
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  rows={3}
                  placeholder="产品详细描述"
                />
              </div>
              {editing && editingProductId && (
                <div className="md:col-span-2 space-y-2">
                  <Label className="flex items-center gap-1">
                    <MapPin className="h-3.5 w-3.5" />
                    库存与库位
                    <span className="text-xs text-muted-foreground font-normal">（即时保存，独立于产品信息）</span>
                  </Label>
                  {productInventory && productInventory.length > 0 ? (
                    <div className="space-y-1.5 rounded-md border p-3">
                      {productInventory.map((inv: any) => (
                        <div key={inv.id} className="flex items-center gap-2">
                          <span className="font-mono text-sm font-semibold bg-blue-50 text-blue-700 px-2 py-1 rounded flex-shrink-0">
                            {inv.location?.code || '-'}
                          </span>
                          <span className="text-xs text-muted-foreground flex-shrink-0">
                            {inv.location?.warehouse?.name || inv.location?.warehouse?.code || ''}
                          </span>
                          <input
                            type="number"
                            className="flex-1 h-8 rounded-md border border-input bg-background px-2 text-sm"
                            defaultValue={inv.quantity}
                            onBlur={(e) => {
                              const newQty = Number(e.target.value)
                              if (newQty !== inv.quantity && newQty >= 0) {
                                updateInvQty.mutate({ id: inv.id, quantity: newQty })
                              }
                            }}
                          />
                          <button
                            type="button"
                            className="p-1 rounded-md hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors flex-shrink-0"
                            onClick={() => {
                              if (confirm(`确定从该库位移除吗？`)) {
                                deleteInv.mutate(inv.id)
                              }
                            }}
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-xs text-muted-foreground py-2">暂无库存记录，请在下方添加</div>
                  )}
                  <div className="flex items-center gap-2">
                    <LocationPicker
                      locations={allLocations || []}
                      excludeIds={(productInventory || []).map((inv: any) => inv.location?.id).filter(Boolean)}
                      onSelect={(locId) => setNewLocId(locId)}
                      placeholder="搜索库位编码 / 仓库名..."
                      className="flex-1"
                    />
                    {newLocId && (
                      <span className="text-xs text-muted-foreground whitespace-nowrap">
                        已选: {allLocations?.find((l) => l.id === newLocId)?.code}
                      </span>
                    )}
                    <input
                      type="number"
                      value={newLocQty}
                      onChange={(e) => setNewLocQty(e.target.value)}
                      placeholder="数量"
                      className="w-24 h-8 rounded-md border border-input bg-background px-2 text-sm"
                    />
                    <Button
                      type="button"
                      size="sm"
                      disabled={!newLocId || !newLocQty}
                      onClick={() => {
                        if (editingProductId) {
                          addInv.mutate({ productId: editingProductId, locationId: newLocId, quantity: Number(newLocQty) })
                        }
                      }}
                    >
                      添加
                    </Button>
                  </div>
                </div>
              )}
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setDialogOpen(false)}
              >
                取消
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting ? '保存中...' : editing ? '保存修改' : '创建产品'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
