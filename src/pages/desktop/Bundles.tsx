import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
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
import ProductPicker from '@/components/ProductPicker'

interface BundleForm {
  name: string
  code: string
  remark: string
}

const emptyForm: BundleForm = { name: '', code: '', remark: '' }

export default function BundlesPage() {
  const queryClient = useQueryClient()
  const { canWrite } = useAuthStore()
  const [search, setSearch] = useState('')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<ProductBundle | null>(null)
  const [form, setForm] = useState<BundleForm>(emptyForm)
  const [items, setItems] = useState<ProductBundleItem[]>([])
  const [pickerOpen, setPickerOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  // 加载所有组合 + 明细
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
        b.code.toLowerCase().includes(kw) ||
        (b.remark || '').toLowerCase().includes(kw),
    )
  }, [bundles, search])

  // 新建/编辑
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

  // 保存
  const handleSave = async () => {
    if (!form.name.trim()) {
      toast.warning('请输入组合名称')
      return
    }
    if (!form.code.trim()) {
      toast.warning('请输入组合编码')
      return
    }
    if (items.length === 0) {
      toast.warning('请至少添加一个产品')
      return
    }

    setSubmitting(true)
    try {
      if (editing) {
        // 更新
        const { error: upErr } = await supabase
          .from('product_bundles')
          .update({
            name: form.name.trim(),
            code: form.code.trim(),
            remark: form.remark.trim() || null,
          })
          .eq('id', editing.id)
        if (upErr) throw upErr

        // 先删旧明细，再插新明细
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
        // 新建
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

  // 删除
  const handleDelete = async (bundle: ProductBundle) => {
    if (!confirm(`确认删除组合「${bundle.name}」？组合内的产品关联将一并移除。`)) return
    const { error } = await supabase
      .from('product_bundles')
      .delete()
      .eq('id', bundle.id)
    if (error) {
      toast.error(error.message)
      return
    }
    toast.success('组合已删除')
    queryClient.invalidateQueries({ queryKey: ['product-bundles'] })
  }

  // 加产品到组合
  const handlePickProduct = (p: Product) => {
    const existing = items.find((i) => i.product_id === p.id)
    if (existing) {
      toast.warning(`「${p.name}」已在组合中`)
      return
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
    <div className="space-y-4">
      {/* 标题 */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Boxes className="h-6 w-6 text-indigo-600" />
            组合管理
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            预设组合 = 一个编码对应多个产品，扫组合码即可一次性加入全部产品到出库清单
          </p>
        </div>
        {canWrite() && (
          <Button onClick={handleOpenNew} className="bg-indigo-600 hover:bg-indigo-700">
            <Plus className="h-4 w-4 mr-1" />
            新建组合
          </Button>
        )}
      </div>

      {/* 搜索 */}
      <div className="relative max-w-sm">
        <Search className="absolute left-2.5 top-3 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="搜索组合名称 / 编码..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-8"
        />
      </div>

      {/* 列表 */}
      {isLoading ? (
        <div className="text-center py-10 text-muted-foreground">加载中...</div>
      ) : filtered.length === 0 ? (
        <div className="border-2 border-dashed rounded-xl py-14 text-center text-muted-foreground bg-muted/30">
          <Boxes className="h-12 w-12 mx-auto mb-3 opacity-40 text-indigo-500" />
          <div className="text-sm font-medium">
            {search ? '没有匹配的组合' : '还没有组合'}
          </div>
          <div className="text-xs mt-1 opacity-80">
            {canWrite() && '点击右上角"新建组合"创建第一个组合'}
          </div>
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {filtered.map((b) => (
            <div
              key={b.id}
              className="rounded-xl border bg-gradient-to-br from-white to-indigo-50/30 p-4 hover:shadow-md transition-shadow"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="font-bold text-base flex items-center gap-1.5">
                    <Boxes className="h-4 w-4 text-indigo-600 flex-shrink-0" />
                    <span className="truncate">{b.name}</span>
                  </div>
                  <div className="text-xs text-muted-foreground font-mono mt-0.5">
                    编码：{b.code}
                  </div>
                </div>
                {canWrite() && (
                  <div className="flex gap-1 flex-shrink-0">
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleEdit(b)}>
                      <Edit2 className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8 hover:text-red-500" onClick={() => handleDelete(b)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                )}
              </div>

              {b.remark && (
                <div className="text-xs text-muted-foreground mt-2 line-clamp-2">{b.remark}</div>
              )}

              {/* 产品明细 */}
              <div className="mt-3 space-y-1.5">
                <div className="text-xs font-medium text-muted-foreground">
                  包含 {b.product_bundle_items?.length || 0} 个产品：
                </div>
                {b.product_bundle_items?.map((item) => (
                  <div key={item.id} className="flex items-center gap-2 text-xs bg-indigo-50/50 rounded-md px-2 py-1.5">
                    {item.product?.image_path ? (
                      <img
                        src={getProductImageUrl(item.product.image_path)}
                        alt=""
                        className="h-6 w-6 rounded object-cover flex-shrink-0"
                      />
                    ) : (
                      <div className="h-6 w-6 rounded bg-muted flex items-center justify-center flex-shrink-0">
                        <Package className="h-3 w-3 text-muted-foreground" />
                      </div>
                    )}
                    <span className="flex-1 truncate font-medium">{item.product?.name || '未知产品'}</span>
                    <span className="font-bold text-indigo-700">×{item.quantity}</span>
                    <span className="text-muted-foreground">{item.product?.unit || ''}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 新建/编辑弹窗 */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Boxes className="h-5 w-5 text-indigo-600" />
              {editing ? '编辑组合' : '新建组合'}
            </DialogTitle>
            <DialogDescription>
              {editing ? '修改组合信息和包含的产品' : '创建一个预设组合，扫组合码可一次性出库全部产品'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* 基本信息 */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-sm font-medium">组合名称 *</Label>
                <Input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="如：标准套餐A"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm font-medium">组合编码 *</Label>
                <div className="flex gap-2">
                  <Input
                    value={form.code}
                    onChange={(e) => setForm({ ...form, code: e.target.value })}
                    placeholder="扫码或手填，如 BUNDLE001"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="flex-shrink-0"
                    onClick={() => toast.info('请用扫码枪扫入编码到输入框')}
                    title="扫码枪直接在输入框扫入"
                  >
                    <ScanLine className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">备注（可选）</Label>
              <Textarea
                value={form.remark}
                onChange={(e) => setForm({ ...form, remark: e.target.value })}
                rows={2}
                placeholder="如：节日促销组合、常见搭配等"
              />
            </div>

            {/* 产品明细 */}
            <div className="space-y-2 pt-2 border-t">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-medium">
                  包含产品（{items.length}）
                </Label>
                <Button type="button" variant="outline" size="sm" onClick={() => setPickerOpen(true)}>
                  <Plus className="h-3.5 w-3.5 mr-1" />
                  添加产品
                </Button>
              </div>

              {items.length === 0 ? (
                <div className="border-2 border-dashed rounded-lg py-8 text-center text-sm text-muted-foreground">
                  还没有添加产品，点击"添加产品"按钮
                </div>
              ) : (
                <div className="space-y-1.5 max-h-64 overflow-y-auto">
                  {items.map((item) => (
                    <div
                      key={item.product_id}
                      className="flex items-center gap-2 p-2 rounded-lg border bg-indigo-50/30"
                    >
                      {item.product?.image_path ? (
                        <img
                          src={getProductImageUrl(item.product.image_path)}
                          alt=""
                          className="h-8 w-8 rounded object-cover flex-shrink-0"
                        />
                      ) : (
                        <div className="h-8 w-8 rounded bg-muted flex items-center justify-center flex-shrink-0">
                          <Package className="h-4 w-4 text-muted-foreground" />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate">{item.product?.name || '未知'}</div>
                        <div className="text-[11px] text-muted-foreground font-mono">
                          {item.product?.sku || '-'} · {item.product?.unit || ''}
                        </div>
                      </div>
                      <div className="flex items-center gap-1 bg-white border rounded-md p-0.5">
                        <button
                          type="button"
                          onClick={() => updateItemQty(item.product_id, item.quantity - 1)}
                          disabled={item.quantity <= 1}
                          className="h-6 w-6 rounded hover:bg-indigo-100 disabled:opacity-40 font-bold text-indigo-700"
                        >
                          −
                        </button>
                        <Input
                          type="number"
                          min="1"
                          value={item.quantity}
                          onChange={(e) => updateItemQty(item.product_id, parseInt(e.target.value, 10))}
                          className="h-6 w-14 border-none shadow-none p-0 text-center text-sm font-bold"
                        />
                        <button
                          type="button"
                          onClick={() => updateItemQty(item.product_id, item.quantity + 1)}
                          className="h-6 w-6 rounded hover:bg-indigo-100 font-bold text-indigo-700"
                        >
                          +
                        </button>
                      </div>
                      <button
                        type="button"
                        onClick={() => removeItem(item.product_id)}
                        className="h-7 w-7 rounded-md text-red-500 hover:bg-red-50 flex-shrink-0"
                      >
                        <X className="h-4 w-4 mx-auto" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              取消
            </Button>
            <Button onClick={handleSave} disabled={submitting} className="bg-indigo-600 hover:bg-indigo-700">
              {submitting ? '保存中...' : '保存'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 产品选择器 */}
      <ProductPicker
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        onSelect={handlePickProduct}
      />
    </div>
  )
}
