import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Plus, Edit2, Trash2, MapPin, Pin, PinOff, ChevronLeft, ChevronRight, Package } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import type { Warehouse, Location } from '@/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
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

interface WarehouseForm {
  code: string
  name: string
  address: string
}

interface LocationForm {
  zone: string
  rack: string
  level: string
  position: string
  description: string
}

const emptyWh: WarehouseForm = { code: '', name: '', address: '' }
const emptyLoc: LocationForm = { zone: 'A', rack: '', level: '', position: '', description: '' }

const ZONES = ['A', 'B', 'C', 'D', 'E', 'F']

// 根据四级输入生成库位编码
function genLocCode(f: LocationForm): string {
  const pad = (s: string) => s.padStart(2, '0')
  return [f.zone, pad(f.rack), pad(f.level), pad(f.position)].filter(Boolean).join('-')
}

// 生成自动描述
function genLocDesc(f: LocationForm): string {
  const parts: string[] = []
  if (f.zone) parts.push(`${f.zone}区`)
  if (f.rack) parts.push(`${f.rack}号货架`)
  if (f.level) parts.push(`${f.level}层`)
  if (f.position) parts.push(`${f.position}位`)
  return parts.join(' ')
}

// 获取仓库显示名称：有名称用名称，没有则用编号
function getWhDisplayName(w: Warehouse): string {
  return w.name || w.code
}

