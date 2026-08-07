import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Plus, Edit2, Trash2, Package, AlertTriangle, AlertOctagon } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import type { Material } from '@/types'
import { useAuthStore } from '@/store/auth'
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

interface MaterialForm {
  name: string
  spec: string
}

const emptyForm: MaterialForm = { name: '', spec: '' }

export default function MaterialsPage() {
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
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">物料管理</h2>
          <p className="text-sm text-muted-foreground">
            维护物料清单，可手动标记缺货（显示红色高亮）
          </p>
        </div>
        {canWrite() && (
          <Button onClick={openCreate}>
            <Plus className="mr-2 h-4 w-4" />
            新增物料
          </Button>
        )}
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <div className="rounded-md border p-4">
          <div className="text-muted-foreground text-xs mb-1">物料总数</div>
          <div className="flex items-center gap-2">
            <Package className="h-5 w-5 text-blue-500" />
            <div className="text-2xl font-bold">{counts?.total ?? '-'}</div>
          </div>
        </div>
        <div className="rounded-md border p-4 border-red-200 bg-red-50/50">
          <div className="text-muted-foreground text-xs mb-1">缺货标记数</div>
          <div className="flex items-center gap-2">
            <AlertOctagon className="h-5 w-5 text-red-600" />
            <div className="text-2xl font-bold text-red-700">{counts?.marked ?? '-'}</div>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 max-w-md">
          <Input
            placeholder="搜索物料名称 / 规格"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <label className="inline-flex items-center gap-2 text-sm cursor-pointer select-none">
          <input
            type="checkbox"
            checked={showOnlyMarked}
            onChange={(e) => setShowOnlyMarked(e.target.checked)}
            className="h-4 w-4 rounded border-input"
          />
          只看缺货标记
        </label>
      </div>

      <div className="rounded-md border bg-background">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>物料名称</TableHead>
              <TableHead>规格</TableHead>
              <TableHead>缺货状态</TableHead>
              <TableHead>更新时间</TableHead>
              <TableHead className="w-32 text-right">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                  加载中...
                </TableCell>
              </TableRow>
            ) : materials?.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                  {search || showOnlyMarked ? '没有符合条件的物料' : '暂无物料，点击右上角新增'}
                </TableCell>
              </TableRow>
            ) : (
              materials?.map((m) => (
                <TableRow
                  key={m.id}
                  className={m.is_out_of_stock_marked ? 'bg-red-100/70' : ''}
                >
                  <TableCell className="font-medium flex items-center gap-2">
                    {m.is_out_of_stock_marked && (
                      <AlertTriangle className="h-4 w-4 text-red-600 flex-shrink-0" />
                    )}
                    <span className={m.is_out_of_stock_marked ? 'text-red-900 font-semibold' : ''}>
                      {m.name}
                    </span>
                  </TableCell>
                  <TableCell>{m.spec || '-'}</TableCell>
                  <TableCell>
                    {canWrite() ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className={
                          m.is_out_of_stock_marked
                            ? 'border-red-300 bg-red-50 text-red-700 hover:bg-red-100'
                            : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-100'
                        }
                        onClick={() =>
                          toggleMarkedMutation.mutate({ id: m.id, value: !m.is_out_of_stock_marked })
                        }
                      >
                        {m.is_out_of_stock_marked ? '缺货' : '正常'}
                      </Button>
                    ) : m.is_out_of_stock_marked ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-red-100 text-red-700 font-medium">
                        <AlertTriangle className="h-3 w-3" />
                        缺货
                      </span>
                    ) : (
                      <span className="inline-flex px-2 py-0.5 rounded-full text-xs bg-gray-100 text-gray-600">
                        正常
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {new Date(m.updated_at).toLocaleString('zh-CN')}
                  </TableCell>
                  <TableCell className="text-right">
                    {canWrite() ? (
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="icon" onClick={() => openEdit(m)}>
                          <Edit2 className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-destructive"
                          onClick={() => {
                            if (confirm(`确定删除物料「${m.name}」吗？`)) {
                              deleteMutation.mutate(m)
                            }
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground">只读</span>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <form onSubmit={handleSubmit}>
            <DialogHeader>
              <DialogTitle>{editing ? '编辑物料' : '新增物料'}</DialogTitle>
              <DialogDescription>填写物料的基本信息</DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="mat-name">物料名称 *</Label>
                <Input
                  id="mat-name"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  required
                  placeholder="如：螺丝 M4x10"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="mat-spec">规格 *</Label>
                <Input
                  id="mat-spec"
                  value={form.spec}
                  onChange={(e) => setForm({ ...form, spec: e.target.value })}
                  required
                  placeholder="如：不锈钢 / 碳钢 镀锌"
                />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                取消
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting ? '保存中...' : editing ? '保存修改' : '创建物料'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
