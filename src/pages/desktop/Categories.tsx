import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Plus, Edit2, Trash2, FolderOpen, ChevronRight, Tag, Package } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import type { Category, Product, Inventory } from '@/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
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
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ImagePlus } from 'lucide-react'
import { getProductImageUrl } from '@/lib/supabase'

interface CategoryForm {
  name: string
  parent_id: string
}

const emptyForm: CategoryForm = { name: '', parent_id: '' }

interface CategoryWithStats extends Category {
  product_count: number
  stock_total: number
}

export default function CategoriesPage() {
  const queryClient = useQueryClient()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<Category | null>(null)
  const [form, setForm] = useState<CategoryForm>(emptyForm)
  const [submitting, setSubmitting] = useState(false)
  const [activeCategory, setActiveCategory] = useState<Category | null>(null)

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
      return data as ({ category: string | null; id: string; inventory: { quantity: number }[] }[])
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
        inventory: { quantity: number; location: { code: string; warehouse: { code: string; name: string | null } } }[]
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
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">分类管理</h2>
          <p className="text-sm text-muted-foreground">管理产品分类，查看分类下的产品</p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="mr-2 h-4 w-4" />
          新增分类
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {/* 分类列表 */}
        <div className="rounded-md border bg-background">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>分类名称</TableHead>
                <TableHead>产品数</TableHead>
                <TableHead>库存总量</TableHead>
                <TableHead className="w-24 text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                    加载中...
                  </TableCell>
                </TableRow>
              ) : categoriesWithStats.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                    暂无分类，点击右上角新增
                  </TableCell>
                </TableRow>
              ) : (
                categoriesWithStats.map((c) => (
                  <TableRow
                    key={c.id}
                    className={`cursor-pointer ${
                      activeCategory?.id === c.id ? 'bg-primary/5' : ''
                    }`}
                    onClick={() => setActiveCategory(c)}
                  >
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        <FolderOpen className="h-4 w-4 text-muted-foreground" />
                        {c.name}
                        <ChevronRight className="h-3 w-3 text-muted-foreground" />
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className="inline-flex items-center gap-1">
                        <Package className="h-3 w-3 text-muted-foreground" />
                        {c.product_count}
                      </span>
                    </TableCell>
                    <TableCell className="text-sm">{c.stock_total.toLocaleString()}</TableCell>
                    <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="icon" onClick={() => openEdit(c)}>
                          <Edit2 className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-destructive"
                          onClick={() => {
                            if (confirm(`确定删除分类「${c.name}」吗？`)) {
                              deleteMutation.mutate(c)
                            }
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        {/* 分类下的产品 */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <Tag className="h-4 w-4" />
              {activeCategory ? `${activeCategory.name} - 产品` : '分类产品'}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {!activeCategory ? (
              <div className="text-center py-12 text-muted-foreground text-sm">
                点击左侧分类查看产品
              </div>
            ) : categoryProducts?.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground text-sm">
                该分类下暂无产品
              </div>
            ) : (
              <div className="space-y-2 max-h-[500px] overflow-y-auto">
                {categoryProducts?.map((p) => {
                  const totalQty = p.inventory.reduce((s, i) => s + Number(i.quantity), 0)
                  return (
                    <div
                      key={p.id}
                      className="flex items-center gap-3 p-2 rounded-md border"
                    >
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
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm truncate">{p.name}</div>
                        <div className="text-xs text-muted-foreground font-mono">
                          {p.sku || '-'}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-semibold">
                          库存: {totalQty.toLocaleString()} {p.unit}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {p.inventory.length} 个库位
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* 分类对话框 */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <form onSubmit={handleSubmit}>
            <DialogHeader>
              <DialogTitle>{editing ? '编辑分类' : '新增分类'}</DialogTitle>
              <DialogDescription>填写分类信息</DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="cat-name">分类名称 *</Label>
                <Input
                  id="cat-name"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  required
                  placeholder="如：电子产品"
                />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                取消
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting ? '保存中...' : editing ? '保存修改' : '创建分类'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