export default function WarehousesPage() {
  const queryClient = useQueryClient()

  const [whDialogOpen, setWhDialogOpen] = useState(false)
  const [editingWh, setEditingWh] = useState<Warehouse | null>(null)
  const [whForm, setWhForm] = useState<WarehouseForm>(emptyWh)
  const [whSubmitting, setWhSubmitting] = useState(false)

  const [activeWh, setActiveWh] = useState<Warehouse | null>(null)
  const [whCollapsed, setWhCollapsed] = useState(false)
  const [locDialogOpen, setLocDialogOpen] = useState(false)
  const [editingLoc, setEditingLoc] = useState<Location | null>(null)
  const [locForm, setLocForm] = useState<LocationForm>(emptyLoc)
  const [locSubmitting, setLocSubmitting] = useState(false)

  const { data: warehouses, isLoading } = useQuery({
    queryKey: ['warehouses'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('warehouses')
        .select('*')
        .order('sort_order', { ascending: false, nullsFirst: false })
        .order('created_at', { ascending: false })
      if (error) throw error
      return data as Warehouse[]
    },
  })

  // 默认选中第一个仓库
  useEffect(() => {
    if (warehouses && warehouses.length > 0 && !activeWh) {
      setActiveWh(warehouses[0])
    }
  }, [warehouses, activeWh])

  const { data: locations } = useQuery({
    queryKey: ['locations', activeWh?.id],
    enabled: !!activeWh,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('locations')
        .select(`
          *,
          inventory (
            id, quantity,
            product:products ( id, name, sku, barcode )
          )
        `)
        .eq('warehouse_id', activeWh!.id)
        .order('code')
      if (error) throw error
      return data as (Location & {
          inventory?: {
            id: string
            quantity: number
            product: { id: string; name: string; sku: string | null; barcode: string | null } | null
          }[]
        })[]
    },
  })

  const createWh = useMutation({
    mutationFn: async (data: WarehouseForm) => {
      const { error } = await supabase.from('warehouses').insert({
        code: data.code,
        name: data.name || null,
        address: data.address || null,
      })
      if (error) throw error
    },
    onSuccess: () => {
      toast.success('仓库创建成功')
      queryClient.invalidateQueries({ queryKey: ['warehouses'] })
      setWhDialogOpen(false)
      setWhForm(emptyWh)
    },
    onError: (err: any) => toast.error(err.message || '创建失败'),
  })

  const updateWh = useMutation({
    mutationFn: async (data: { id: string; form: WarehouseForm }) => {
      const { error } = await supabase
        .from('warehouses')
        .update({
          code: data.form.code,
          name: data.form.name || null,
          address: data.form.address || null,
        })
        .eq('id', data.id)
      if (error) throw error
    },
    onSuccess: () => {
      toast.success('仓库更新成功')
      queryClient.invalidateQueries({ queryKey: ['warehouses'] })
      setWhDialogOpen(false)
      setEditingWh(null)
      setWhForm(emptyWh)
    },
    onError: (err: any) => toast.error(err.message || '更新失败'),
  })

  const deleteWh = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('warehouses').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      toast.success('仓库删除成功')
      queryClient.invalidateQueries({ queryKey: ['warehouses'] })
      if (activeWh) setActiveWh(null)
    },
    onError: (err: any) => toast.error(err.message || '删除失败'),
  })

  // 置顶/取消置顶
  const togglePin = useMutation({
    mutationFn: async (w: Warehouse) => {
      // 如果已经是置顶状态（sort_order > 0），取消置顶；否则置顶
      const newSort = w.sort_order > 0 ? 0 : 1
      const { error } = await supabase
        .from('warehouses')
        .update({ sort_order: newSort })
        .eq('id', w.id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['warehouses'] })
    },
    onError: (err: any) => toast.error(err.message || '操作失败'),
  })

  const createLoc = useMutation({
    mutationFn: async (data: LocationForm) => {
      const code = genLocCode(data)
      const description = data.description || genLocDesc(data)
      const { error } = await supabase.from('locations').insert({
        warehouse_id: activeWh!.id,
        code,
        zone: data.zone || null,
        rack: data.rack || null,
        level: data.level || null,
        position: data.position || null,
        description: description || null,
      })
      if (error) throw error
    },
    onSuccess: () => {
      toast.success('库位创建成功')
      queryClient.invalidateQueries({ queryKey: ['locations', activeWh?.id] })
      setLocDialogOpen(false)
      setLocForm(emptyLoc)
    },
    onError: (err: any) => toast.error(err.message || '创建失败'),
  })

  const updateLoc = useMutation({
    mutationFn: async (data: { id: string; form: LocationForm }) => {
      const code = genLocCode(data.form)
      const description = data.form.description || genLocDesc(data.form)
      const { error } = await supabase
        .from('locations')
        .update({
          code,
          zone: data.form.zone || null,
          rack: data.form.rack || null,
          level: data.form.level || null,
          position: data.form.position || null,
          description: description || null,
        })
        .eq('id', data.id)
      if (error) throw error
    },
    onSuccess: () => {
      toast.success('库位更新成功')
      queryClient.invalidateQueries({ queryKey: ['locations', activeWh?.id] })
      setLocDialogOpen(false)
      setEditingLoc(null)
      setLocForm(emptyLoc)
    },
    onError: (err: any) => toast.error(err.message || '更新失败'),
  })

  const deleteLoc = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('locations').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      toast.success('库位删除成功')
      queryClient.invalidateQueries({ queryKey: ['locations', activeWh?.id] })
    },
    onError: (err: any) => toast.error(err.message || '删除失败'),
  })

  const openCreateWh = () => {
    setEditingWh(null)
    setWhForm(emptyWh)
    setWhDialogOpen(true)
  }

  const openEditWh = (w: Warehouse) => {
    setEditingWh(w)
    setWhForm({ code: w.code, name: w.name || '', address: w.address || '' })
    setWhDialogOpen(true)
  }

  const handleWhSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setWhSubmitting(true)
    try {
      if (editingWh) {
        await updateWh.mutateAsync({ id: editingWh.id, form: whForm })
      } else {
        await createWh.mutateAsync(whForm)
      }
    } finally {
      setWhSubmitting(false)
    }
  }

  const openCreateLoc = () => {
    setEditingLoc(null)
    setLocForm(emptyLoc)
    setLocDialogOpen(true)
  }

  const openEditLoc = (l: Location) => {
    setEditingLoc(l)
    setLocForm({
      zone: l.zone || '',
      rack: l.rack || '',
      level: l.level || '',
      position: l.position || '',
      description: l.description || '',
    })
    setLocDialogOpen(true)
  }

  const handleLocSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLocSubmitting(true)
    try {
      if (editingLoc) {
        await updateLoc.mutateAsync({ id: editingLoc.id, form: locForm })
      } else {
        await createLoc.mutateAsync(locForm)
      }
    } finally {
      setLocSubmitting(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">仓库管理</h2>
          <p className="text-sm text-muted-foreground">管理仓库和库位</p>
        </div>
        <Button onClick={openCreateWh}>
          <Plus className="mr-2 h-4 w-4" />
          新增仓库
        </Button>
      </div>

      <div className="flex gap-4 items-start">
        {/* 仓库列表（可折叠） */}
        <div
          className={`rounded-md border bg-background transition-all duration-200 ${
            whCollapsed ? 'w-12 flex-shrink-0' : 'w-[340px] flex-shrink-0'
          }`}
        >
          {!whCollapsed ? (
            <div>
              <div className="flex items-center justify-between px-3 py-2 border-b">
                <span className="text-sm font-medium">仓库列表</span>
                <button
                  className="p-1 rounded hover:bg-muted text-muted-foreground"
                  onClick={() => setWhCollapsed(true)}
                  title="折叠"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
              </div>
              <div className="max-h-[520px] overflow-y-auto">
                {isLoading ? (
                  <div className="text-center py-8 text-muted-foreground text-sm">
                    加载中...
                  </div>
                ) : warehouses?.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground text-sm">
                    暂无仓库，点击右上角新增
                  </div>
                ) : (
                  <div className="divide-y">
                    {warehouses?.map((w, idx) => (
                      <div
                        key={w.id}
                        className={`p-2 cursor-pointer hover:bg-muted/50 ${
                          activeWh?.id === w.id ? 'bg-primary/5' : ''
                        }`}
                        onClick={() => setActiveWh(w)}
                      >
                        <div className="flex items-start gap-2">
                          <button
                            className="mt-0.5 text-muted-foreground hover:text-primary flex-shrink-0"
                            onClick={(e) => {
                              e.stopPropagation()
                              togglePin.mutate(w)
                            }}
                            title={w.sort_order > 0 ? '取消置顶' : '置顶'}
                          >
                            {w.sort_order > 0 ? (
                              <Pin className="h-3.5 w-3.5 fill-primary text-primary" />
                            ) : (
                              <PinOff className="h-3.5 w-3.5" />
                            )}
                          </button>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="font-semibold text-sm truncate">
                                {getWhDisplayName(w)}
                              </span>
                              <span className="font-mono text-[11px] text-muted-foreground">
                                {w.code}
                              </span>
                              {idx === 0 && w.sort_order > 0 && (
                                <span className="text-[10px] text-primary bg-primary/10 px-1 rounded">
                                  置顶
                                </span>
                              )}
                            </div>
                            {w.address && (
                              <div className="text-xs text-muted-foreground mt-0.5 truncate">
                                📍 {w.address}
                              </div>
                            )}
                          </div>
                          <div
                            className="flex gap-0.5 flex-shrink-0"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              onClick={() => openEditWh(w)}
                            >
                              <Edit2 className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-destructive"
                              onClick={() => {
                                if (
                                  confirm(`确定删除仓库「${getWhDisplayName(w)}」吗？`)
                                ) {
                                  deleteWh.mutate(w.id)
                                }
                              }}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center py-3 gap-2">
              <button
                className="p-1 rounded hover:bg-muted text-muted-foreground"
                onClick={() => setWhCollapsed(false)}
                title="展开仓库列表"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
              <div className="flex flex-col items-center gap-1 mt-1">
                {warehouses?.map((w, idx) => (
                  <button
                    key={w.id}
                    className={`w-8 h-8 rounded text-[10px] font-medium flex items-center justify-center truncate ${
                      activeWh?.id === w.id
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted hover:bg-muted/80 text-muted-foreground'
                    }`}
                    onClick={() => {
                      setActiveWh(w)
                      setWhCollapsed(false)
                    }}
                    title={getWhDisplayName(w)}
                  >
                    {w.code.slice(0, 2)}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* 库位列表（占满剩余空间） */}
        <Card className="flex-1 min-w-0">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <MapPin className="h-4 w-4" />
              {activeWh ? `${getWhDisplayName(activeWh)} - 库位` : '库位管理'}
              {locations && locations.length > 0 && (
                <span className="text-xs text-muted-foreground font-normal">
                  共 {locations.length} 个
                </span>
              )}
            </CardTitle>
            {activeWh && (
              <Button size="sm" onClick={openCreateLoc}>
                <Plus className="mr-1 h-3 w-3" />
                新增库位
              </Button>
            )}
          </CardHeader>
          <CardContent>
            {!activeWh ? (
              <div className="text-center py-16 text-muted-foreground text-sm">
                点击左侧仓库查看库位
              </div>
            ) : locations?.length === 0 ? (
              <div className="text-center py-16 text-muted-foreground text-sm">
                暂无库位，点击右上角新增
              </div>
            ) : (
              <div className="space-y-2 max-h-[520px] overflow-y-auto pr-1">
                {locations?.map((l: any) => {
                  const occupied = (l.inventory || []).filter((inv: any) => inv.product)
                  return (
                  <div
                    key={l.id}
                    className="flex items-center justify-between p-3 rounded-md border hover:border-primary/40 hover:bg-muted/20 transition-colors"
                  >
                    <div className="flex items-center gap-4 min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {l.zone && (
                          <span className="inline-flex items-center justify-center h-8 w-8 rounded-md bg-primary/10 text-primary text-sm font-bold">
                            {l.zone}
                          </span>
                        )}
                        <div className="flex items-center gap-1.5 text-sm">
                          {l.rack && (
                            <span className="text-muted-foreground">
                              <span className="font-semibold text-foreground">{l.rack}</span>架
                            </span>
                          )}
                          {l.level && (
                            <>
                              <span className="text-muted-foreground">·</span>
                              <span className="text-muted-foreground">
                                <span className="font-semibold text-foreground">{l.level}</span>层
                              </span>
                            </>
                          )}
                          {l.position && (
                            <>
                              <span className="text-muted-foreground">·</span>
                              <span className="text-muted-foreground">
                                <span className="font-semibold text-foreground">{l.position}</span>位
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                      {l.description && l.code !== l.description && (
                        <div className="text-xs text-muted-foreground flex-shrink-0">
                          {l.description}
                        </div>
                      )}
                      {occupied.length > 0 ? (
                        <div className="flex flex-wrap gap-1.5 min-w-0 flex-1 justify-end max-w-[60%]">
                          {occupied.map((inv: any) => (
                            <span
                              key={inv.id}
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-blue-50 text-blue-700 border border-blue-200 truncate max-w-full"
                              title={inv.product.name + (inv.product.sku ? ' · ' + inv.product.sku : '')}
                            >
                              <Package className="h-3 w-3 flex-shrink-0" />
                              <span className="truncate">
                                {inv.product.name}
                              </span>
                              <span className="font-semibold flex-shrink-0">×{inv.quantity}</span>
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="text-[11px] text-muted-foreground italic ml-auto flex-shrink-0">
                          空库位
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 flex-shrink-0 ml-3">
                      <span className="font-mono text-xs text-muted-foreground bg-muted px-2 py-1 rounded">
                        {l.code}
                      </span>
                      <div className="flex gap-0.5">
                        <Button variant="ghost" size="icon" onClick={() => openEditLoc(l as Location)}>
                          <Edit2 className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-destructive"
                          onClick={() => {
                            if (confirm(`确定删除库位「${l.code}」吗？`)) {
                              deleteLoc.mutate(l.id)
                            }
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                )})}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* 仓库对话框 */}
      <Dialog open={whDialogOpen} onOpenChange={setWhDialogOpen}>
        <DialogContent>
          <form onSubmit={handleWhSubmit}>
            <DialogHeader>
              <DialogTitle>{editingWh ? '编辑仓库' : '新增仓库'}</DialogTitle>
              <DialogDescription>填写仓库基本信息</DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="wh-code">仓库编码 *</Label>
                <Input
                  id="wh-code"
                  value={whForm.code}
                  onChange={(e) => setWhForm({ ...whForm, code: e.target.value })}
                  required
                  placeholder="如：WH001"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="wh-name">仓库名称</Label>
                <Input
                  id="wh-name"
                  value={whForm.name}
                  onChange={(e) => setWhForm({ ...whForm, name: e.target.value })}
                  placeholder="可留空，默认显示编号"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="wh-address">地址</Label>
                <Textarea
                  id="wh-address"
                  value={whForm.address}
                  onChange={(e) => setWhForm({ ...whForm, address: e.target.value })}
                  rows={2}
                />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setWhDialogOpen(false)}>
                取消
              </Button>
              <Button type="submit" disabled={whSubmitting}>
                {whSubmitting ? '保存中...' : editingWh ? '保存修改' : '创建仓库'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* 库位对话框 */}
      <Dialog open={locDialogOpen} onOpenChange={setLocDialogOpen}>
        <DialogContent>
          <form onSubmit={handleLocSubmit}>
            <DialogHeader>
              <DialogTitle>{editingLoc ? '编辑库位' : '新增库位'}</DialogTitle>
              <DialogDescription>
                {activeWh ? `${getWhDisplayName(activeWh)} - 填写库位信息` : '填写库位信息'}
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              {/* 四级定位输入 */}
              <div className="grid grid-cols-4 gap-3">
                <div className="space-y-2">
                  <Label>大区 *</Label>
                  <Select
                    value={locForm.zone}
                    onValueChange={(v) => setLocForm({ ...locForm, zone: v })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="选区" />
                    </SelectTrigger>
                    <SelectContent>
                      {ZONES.map((z) => (
                        <SelectItem key={z} value={z}>{z}区</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>货架 *</Label>
                  <Input
                    value={locForm.rack}
                    onChange={(e) => setLocForm({ ...locForm, rack: e.target.value.replace(/[^0-9]/g, '') })}
                    required
                    placeholder="如 3"
                    inputMode="numeric"
                  />
                </div>
                <div className="space-y-2">
                  <Label>层级 *</Label>
                  <Input
                    value={locForm.level}
                    onChange={(e) => setLocForm({ ...locForm, level: e.target.value.replace(/[^0-9]/g, '') })}
                    required
                    placeholder="如 2"
                    inputMode="numeric"
                  />
                </div>
                <div className="space-y-2">
                  <Label>位次 *</Label>
                  <Input
                    value={locForm.position}
                    onChange={(e) => setLocForm({ ...locForm, position: e.target.value.replace(/[^0-9]/g, '') })}
                    required
                    placeholder="如 5"
                    inputMode="numeric"
                  />
                </div>
              </div>

              {/* 自动预览编码 */}
              {(locForm.zone || locForm.rack || locForm.level || locForm.position) && (
                <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-muted text-sm">
                  <span className="text-muted-foreground">编码预览：</span>
                  <span className="font-mono font-medium">{genLocCode(locForm)}</span>
                  <span className="text-muted-foreground ml-2">{genLocDesc(locForm)}</span>
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="loc-desc">描述（可选，留空自动生成）</Label>
                <Input
                  id="loc-desc"
                  value={locForm.description}
                  onChange={(e) => setLocForm({ ...locForm, description: e.target.value })}
                  placeholder={genLocDesc(locForm) || '自定义描述'}
                />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setLocDialogOpen(false)}>
                取消
              </Button>
              <Button type="submit" disabled={locSubmitting}>
                {locSubmitting ? '保存中...' : editingLoc ? '保存修改' : '创建库位'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
