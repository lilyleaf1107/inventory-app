import { useState, useMemo, useDeferredValue } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  Plus,
  Search,
  Edit2,
  Trash2,
  ImagePlus,
  X,
  ArrowLeft,
  Tag,
  MapPin,
} from 'lucide-react'
import {
  supabase,
  getProductImageUrl,
  uploadProductImage,
  deleteProductImage,
} from '@/lib/supabase'
import type { Product, Category as CategoryType, Tag as TagType } from '@/types'
import { useAuthStore } from '@/store/auth'
import { getLowStockLevel, getLowStockLevelColor } from '@/hooks/useLowStock'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent } from '@/components/ui/card'
import { LocationPicker } from '@/components/LocationPicker'
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

export default function MobileProducts() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { canWrite, canViewCost } = useAuthStore()
  const [search, setSearch] = useState('')
  const deferredSearch = useDeferredValue(search)
  const [categoryFilter, setCategoryFilter] = useState('')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<Product | null>(null)
  const [form, setForm] = useState<ProductForm>(emptyForm)
  const [submitting, setSubmitting] = useState(false)
  const [editingProductId, setEditingProductId] = useState<string | null>(null)
  const [newLocId, setNewLocId] = useState('')
  const [newLocQty, setNewLocQty] = useState('')
  // 列表内联库位编辑
  const [inlineLocProductId, setInlineLocProductId] = useState<string | null>(null)
  const [inlineLocId, setInlineLocId] = useState('')
  const [inlineLocQty, setInlineLocQty] = useState('')

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

  // 每个产品的总库存汇总
  const { data: productQtyMap } = useQuery({
    queryKey: ['products-qty-map'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('inventory')
        .select('product_id, quantity')
      if (error) throw error
      const map = new Map<string, number>()
      for (const row of data || []) {
        const qty = Number((row as any).quantity) || 0
        const pid = (row as any).product_id as string
        map.set(pid, (map.get(pid) || 0) + qty)
      }
      return map
    },
    staleTime: 30 * 1000,
  })

  // 每个产品的库位明细
  const { data: productLocationsMap } = useQuery({
    queryKey: ['products-locations-map'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('inventory')
        .select(`
          product_id, quantity,
          location:locations ( id, code, warehouse:warehouses ( code, name ) )
        `)
      if (error) throw error
      const map = new Map<string, { id: string; code: string; warehouseName: string | null; quantity: number }[]>()
      for (const row of (data || []) as any[]) {
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
    queryKey: ['products', deferredSearch, categoryFilter],
    queryFn: async () => {
      let query = supabase
        .from('products')
        .select(
          `
          *,
          tags:product_tags ( tag_id, tags ( id, name, color ) )
        `,
        )
        .order('created_at', { ascending: false })
      if (deferredSearch) {
        query = query.or(
          `name.ilike.%${deferredSearch}%,sku.ilike.%${deferredSearch}%,barcode.ilike.%${deferredSearch}%,category.ilike.%${deferredSearch}%`,
        )
      }
      if (categoryFilter) {
        query = query.eq('category', categoryFilter)
      }
      const { data, error } = await query
      if (error) throw error
      return data as ProductWithTags[]
    },
  })

  const createMutation = useMutation({
    mutationFn: async (data: ProductForm) => {
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
    },
    onSuccess: () => {
      toast.success('产品创建成功')
      queryClient.invalidateQueries({ queryKey: ['products'] })
      setDialogOpen(false)
      setEditingProductId(null)
      setForm(emptyForm)
    },
    onError: (err: any) => toast.error(err.message || '创建失败'),
  })

  const updateMutation = useMutation({
    mutationFn: async (data: {
      id: string
      form: ProductForm
      oldImagePath: string | null
    }) => {
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
      const key = ['products', deferredSearch, categoryFilter] as const
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
      const previousData = queryClient.getQueryData(['products', deferredSearch, categoryFilter])
      queryClient.setQueryData(
        ['products', deferredSearch, categoryFilter],
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
          ['products', deferredSearch, categoryFilter],
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
      return { prevInv, prevQty, prevLoc, invKey, qtyKey, locKey }
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
      const qtyKey = ['products-qty-map'] as const
      const prevQty = queryClient.getQueryData<Map<string, number>>(qtyKey)
      if (deleted && prevQty && editingProductId) {
        const q = Number(deleted.quantity || 0)
        const next = new Map(prevQty)
        next.set(editingProductId, Math.max(0, (next.get(editingProductId) || 0) - q))
        queryClient.setQueryData(qtyKey, next)
      }
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
      if (selLoc && prevInv) {
        const tempItem: any = {
          id: `temp-${Date.now()}`,
          quantity,
          location: selLoc,
        }
        queryClient.setQueryData(invKey, [tempItem, ...prevInv])
      }
      const qtyKey = ['products-qty-map'] as const
      const prevQty = queryClient.getQueryData<Map<string, number>>(qtyKey)
      if (prevQty && productId) {
        const next = new Map(prevQty)
        next.set(productId, (next.get(productId) || 0) + Number(quantity || 0))
        queryClient.setQueryData(qtyKey, next)
      }
      const locMapKey = ['products-locations-map'] as const
      const prevLoc = queryClient.getQueryData<Map<string, any[]>>(locMapKey)
      if (selLoc && prevLoc && productId) {
        const list = prevLoc.get(productId) || []
        const next = [
          ...list,
          {
            id: selLoc.id,
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
        await createMutation.mutateAsync(safeForm)
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
      // 错误已在 mutation 中处理
    }
  }

  const getProductTags = (product: ProductWithTags) => {
    if (!product.tags) return []
    return product.tags.map((pt) => pt.tags).filter(Boolean)
  }

  // 产品列表按库位顺序排列：先按仓库名/编码，再按库位编码
  const sortedProducts = useMemo(() => {
    if (!products) return products
    return [...products].sort((a, b) => {
      const aLocs = productLocationsMap?.get(a.id) || []
      const bLocs = productLocationsMap?.get(b.id) || []
      const aFirst = aLocs[0]
      const bFirst = bLocs[0]
      if (!aFirst && !bFirst) return 0
      if (!aFirst) return 1
      if (!bFirst) return -1
      const aWh = aFirst.warehouseName || ''
      const bWh = bFirst.warehouseName || ''
      if (aWh !== bWh) return aWh.localeCompare(bWh, 'zh-CN')
      const aCode = aFirst.code || ''
      const bCode = bFirst.code || ''
      return aCode.localeCompare(bCode, 'zh-CN', { numeric: true })
    })
  }, [products, productLocationsMap])

  return (
    <div className="flex flex-col h-full">
      {/* 顶部栏 */}
      <div className="flex items-center gap-2 px-4 py-3 border-b bg-background flex-shrink-0">
        <button
          onClick={() => navigate(-1)}
          className="p-1.5 -ml-1.5 rounded-lg hover:bg-muted transition-colors"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <h1 className="font-bold text-base flex-1">产品管理</h1>
        {canWrite() && (
          <Button size="sm" onClick={openCreate} className="h-9">
            <Plus className="h-4 w-4" />
          </Button>
        )}
      </div>

      {/* 搜索和筛选 */}
      <div className="p-3 space-y-2 border-b bg-background flex-shrink-0">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="搜索名称 / SKU / 条形码"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-10"
          />
        </div>
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

      {/* 产品列表 */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {isLoading ? (
          <div className="text-center py-12 text-muted-foreground text-sm">加载中...</div>
        ) : sortedProducts?.length === 0 ? (
          <div className="text-center py-16">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted mx-auto mb-3">
              <ImagePlus className="h-8 w-8 text-muted-foreground/50" />
            </div>
            <div className="text-muted-foreground text-sm mb-3">暂无产品</div>
            {canWrite() && (
              <Button size="sm" onClick={openCreate}>
                <Plus className="h-4 w-4 mr-1" />
                新增产品
              </Button>
            )}
          </div>
        ) : (
          sortedProducts?.map((p) => {
            const productTags = getProductTags(p)
            const totalQty = productQtyMap?.get(p.id) || 0
            const isOutOfStock = totalQty === 0
            const lowStockLevel = getLowStockLevel(totalQty)
            const lowStockColor = getLowStockLevelColor(lowStockLevel)
            const hasLowStock = lowStockLevel !== 'normal' && !isOutOfStock
            const locations = productLocationsMap?.get(p.id) || []
            let cardClass = ''
            if (isOutOfStock) cardClass = 'bg-red-100/60 border-red-200'
            else if (hasLowStock) cardClass = lowStockColor.bg + ' ' + lowStockColor.border
            return (
              <Card key={p.id} className={cardClass}>
                <CardContent className="p-3">
                  <div className="flex gap-3">
                    {p.image_path ? (
                      <img
                        src={getProductImageUrl(p.image_path)}
                        alt={p.name}
                        className="h-16 w-16 rounded-lg object-cover flex-shrink-0"
                      />
                    ) : (
                      <div className="h-16 w-16 rounded-lg bg-muted flex items-center justify-center flex-shrink-0">
                        <ImagePlus className="h-6 w-6 text-muted-foreground/50" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <div className="font-medium text-sm truncate flex-1 flex flex-wrap items-center gap-1">
                          {p.name}
                          {isOutOfStock && (
                            <span className="px-1 py-0.5 rounded text-[10px] font-medium bg-red-100 text-red-700">
                              缺货
                            </span>
                          )}
                          {hasLowStock && (
                            <span className={`px-1 py-0.5 rounded text-[10px] font-medium border ${lowStockColor.border} ${lowStockColor.text} ${lowStockColor.bg}`}>
                              {lowStockColor.label}
                            </span>
                          )}
                        </div>
                        {canWrite() && (
                          <div className="flex gap-0.5 flex-shrink-0">
                            <button
                              onClick={() => openEdit(p)}
                              className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                            >
                              <Edit2 className="h-4 w-4" />
                            </button>
                            <button
                              onClick={() => handleDelete(p)}
                              className="p-1.5 rounded-md hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        )}
                      </div>
                      <div className="mt-1 flex flex-wrap gap-2 text-xs text-muted-foreground">
                        {p.sku && <span className="font-mono">SKU: {p.sku}</span>}
                        {p.category && <span>分类: {p.category}</span>}
                        {canViewCost() && p.cost != null && <span>成本: ¥{Number(p.cost).toFixed(2)}</span>}
                      </div>
                      <div className="mt-1.5 flex flex-wrap gap-1.5 items-center text-xs">
                        <span className="text-muted-foreground">库存:</span>
                        <span className={`font-semibold ${isOutOfStock ? 'text-red-700' : hasLowStock ? lowStockColor.text : ''}`}>
                          {totalQty}
                        </span>
                        {p.unit && <span className="text-muted-foreground">{p.unit}</span>}
                        {canWrite() ? (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-7 px-2 text-[11px] ml-auto"
                            onClick={() =>
                              toggleShelfMutation.mutate({ id: p.id, value: !p.on_shelf })}
                          >
                            {p.on_shelf ? '已上架' : '未上架'}
                          </Button>
                        ) : (
                          <span
                            className={`ml-auto px-2 py-0.5 rounded text-[11px] ${
                              p.on_shelf ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-600'
                            }`}
                          >
                            {p.on_shelf ? '已上架' : '未上架'}
                          </span>
                        )}
                      </div>
                      {locations.length > 0 && (
                        <div className="mt-1 flex flex-wrap gap-1 text-xs">
                          {locations.map((loc, idx) => (
                            <span key={idx} className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-muted/60 text-muted-foreground">
                              <MapPin className="h-2.5 w-2.5" />
                              <span className="font-mono">{loc.code}</span>
                              <span>: {loc.quantity}</span>
                            </span>
                          ))}
                        </div>
                      )}
                      {canWrite() && inlineLocProductId === p.id ? (
                        <div className="mt-2 flex items-center gap-1">
                          <LocationPicker
                            locations={allLocations || []}
                            excludeIds={locations.map((l: any) => l.id)}
                            onSelect={(locId) => setInlineLocId(locId)}
                            placeholder="搜索库位..."
                            className="flex-1"
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
                          className="flex items-center gap-0.5 text-xs text-primary hover:text-primary/80 transition-colors mt-1"
                        >
                          <Plus className="h-3 w-3" />
                          添加库位
                        </button>
                      ) : null}
                      {p.spec && (
                        <div className="text-xs text-muted-foreground mt-1">规格: {p.spec}</div>
                      )}
                      {productTags.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-2">
                          {productTags.map((tag, idx) => (
                            <span
                              key={tag.id}
                              className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${getTagColor(
                                idx,
                              )}`}
                            >
                              {tag.name}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            )
          })
        )}
      </div>

      {/* 新增/编辑对话框 */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto p-0">
          <form onSubmit={handleSubmit}>
            <DialogHeader className="px-4 pt-4">
              <DialogTitle>{editing ? '编辑产品' : '新增产品'}</DialogTitle>
              <DialogDescription>填写产品基本信息</DialogDescription>
            </DialogHeader>
            <div className="space-y-3 p-4">
              {/* 图片 */}
              <div className="space-y-2">
                <Label>产品图片</Label>
                <div className="flex items-start gap-3">
                  {form.imagePreview ? (
                    <div className="relative">
                      <img
                        src={form.imagePreview}
                        alt="preview"
                        className="h-20 w-20 rounded-lg object-cover border"
                      />
                      <button
                        type="button"
                        onClick={handleRemoveImage}
                        className="absolute -top-2 -right-2 flex h-5 w-5 items-center justify-center rounded-full bg-destructive text-destructive-foreground"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ) : (
                    <label className="flex h-20 w-20 items-center justify-center rounded-lg border border-dashed cursor-pointer hover:bg-muted/50 transition-colors">
                      <ImagePlus className="h-6 w-6 text-muted-foreground" />
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={handleImageChange}
                      />
                    </label>
                  )}
                  <div className="text-xs text-muted-foreground pt-1">
                    <p>支持 JPG / PNG</p>
                    <p>不超过 2MB</p>
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="m-name">产品名称 *</Label>
                <Input
                  id="m-name"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="m-sku">SKU 编码</Label>
                  <Input
                    id="m-sku"
                    value={form.sku}
                    onChange={(e) => setForm({ ...form, sku: e.target.value })}
                    placeholder="可留空"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="m-unit">单位</Label>
                  <Input
                    id="m-unit"
                    value={form.unit}
                    onChange={(e) => setForm({ ...form, unit: e.target.value })}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="m-barcode">条形码</Label>
                <Input
                  id="m-barcode"
                  value={form.barcode}
                  onChange={(e) => setForm({ ...form, barcode: e.target.value })}
                  placeholder="扫码枪可识别的条码"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="m-category">分类</Label>
                  <select
                    id="m-category"
                    value={form.category}
                    onChange={(e) => setForm({ ...form, category: e.target.value })}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  >
                    <option value="">请选择</option>
                    {categories?.map((c) => (
                      <option key={c.id} value={c.name}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="m-spec">规格</Label>
                  <Input
                    id="m-spec"
                    value={form.spec}
                    onChange={(e) => setForm({ ...form, spec: e.target.value })}
                    placeholder="如 500ml"
                  />
                </div>
              </div>

              {canViewCost() && (
                <div className="space-y-2">
                  <Label htmlFor="m-cost">成本（元）</Label>
                  <Input
                    id="m-cost"
                    type="number"
                    step="0.01"
                    value={form.cost}
                    onChange={(e) => setForm({ ...form, cost: e.target.value })}
                    placeholder="选填，未填则不显示"
                  />
                </div>
              )}

              {/* 标签 */}
              <div className="space-y-2">
                <Label className="flex items-center gap-1">
                  <Tag className="h-3.5 w-3.5" />
                  产品标签
                </Label>
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {tags?.map((tag, index) => (
                    <button
                      key={tag.id}
                      type="button"
                      onClick={() => handleTagToggle(tag.id)}
                      className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                        form.selectedTagIds.includes(tag.id)
                          ? 'ring-2 ring-offset-1 ring-primary'
                          : ''
                      } ${getTagColor(index)}`}
                    >
                      {tag.name}
                    </button>
                  ))}
                </div>
                <div className="flex gap-2">
                  <Input
                    placeholder="新标签，回车创建"
                    value={form.newTagName}
                    onChange={(e) => setForm({ ...form, newTagName: e.target.value })}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        handleAddNewTag()
                      }
                    }}
                    className="h-9 text-sm"
                  />
                  <Button
                    type="button"
                    onClick={handleAddNewTag}
                    variant="secondary"
                    size="sm"
                    className="h-9"
                  >
                    添加
                  </Button>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="m-desc">描述</Label>
                <Textarea
                  id="m-desc"
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  rows={2}
                  placeholder="产品详细描述"
                />
              </div>

              {editing && editingProductId && (
                <div className="space-y-2">
                  <Label className="flex items-center gap-1">
                    <MapPin className="h-3.5 w-3.5" />
                    库存与库位
                    <span className="text-[10px] text-muted-foreground font-normal">（即时保存）</span>
                  </Label>
                  {productInventory && productInventory.length > 0 ? (
                    <div className="space-y-1.5 rounded-md border p-2">
                      {productInventory.map((inv: any) => (
                        <div key={inv.id} className="flex items-center gap-1.5">
                          <span className="font-mono text-[10px] bg-muted px-1.5 py-1 rounded flex-shrink-0">
                            {inv.location?.code || '-'}
                          </span>
                          <span className="text-[10px] text-muted-foreground flex-shrink-0 truncate flex-1 min-w-0">
                            {inv.location?.warehouse?.name || inv.location?.warehouse?.code || ''}
                          </span>
                          <input
                            type="number"
                            className="w-16 h-7 rounded-md border border-input bg-background px-1.5 text-xs"
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
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-xs text-muted-foreground py-1">暂无库存记录</div>
                  )}
                  <div className="flex items-center gap-1.5">
                    <select
                      value={newLocId}
                      onChange={(e) => setNewLocId(e.target.value)}
                      className="flex-1 min-w-0 h-7 rounded-md border border-input bg-background px-1.5 text-xs"
                    >
                      <option value="">选择库位...</option>
                      {allLocations
                        ?.filter((loc: any) =>
                          !productInventory?.some((inv: any) => inv.location?.id === loc.id)
                        )
                        .map((loc: any) => (
                          <option key={loc.id} value={loc.id}>
                            {loc.code}
                          </option>
                        ))}
                    </select>
                    <input
                      type="number"
                      value={newLocQty}
                      onChange={(e) => setNewLocQty(e.target.value)}
                      placeholder="数量"
                      className="w-16 h-7 rounded-md border border-input bg-background px-1.5 text-xs"
                    />
                    <Button
                      type="button"
                      size="sm"
                      className="h-7 px-2 text-xs flex-shrink-0"
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
            <DialogFooter className="px-4 pb-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => setDialogOpen(false)}
                size="sm"
              >
                取消
              </Button>
              <Button type="submit" disabled={submitting} size="sm">
                {submitting ? '保存中...' : editing ? '保存修改' : '创建产品'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
