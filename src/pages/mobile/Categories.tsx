import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  Plus,
  Edit2,
  Trash2,
  FolderOpen,
  ArrowLeft,
  Package,
  ChevronDown,
  ChevronUp,
  ImagePlus,
} from 'lucide-react'
import { supabase, getProductImageUrl } from '@/lib/supabase'
import type { Category, Product } from '@/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

interface CategoryForm {
  name: string
  parent_id: string
}

const emptyForm: CategoryForm = { name: '', parent_id: '' }

interface CategoryWithStats extends Category {
  product_count: number
  stock_total: number
}

export default function MobileCategories() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<Category | null>(null)
  const [form, setForm] = useState<CategoryForm>(emptyForm)
  const [submitting, setSubmitting] = useState(false)
  const [activeCategory, setActiveCategory] = useState<Category | null>(null)
  const [productsExpanded, setProductsExpanded] = useState(true)

  const { data: categories, isLoading } = useQuery({
    queryKey: ['categories'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('categories')
        .select('*')
        .order('sort_order', { ascending: false })
        .order('created_at', { ascending: false })
      if (error) throw error
      return data as Category[]
    },
  })

  const { data: categoryStats } = useQuery({
    queryKey: ['category-stats'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('products')
        .select('category, id, inventory(quantity)')
      if (error) throw error
      return data as (
        | { category: string | null; id: string; inventory: { quantity: number }[] }[]
      )
    },
  })

  const categoriesWithStats: CategoryWithStats[] = (categories || []).map((c) => {
    const productsInCat = (categoryStats || []).filter((p) => p.category === c.name)
    const productCount = productsInCat.length
    const stockTotal = productsInCat.reduce((sum, p) => {
      return sum + p.inventory.reduce((s, i) => s + Number(i.quantity), 0)
    }, 0)
    return { ...c, product_count: productCount, stock_total: stockTotal }
  })

  const { data: categoryProducts } = useQuery({
    queryKey: ['category-products', activeCategory?.id],
    enabled: !!activeCategory,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('products')
        .select('*, inventory(quantity, location(code, warehouse(code, name)))')
        .eq('category', activeCategory!.name)
        .order('created_at', { ascending: false })
      if (error) throw error
      return data as (Product & {
        inventory: {
          quantity: number
          location: { code: string; warehouse: { code: string; name: string | null } }
        }[]
      })[]
    },
  })

  const createMutation = useMutation({
    mutationFn: async (data: CategoryForm) => {
      const { error } = await supabase.from('categories').insert({
        name: data.name,
        parent_id: data.parent_id || null,
      })
      if (error) throw error
    },
    onSuccess: () => {
      toast.success('分类创建成功')
      queryClient.invalidateQueries({ queryKey: ['categories'] })
      setDialogOpen(false)
      setForm(emptyForm)
    },
    onError: (err: any) => toast.error(err.message || '创建失败'),
  })

  const updateMutation = useMutation({
    mutationFn: async (data: { id: string; form: CategoryForm }) => {
      const { error } = await supabase
        .from('categories')
        .update({
          name: data.form.name,
          parent_id: data.form.parent_id || null,
        })
        .eq('id', data.id)
      if (error) throw error
    },
    onSuccess: () => {
      toast.success('分类更新成功')
      queryClient.invalidateQueries({ queryKey: ['categories'] })
      setDialogOpen(false)
      setEditing(null)
      setForm(emptyForm)
    },
    onError: (err: any) => toast.error(err.message || '更新失败'),
  })

  const deleteMutation = useMutation({
    mutationFn: async (category: Category) => {
      const { error } = await supabase.from('categories').delete().eq('id', category.id)
      if (error) throw error
    },
    onSuccess: () => {
      toast.success('分类删除成功')
      queryClient.invalidateQueries({ queryKey: ['categories'] })
      if (activeCategory) setActiveCategory(null)
    },
    onError: (err: any) => toast.error(err.message || '删除失败'),
  })

  const openCreate = () => {
    setEditing(null)
    setForm(emptyForm)
    setDialogOpen(true)
  }

  const openEdit = (c: Category) => {
    setEditing(c)
    setForm({ name: c.name, parent_id: c.parent_id || '' })
    setDialogOpen(true)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    try {
      if (editing) {
        await updateMutation.mutateAsync({ id: editing.id, form })
      } else {
        await createMutation.mutateAsync(form)
      }
    } finally {
      setSubmitting(false)
    }
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
        <h1 className="font-bold text-base flex-1">分类管理</h1>
        <Button size="sm" onClick={openCreate} className="h-9">
          <Plus className="h-4 w-4" />
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* 分类列表 */}
        <div className="p-3 space-y-2">
          {isLoading ? (
            <div className="text-center py-12 text-muted-foreground text-sm">加载中...</div>
          ) : categoriesWithStats.length === 0 ? (
            <div className="text-center py-16">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted mx-auto mb-3">
                <FolderOpen className="h-8 w-8 text-muted-foreground/50" />
              </div>
              <div className="text-muted-foreground text-sm mb-3">暂无分类</div>
              <Button size="sm" onClick={openCreate}>
                <Plus className="h-4 w-4 mr-1" />
                新增分类
              </Button>
            </div>
          ) : (
            categoriesWithStats.map((c) => {
              const isActive = activeCategory?.id === c.id
              return (
                <Card
                  key={c.id}
                  className={`cursor-pointer transition-all ${
                    isActive ? 'ring-2 ring-primary/50 border-primary/50' : ''
                  }`}
                  onClick={() => setActiveCategory(isActive ? null : c)}
                >
                  <CardContent className="p-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        <FolderOpen className="h-4 w-4 text-primary flex-shrink-0" />
                        <span className="font-medium text-sm truncate">{c.name}</span>
                      </div>
                      <div className="flex items-center gap-3 flex-shrink-0">
                        <div className="text-xs text-muted-foreground flex items-center gap-2">
                          <span className="inline-flex items-center gap-0.5">
                            <Package className="h-3 w-3" />
                            {c.product_count}
                          </span>
                          <span>{c.stock_total.toLocaleString()} 件</span>
                        </div>
                        <div
                          className="flex gap-0.5"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <button
                            onClick={() => openEdit(c)}
                            className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                          >
                            <Edit2 className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => {
                              if (confirm(`确定删除分类「${c.name}」吗？`)) {
                                deleteMutation.mutate(c)
                              }
                            }}
                            className="p-1.5 rounded-md hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )
            })
          )}
        </div>

        {/* 分类下产品 */}
        {activeCategory && (
          <div className="border-t bg-background">
            <button
              onClick={() => setProductsExpanded(!productsExpanded)}
              className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-muted/30 transition-colors"
            >
              <div className="flex items-center gap-2 text-sm font-medium">
                <Package className="h-4 w-4 text-primary" />
                {activeCategory.name} - 产品
                {categoryProducts && (
                  <span className="text-xs text-muted-foreground font-normal">
                    共 {categoryProducts.length} 个
                  </span>
                )}
              </div>
              {productsExpanded ? (
                <ChevronUp className="h-4 w-4 text-muted-foreground" />
              ) : (
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              )}
            </button>

            {productsExpanded && (
              <div className="px-3 pb-3 space-y-2">
                {categoryProducts?.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground text-sm">
                    该分类下暂无产品
                  </div>
                ) : (
                  categoryProducts?.map((p) => {
                    const totalQty = p.inventory.reduce((s, i) => s + Number(i.quantity), 0)
                    return (
                      <Card key={p.id}>
                        <CardContent className="p-2.5">
                          <div className="flex items-center gap-2.5">
                            {p.image_path ? (
                              <img
                                src={getProductImageUrl(p.image_path)}
                                alt={p.name}
                                className="h-10 w-10 rounded object-cover flex-shrink-0"
                              />
                            ) : (
                              <div className="h-10 w-10 rounded bg-muted flex items-center justify-center flex-shrink-0">
                                <ImagePlus className="h-4 w-4 text-muted-foreground/50" />
                              </div>
                            )}
                            <div className="flex-1 min-w-0">
                              <div className="font-medium text-sm truncate">{p.name}</div>
                              <div className="text-xs text-muted-foreground font-mono">
                                {p.sku || '-'}
                              </div>
                            </div>
                            <div className="text-right flex-shrink-0">
                              <div className="text-sm font-semibold">
                                {totalQty.toLocaleString()} {p.unit}
                              </div>
                              <div className="text-[10px] text-muted-foreground">
                                {p.inventory.length} 个库位
                              </div>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    )
                  })
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* 分类对话框 */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md p-0">
          <form onSubmit={handleSubmit}>
            <DialogHeader className="px-4 pt-4">
              <DialogTitle>{editing ? '编辑分类' : '新增分类'}</DialogTitle>
              <DialogDescription>填写分类信息</DialogDescription>
            </DialogHeader>
            <div className="space-y-3 p-4">
              <div className="space-y-2">
                <Label htmlFor="m-cat-name">分类名称 *</Label>
                <Input
                  id="m-cat-name"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  required
                  placeholder="如：电子产品"
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
                {submitting ? '保存中...' : editing ? '保存修改' : '创建分类'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
