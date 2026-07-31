import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Plus, Search, Edit2, Trash2, ImagePlus, X, Tag, MapPin } from 'lucide-react'
import { supabase, getProductImageUrl, uploadProductImage, deleteProductImage } from '@/lib/supabase'
import type { Product, Category as CategoryType, Tag as TagType } from '@/types'
import { useAuthStore } from '@/store/auth'
import { getLowStockLevel, getLowStockLevelColor } from '@/hooks/useLowStock'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
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
  description: string
  isMaterialArea: boolean
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
  description: '',
  isMaterialArea: false,
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
  const { canWrite } = useAuthStore()
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [selectedTagFilter, setSelectedTagFilter] = useState<string[]>([])
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<Product | null>(null)
  const [form, setForm] = useState<ProductForm>(emptyForm)
  const [submitting, setSubmitting] = useState(false)

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

  // 每个产品的库位明细（按产品 id 聚合，显示每个库位）
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
      const map = new Map<string, { code: string; warehouseName: string | null; quantity: number }[]>()
      for (const row of (data || []) as any[]) {
        const pid = row.product_id as string
        const loc = row.location
        if (!loc) continue
        const list = map.get(pid) || []
        list.push({
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

  const { data: products, isLoading } = useQuery({
    queryKey: ['products', search, categoryFilter, selectedTagFilter],
    queryFn: async () => {
      let query = supabase
        .from('products')
        .select(`
          *,
          tags:product_tags ( tag_id, tags ( id, name, color ) )
        `)
        .order('created_at', { ascending: false })
      if (search) {
        query = query.or(
          `name.ilike.%${search}%,sku.ilike.%${search}%,barcode.ilike.%${search}%,category.ilike.%${search}%`,
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
          image_path: imagePath,
          description: data.description || null,
          is_material_area: data.isMaterialArea,
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
          image_path: imagePath,
          description: data.form.description || null,
          is_material_area: data.form.isMaterialArea,
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
    onSuccess: () => {
      toast.success('产品更新成功')
      queryClient.invalidateQueries({ queryKey: ['products'] })
      setDialogOpen(false)
      setEditing(null)
      setForm(emptyForm)
    },
    onError: (err: any) => toast.error(err.message || '更新失败'),
  })

  const deleteMutation = useMutation({
    mutationFn: async (product: Product) => {
      if (product.image_path) {
        await deleteProductImage(product.image_path)
      }
      const { error } = await supabase.from('products').delete().eq('id', product.id)
      if (error) throw error
    },
    onSuccess: () => {
      toast.success('产品删除成功')
      queryClient.invalidateQueries({ queryKey: ['products'] })
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

  const openCreate = () => {
    setEditing(null)
    setForm(emptyForm)
    setDialogOpen(true)
  }

  const openEdit = async (product: Product) => {
    setEditing(product)
    setForm({
      sku: product.sku || '',
      name: product.name,
      barcode: product.barcode || '',
      category: product.category || '',
      spec: product.spec || '',
      unit: product.unit,
      description: product.description || '',
      isMaterialArea: product.is_material_area || false,
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
      if (editing) {
        await updateMutation.mutateAsync({
          id: editing.id,
          form,
          oldImagePath: editing.image_path,
        })
      } else {
        await createMutation.mutateAsync(form)
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

  return (
    <div className="space-y-4">
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

      <div className="rounded-md border bg-background">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-20">图片</TableHead>
              <TableHead>SKU</TableHead>
              <TableHead>名称</TableHead>
              <TableHead>条形码</TableHead>
              <TableHead>分类</TableHead>
              <TableHead>标签</TableHead>
              <TableHead>规格</TableHead>
              <TableHead>当前库存</TableHead>
              <TableHead>库位</TableHead>
              <TableHead className="w-24 text-right">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={10} className="text-center text-muted-foreground py-8">
                  加载中...
                </TableCell>
              </TableRow>
            ) : products?.length === 0 ? (
              <TableRow>
                <TableCell colSpan={10} className="text-center text-muted-foreground py-8">
                  暂无产品，点击右上角新增
                </TableCell>
              </TableRow>
            ) : (
              products?.map((p) => {
                const productTags = getProductTags(p)
                const totalQty = productQtyMap?.get(p.id) || 0
                const isMaterial = p.is_material_area
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
                        {isMaterial && (
                          <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-blue-100 text-blue-700">
                            物料
                          </span>
                        )}
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
                    <TableCell>
                      <span className={`font-semibold ${isOutOfStock ? 'text-red-700' : hasLowStock ? lowStockColor.text : ''}`}>
                        {isMaterial ? '***' : totalQty}
                      </span>
                    </TableCell>
                    <TableCell>
                      {locations.length === 0 ? (
                        <span className="text-muted-foreground text-xs">-</span>
                      ) : (
                        <div className="flex flex-col gap-1">
                          {locations.map((loc, idx) => (
                            <div key={idx} className="flex items-center gap-1 text-xs">
                              <MapPin className="h-3 w-3 text-muted-foreground" />
                              <span className="font-mono">{loc.code}</span>
                              {loc.warehouseName && (
                                <span className="text-muted-foreground">({loc.warehouseName})</span>
                              )}
                              {!isMaterial && (
                                <span className="text-muted-foreground">: {loc.quantity}</span>
                              )}
                            </div>
                          ))}
                        </div>
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
              <div className="space-y-2">
                <Label>物料</Label>
                <div className="flex items-center gap-2 h-10">
                  <input
                    type="checkbox"
                    id="isMaterialArea"
                    checked={form.isMaterialArea}
                    onChange={(e) => setForm({ ...form, isMaterialArea: e.target.checked })}
                    className="h-4 w-4 rounded border-input"
                  />
                  <label htmlFor="isMaterialArea" className="text-sm text-muted-foreground">
                    标记为物料
                  </label>
                </div>
              </div>
              <div className="md:col-span-2 space-y-2">
                <Label>产品标签</Label>
                <div className="flex flex-wrap gap-2 mb-2">
                  {tags?.map((tag, index) => (
                    <button
                      key={tag.id}
                      type="button"
                      onClick={() => handleTagToggle(tag.id)}
                      className={`px-3 py-1 rounded-full text-sm font-medium transition-colors ${
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
