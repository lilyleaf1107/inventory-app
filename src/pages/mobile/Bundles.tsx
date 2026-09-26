import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  ArrowLeft,
  Boxes,
  Plus,
  Search,
  Edit2,
  Trash2,
  X,
  Package,
  ScanLine,
} from 'lucide-react'
import { supabase, getProductImageUrl } from '@/lib/supabase'
import { useAuthStore } from '@/store/auth'
import type { ProductBundle, ProductBundleItem, Product } from '@/types'
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
import ProductPicker from '@/components/ProductPicker'

interface BundleForm {
  name: string
  code: string
  remark: string
}
const emptyForm: BundleForm = { name: '', code: '', remark: '' }

export default function MobileBundles() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { canWrite } = useAuthStore()
  const [search, setSearch] = useState('')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<ProductBundle | null>(null)
  const [form, setForm] = useState<BundleForm>(emptyForm)
  const [items, setItems] = useState<ProductBundleItem[]>([])
  const [pickerOpen, setPickerOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const { data: bundles = [], isLoading } = useQuery({
    queryKey: ['product-bundles'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('product_bundles')
        .select(`
          *,
          product_bundle_items (
            id, bundle_id, product_id, quantity, created_at,
            product:products ( id, name, sku, barcode, unit, image_path, track_qty )
          )
        `)
        .order('created_at', { ascending: false })
      if (error) throw error
      return data as (ProductBundle & { product_bundle_items: ProductBundleItem[] })[]
    },
  })

  const filtered = useMemo(() => {
    if (!search.trim()) return bundles
    const kw = search.trim().toLowerCase()
    return bundles.filter(
      (b) =>
        b.name.toLowerCase().includes(kw) ||
        b.code.toLowerCase().includes(kw),
    )
  }, [bundles, search])

  const handleOpenNew = () => {
    setEditing(null)
    setForm(emptyForm)
    setItems([])
    setDialogOpen(true)
  }

  const handleEdit = (bundle: ProductBundle & { product_bundle_items: ProductBundleItem[] }) => {
    setEditing(bundle)
    setForm({ name: bundle.name, code: bundle.code, remark: bundle.remark || '' })
    setItems(bundle.product_bundle_items || [])
    setDialogOpen(true)
  }

  const handleSave = async () => {
    if (!form.name.trim()) return toast.warning('请输入组合名称')
    if (!form.code.trim()) return toast.warning('请输入组合编码')
    if (items.length === 0) return toast.warning('请至少添加一个产品')
    setSubmitting(true)
    try {
      if (editing) {
        const { error: upErr } = await supabase
          .from('product_bundles')
          .update({
            name: form.name.trim(),
            code: form.code.trim(),
            remark: form.remark.trim() || null,
          })
          .eq('id', editing.id)
        if (upErr) throw upErr
        const { error: delErr } = await supabase
          .from('product_bundle_items')
          .delete()
          .eq('bundle_id', editing.id)
        if (delErr) throw delErr
        const rows = items.map((i) => ({
          bundle_id: editing.id,
          product_id: i.product_id,
          quantity: i.quantity,
        }))
        const { error: insErr } = await supabase
          .from('product_bundle_items')
          .insert(rows)
        if (insErr) throw insErr
        toast.success('组合已更新')
      } else {
        const { data: bundle, error: crErr } = await supabase
          .from('product_bundles')
          .insert({
            name: form.name.trim(),
            code: form.code.trim(),
            remark: form.remark.trim() || null,
          })
          .select()
          .single()
        if (crErr) throw crErr
        const rows = items.map((i) => ({
          bundle_id: bundle.id,
          product_id: i.product_id,
          quantity: i.quantity,
        }))
        const { error: insErr } = await supabase
          .from('product_bundle_items')
          .insert(rows)
        if (insErr) throw insErr
        toast.success('组合已创建')
      }
      queryClient.invalidateQueries({ queryKey: ['product-bundles'] })
      setDialogOpen(false)
    } catch (err: any) {
      toast.error(err.message || '保存失败')
    } finally {
      setSubmitting(false)
    }
  }

  const handleDelete = async (bundle: ProductBundle) => {
    if (!confirm(`确认删除组合「${bundle.name}」？`)) return
    const { error } = await supabase
      .from('product_bundles')
      .delete()
      .eq('id', bundle.id)
    if (error) return toast.error(error.message)
    toast.success('组合已删除')
    queryClient.invalidateQueries({ queryKey: ['product-bundles'] })
  }

  const handlePickProduct = (p: Product) => {
    if (items.find((i) => i.product_id === p.id)) {
      return toast.warning(`「${p.name}」已在组合中`)
    }
    setItems((prev) => [
      ...prev,
      {
        id: Math.random().toString(36).slice(2),
        bundle_id: editing?.id || '',
        product_id: p.id,
        quantity: 1,
        created_at: new Date().toISOString(),
        product: p,
      },
    ])
  }

  const updateItemQty = (productId: string, qty: number) => {
    const v = Math.max(1, Math.floor(qty || 1))
    setItems((prev) =>
      prev.map((i) => (i.product_id === productId ? { ...i, quantity: v } : i)),
    )
  }

  const removeItem = (productId: string) => {
    setItems((prev) => prev.filter((i) => i.product_id !== productId))
  }

  return (
    <div className="flex flex-col h-full">
      {/* 顶部 */}
      <div className="flex items-center gap-2 px-3 py-2 border-b bg-background flex-shrink-0">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)} className="h-9 w-9 -ml-1.5">
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1 min-w-0">
          <h1 className="font-bold text-base flex items-center gap-1.5">
            <Boxes className="h-4 w-4 text-indigo-600" />
            组合管理
          </h1>
          <p className="text-[11px] text-muted-foreground truncate">扫组合码一次性出库多个产品</p>
        </div>
        {canWrite() && (
          <Button size="sm" onClick={handleOpenNew} className="bg-indigo-600 hover:bg-indigo-700 text-xs">
            <Plus className="h-3.5 w-3.5 mr-1" /> 新建
          </Button>
        )}
      </div>

      {/* 滚动区 */}
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3 pb-20">
        {/* 搜索 */}
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="搜索组合..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 h-10"
          />
        </div>

        {/* 列表 */}
        {isLoading ? (
          <div className="text-center py-10 text-muted-foreground text-sm">加载中...</div>
        ) : filtered.length === 0 ? (
          <div className="border-2 border-dashed rounded-xl py-12 text-center text-muted-foreground bg-muted/30">
            <Boxes className="h-10 w-10 mx-auto mb-2 opacity-40 text-indigo-500" />
            <div className="text-sm font-medium">{search ? '没有匹配的组合' : '还没有组合'}</div>
          </div>
        ) : (
          filtered.map((b) => (
            <Card key={b.id} className="border-indigo-100">
              <CardContent className="p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="font-bold text-sm flex items-center gap-1.5">
                      <Boxes className="h-4 w-4 text-indigo-600 flex-shrink-0" />
                      <span className="truncate">{b.name}</span>
                    </div>
                    <div className="text-[11px] text-muted-foreground font-mono mt-0.5">
                      编码：{b.code}
                    </div>
                  </div>
                  {canWrite() && (
                    <div className="flex gap-1 flex-shrink-0">
                      <button onClick={() => handleEdit(b)} className="h-7 w-7 rounded-md hover:bg-indigo-50 flex items-center justify-center">
                        <Edit2 className="h-3.5 w-3.5 text-indigo-600" />
                      </button>
                      <button onClick={() => handleDelete(b)} className="h-7 w-7 rounded-md hover:bg-red-50 flex items-center justify-center">
                        <Trash2 className="h-3.5 w-3.5 text-red-500" />
                      </button>
                    </div>
                  )}
                </div>

                {b.remark && (
                  <div className="text-[11px] text-muted-foreground mt-1.5 line-clamp-2">{b.remark}</div>
                )}

                <div className="mt-2 space-y-1">
                  <div className="text-[11px] font-medium text-muted-foreground">
                    包含 {b.product_bundle_items?.length || 0} 个产品
                  </div>
                  {b.product_bundle_items?.map((item) => (
                    <div key={item.id} className="flex items-center gap-1.5 text-[11px] bg-indigo-50/50 rounded px-1.5 py-1">
                      {item.product?.image_path ? (
                        <img src={getProductImageUrl(item.product.image_path)} alt="" className="h-5 w-5 rounded object-cover flex-shrink-0" />
                      ) : (
                        <div className="h-5 w-5 rounded bg-muted flex items-center justify-center flex-shrink-0">
                          <Package className="h-2.5 w-2.5 text-muted-foreground" />
                        </div>
                      )}
                      <span className="flex-1 truncate font-medium">{item.product?.name || '未知'}</span>
                      <span className="font-bold text-indigo-700">×{item.quantity}</span>
                      <span className="text-muted-foreground">{item.product?.unit || ''}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      {/* 新建/编辑弹窗 */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <Boxes className="h-5 w-5 text-indigo-600" />
              {editing ? '编辑组合' : '新建组合'}
            </DialogTitle>
            <DialogDescription className="text-xs">
              {editing ? '修改组合信息' : '创建预设组合，扫码一次性出库'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">组合名称 *</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="如：标准套餐A"
                className="h-10"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">组合编码 *</Label>
              <Input
                value={form.code}
                onChange={(e) => setForm({ ...form, code: e.target.value })}
                placeholder="扫码或手填"
                className="h-10"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">备注（可选）</Label>
              <Textarea
                value={form.remark}
                onChange={(e) => setForm({ ...form, remark: e.target.value })}
                rows={2}
                placeholder="如：节日促销组合"
              />
            </div>

            {/* 产品明细 */}
            <div className="space-y-2 pt-2 border-t">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-medium">包含产品（{items.length}）</Label>
                <Button type="button" variant="outline" size="sm" className="text-xs h-8" onClick={() => setPickerOpen(true)}>
                  <Plus className="h-3 w-3 mr-1" /> 添加
                </Button>
              </div>
              {items.length === 0 ? (
                <div className="border-2 border-dashed rounded-lg py-6 text-center text-xs text-muted-foreground">
                  还没有添加产品
                </div>
              ) : (
                <div className="space-y-1.5 max-h-56 overflow-y-auto">
                  {items.map((item) => (
                    <div key={item.product_id} className="flex items-center gap-2 p-1.5 rounded-lg border bg-indigo-50/30">
                      {item.product?.image_path ? (
                        <img src={getProductImageUrl(item.product.image_path)} alt="" className="h-7 w-7 rounded object-cover flex-shrink-0" />
                      ) : (
                        <div className="h-7 w-7 rounded bg-muted flex items-center justify-center flex-shrink-0">
                          <Package className="h-3.5 w-3.5 text-muted-foreground" />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-medium truncate">{item.product?.name || '未知'}</div>
                        <div className="text-[10px] text-muted-foreground font-mono">{item.product?.sku || '-'}</div>
                      </div>
                      <div className="flex items-center gap-0.5 bg-white border rounded p-0.5">
                        <button
                          type="button"
                          onClick={() => updateItemQty(item.product_id, item.quantity - 1)}
                          disabled={item.quantity <= 1}
                          className="h-5 w-5 rounded text-xs font-bold text-indigo-700 disabled:opacity-40"
                        >−</button>
                        <input
                          type="number"
                          min="1"
                          value={item.quantity}
                          onChange={(e) => updateItemQty(item.product_id, parseInt(e.target.value, 10))}
                          className="w-8 border-none p-0 text-center text-xs font-bold bg-transparent outline-none"
                        />
                        <button
                          type="button"
                          onClick={() => updateItemQty(item.product_id, item.quantity + 1)}
                          className="h-5 w-5 rounded text-xs font-bold text-indigo-700"
                        >+</button>
                      </div>
                      <button
                        type="button"
                        onClick={() => removeItem(item.product_id)}
                        className="h-6 w-6 rounded text-red-500 hover:bg-red-50 flex-shrink-0"
                      >
                        <X className="h-3.5 w-3.5 mx-auto" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setDialogOpen(false)}>取消</Button>
            <Button size="sm" onClick={handleSave} disabled={submitting} className="bg-indigo-600 hover:bg-indigo-700">
              {submitting ? '保存中...' : '保存'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ProductPicker
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        onSelect={handlePickProduct}
      />
    </div>
  )
}
