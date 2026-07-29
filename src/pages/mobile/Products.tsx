import { useState } from 'react'
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
} from 'lucide-react'
import {
  supabase,
  getProductImageUrl,
  uploadProductImage,
  deleteProductImage,
} from '@/lib/supabase'
import type { Product, Category as CategoryType, Tag as TagType } from '@/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent } from '@/components/ui/card'
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
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')
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

  const { data: products, isLoading } = useQuery({
    queryKey: ['products', search, categoryFilter],
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
      if (search) {
        query = query.or(
          `name.ilike.%${search}%,sku.ilike.%${search}%,barcode.ilike.%${search}%,category.ilike.%${search}%`,
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
          image_path: imagePath,
          description: data.description || null,
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
      // 错误已在 mutation 中处理
    }
  }

  const getProductTags = (product: ProductWithTags) => {
    if (!product.tags) return []
    return product.tags.map((pt) => pt.tags).filter(Boolean)
  }

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
        <Button size="sm" onClick={openCreate} className="h-9">
          <Plus className="h-4 w-4" />
        </Button>
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
        ) : products?.length === 0 ? (
          <div className="text-center py-16">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted mx-auto mb-3">
              <ImagePlus className="h-8 w-8 text-muted-foreground/50" />
            </div>
            <div className="text-muted-foreground text-sm mb-3">暂无产品</div>
            <Button size="sm" onClick={openCreate}>
              <Plus className="h-4 w-4 mr-1" />
              新增产品
            </Button>
          </div>
        ) : (
          products?.map((p) => {
            const productTags = getProductTags(p)
            return (
              <Card key={p.id}>
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
                        <div className="font-medium text-sm truncate flex-1">{p.name}</div>
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
                      </div>
                      <div className="mt-1 flex flex-wrap gap-1 text-xs text-muted-foreground">
                        {p.sku && <span className="font-mono">SKU: {p.sku}</span>}
                        {p.barcode && <span className="font-mono">条码: {p.barcode}</span>}
                        {p.category && <span>分类: {p.category}</span>}
                      </div>
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
