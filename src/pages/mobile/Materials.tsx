import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  Plus,
  Search,
  Edit2,
  Trash2,
  X,
  ArrowLeft,
  Package,
  AlertTriangle,
  AlertOctagon,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import type { Material } from '@/types'
import { useAuthStore } from '@/store/auth'
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

interface MaterialForm {
  name: string
  spec: string
}

const emptyForm: MaterialForm = { name: '', spec: '' }

export default function MobileMaterials() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { canWrite } = useAuthStore()
  const [search, setSearch] = useState('')
  const [showOnlyMarked, setShowOnlyMarked] = useState(false)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<Material | null>(null)
  const [form, setForm] = useState<MaterialForm>(emptyForm)
  const [submitting, setSubmitting] = useState(false)

  const { data: materials, isLoading } = useQuery({
    queryKey: ['materials', search, showOnlyMarked],
    queryFn: async () => {
      let query = supabase
        .from('materials')
        .select('*')
        .order('is_out_of_stock_marked', { ascending: false })
        .order('updated_at', { ascending: false })
      if (search) {
        query = query.or(`name.ilike.%${search}%,spec.ilike.%${search}%`)
      }
      if (showOnlyMarked) {
        query = query.eq('is_out_of_stock_marked', true)
      }
      const { data, error } = await query
      if (error) throw error
      return data as Material[]
    },
  })

  const { data: counts } = useQuery({
    queryKey: ['materials-counts'],
    queryFn: async () => {
      const { count: total, error: totalError } = await supabase
        .from('materials')
        .select('*', { count: 'exact', head: true })
      if (totalError) throw totalError
      const { count: marked, error: markedError } = await supabase
        .from('materials')
        .select('*', { count: 'exact', head: true })
        .eq('is_out_of_stock_marked', true)
      if (markedError) throw markedError
      return { total: total || 0, marked: marked || 0 }
    },
  })

  const createMutation = useMutation({
    mutationFn: async (data: MaterialForm) => {
      const { error } = await supabase.from('materials').insert({
        name: data.name.trim(),
        spec: data.spec.trim() || null,
      })
      if (error) throw error
    },
    onSuccess: () => {
      toast.success('物料创建成功')
      queryClient.invalidateQueries({ queryKey: ['materials'] })
      queryClient.invalidateQueries({ queryKey: ['materials-counts'] })
      setDialogOpen(false)
      setForm(emptyForm)
    },
    onError: (err: any) => toast.error(err.message || '创建失败'),
  })

  const updateMutation = useMutation({
    mutationFn: async (data: { id: string; form: MaterialForm }) => {
      const { error } = await supabase
        .from('materials')
        .update({
          name: data.form.name.trim(),
          spec: data.form.spec.trim() || null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', data.id)
      if (error) throw error
    },
    onSuccess: () => {
      toast.success('物料更新成功')
      queryClient.invalidateQueries({ queryKey: ['materials'] })
      setDialogOpen(false)
      setEditing(null)
      setForm(emptyForm)
    },
    onError: (err: any) => toast.error(err.message || '更新失败'),
  })

  const deleteMutation = useMutation({
    mutationFn: async (material: Material) => {
      const { error } = await supabase.from('materials').delete().eq('id', material.id)
      if (error) throw error
    },
    onSuccess: () => {
      toast.success('物料删除成功')
      queryClient.invalidateQueries({ queryKey: ['materials'] })
      queryClient.invalidateQueries({ queryKey: ['materials-counts'] })
    },
    onError: (err: any) => toast.error(err.message || '删除失败'),
  })

  const toggleMarkedMutation = useMutation({
    mutationFn: async ({ id, value }: { id: string; value: boolean }) => {
      const { error } = await supabase
        .from('materials')
        .update({
          is_out_of_stock_marked: value,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['materials'] })
      queryClient.invalidateQueries({ queryKey: ['materials-counts'] })
    },
    onError: (err: any) => toast.error(err.message || '状态更新失败'),
  })

  const openCreate = () => {
    setEditing(null)
    setForm(emptyForm)
    setDialogOpen(true)
  }

  const openEdit = (m: Material) => {
    setEditing(m)
    setForm({ name: m.name, spec: m.spec || '' })
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
      <div className="flex items-center gap-2 px-4 py-3 border-b bg-background flex-shrink-0">
        <button
          onClick={() => navigate(-1)}
          className="p-1.5 -ml-1.5 rounded-lg hover:bg-muted transition-colors"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <h1 className="font-bold text-base flex-1">物料管理</h1>
        {canWrite() && (
          <Button size="sm" onClick={openCreate} className="h-9">
            <Plus className="h-4 w-4" />
          </Button>
        )}
      </div>

      <div className="px-4 py-3 border-b bg-background flex-shrink-0 space-y-2">
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-md border p-3">
            <div className="text-muted-foreground text-[11px] mb-1">总数</div>
            <div className="flex items-center gap-1">
              <Package className="h-4 w-4 text-blue-500" />
              <span className="text-lg font-bold">{counts?.total ?? '-'}</span>
            </div>
          </div>
          <div className="rounded-md border p-3 border-red-200 bg-red-50/50">
            <div className="text-muted-foreground text-[11px] mb-1">缺货</div>
            <div className="flex items-center gap-1">
              <AlertOctagon className="h-4 w-4 text-red-600" />
              <span className="text-lg font-bold text-red-700">{counts?.marked ?? '-'}</span>
            </div>
          </div>
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="搜索名称 / 规格"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-10"
          />
        </div>
        <label className="inline-flex items-center gap-2 text-sm cursor-pointer">
          <input
            type="checkbox"
            checked={showOnlyMarked}
            onChange={(e) => setShowOnlyMarked(e.target.checked)}
            className="h-4 w-4 rounded border-input"
          />
          只看缺货标记
        </label>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {isLoading ? (
          <div className="text-center py-12 text-muted-foreground text-sm">加载中...</div>
        ) : materials?.length === 0 ? (
          <div className="text-center py-16">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted mx-auto mb-3">
              <Package className="h-8 w-8 text-muted-foreground/50" />
            </div>
            <div className="text-muted-foreground text-sm mb-3">
              {search || showOnlyMarked ? '没有符合条件的物料' : '暂无物料'}
            </div>
            {canWrite() && !search && !showOnlyMarked && (
              <Button size="sm" onClick={openCreate}>
                <Plus className="h-4 w-4 mr-1" />
                新增物料
              </Button>
            )}
          </div>
        ) : (
          materials?.map((m) => (
            <Card
              key={m.id}
              className={m.is_out_of_stock_marked ? 'border-red-200 bg-red-100/60' : ''}
            >
              <CardContent className="p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm flex items-center gap-1.5">
                      {m.is_out_of_stock_marked && (
                        <AlertTriangle className="h-4 w-4 text-red-600 flex-shrink-0" />
                      )}
                      <span className={m.is_out_of_stock_marked ? 'text-red-900 font-semibold' : ''}>
                        {m.name}
                      </span>
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      规格: {m.spec || '-'}
                    </div>
                    <div className="text-[11px] text-muted-foreground mt-1">
                      更新: {new Date(m.updated_at).toLocaleString('zh-CN')}
                    </div>
                  </div>
                  {canWrite() && (
                    <div className="flex gap-0.5 flex-shrink-0">
                      <button
                        onClick={() => openEdit(m)}
                        className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                      >
                        <Edit2 className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => {
                          if (confirm(`确定删除「${m.name}」吗？`)) deleteMutation.mutate(m)
                        }}
                        className="p-1.5 rounded-md hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  )}
                </div>
                <div className="mt-2">
                  {canWrite() ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className={`w-full h-8 text-xs ${
                        m.is_out_of_stock_marked
                          ? 'border-red-300 bg-red-50 text-red-700 hover:bg-red-100'
                          : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-100'
                      }`}
                      onClick={() =>
                        toggleMarkedMutation.mutate({ id: m.id, value: !m.is_out_of_stock_marked })
                      }
                    >
                      {m.is_out_of_stock_marked ? '取消缺货标红' : '一键缺货标红'}
                    </Button>
                  ) : m.is_out_of_stock_marked ? (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs bg-red-100 text-red-700 font-medium w-full justify-center">
                      <AlertTriangle className="h-3 w-3" />
                      缺货
                    </span>
                  ) : (
                    <span className="inline-flex px-2 py-0.5 rounded text-xs bg-gray-100 text-gray-600 w-full justify-center">
                      正常
                    </span>
                  )}
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md p-0">
          <form onSubmit={handleSubmit}>
            <DialogHeader className="px-4 pt-4">
              <DialogTitle>{editing ? '编辑物料' : '新增物料'}</DialogTitle>
              <DialogDescription>物料名称和规格都为必填项</DialogDescription>
            </DialogHeader>
            <div className="space-y-3 p-4">
              <div className="space-y-2">
                <Label htmlFor="mm-name">物料名称 *</Label>
                <Input
                  id="mm-name"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  required
                  placeholder="如：螺丝 M4x10"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="mm-spec">规格 *</Label>
                <Input
                  id="mm-spec"
                  value={form.spec}
                  onChange={(e) => setForm({ ...form, spec: e.target.value })}
                  required
                  placeholder="如：不锈钢 / 碳钢镀锌"
                />
              </div>
            </div>
            <DialogFooter className="px-4 pb-4">
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)} size="sm">
                取消
              </Button>
              <Button type="submit" disabled={submitting} size="sm">
                {submitting ? '保存中...' : editing ? '保存修改' : '创建物料'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
