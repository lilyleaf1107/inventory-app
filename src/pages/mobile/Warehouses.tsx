import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  Plus,
  Edit2,
  Trash2,
  MapPin,
  Pin,
  PinOff,
  ArrowLeft,
  ChevronDown,
  ChevronUp,
  Building2,
  Layers,
  List,
  Package,
  X,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/auth'
import type { Warehouse, Location } from '@/types'
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

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
const emptyLoc: LocationForm = {
  zone: 'A',
  rack: '',
  level: '',
  position: '',
  description: '',
}

const ZONES = ['A', 'B', 'C', 'D', 'E', 'F']

function genLocCode(f: LocationForm): string {
  const pad = (s: string) => s.padStart(2, '0')
  return [f.zone, pad(f.rack), pad(f.level), pad(f.position)].filter(Boolean).join('-')
}

function genLocDesc(f: LocationForm): string {
  const parts: string[] = []
  if (f.zone) parts.push(`${f.zone}区`)
  if (f.rack) parts.push(`${f.rack}号货架`)
  if (f.level) parts.push(`${f.level}层`)
  if (f.position) parts.push(`${f.position}位`)
  return parts.join(' ')
}

function getWhDisplayName(w: Warehouse): string {
  return w.name || w.code
}

// 库位分组：按 zone → rack 二级分组
function groupLocations(locs: any[]) {
  const map = new Map<string, Map<string, any[]>>()
  for (const l of locs) {
    const zone = l.zone || '未分区'
    const rack = l.rack || '未分架'
    if (!map.has(zone)) map.set(zone, new Map())
    const rackMap = map.get(zone)!
    if (!rackMap.has(rack)) rackMap.set(rack, [])
    rackMap.get(rack)!.push(l)
  }
  const sortKey = (a: string, b: string) => {
    const na = parseInt(a), nb = parseInt(b)
    if (!isNaN(na) && !isNaN(nb)) return na - nb
    return a.localeCompare(b)
  }
  const sortedZones = Array.from(map.keys()).sort(sortKey)
  return sortedZones.map((zone) => {
    const rackMap = map.get(zone)!
    const sortedRacks = Array.from(rackMap.keys()).sort(sortKey)
    return {
      zone,
      racks: sortedRacks.map((rack) => ({
        rack,
        locations: rackMap.get(rack)!,
      })),
    }
  })
}

// 统计库位占用情况
function countOccupied(locs: any[]): { total: number; occupied: number } {
  let occupied = 0
  for (const l of locs) {
    const occ = (l.inventory || []).filter((inv: any) => inv.product)
    if (occ.length > 0) occupied++
  }
  return { total: locs.length, occupied }
}

// 库位按 level 分组（货架 → 层级）
function groupByLevel(locs: any[]) {
  const map = new Map<string, any[]>()
  for (const l of locs) {
    const lv = l.level || '未分层'
    if (!map.has(lv)) map.set(lv, [])
    map.get(lv)!.push(l)
  }
  const sortKey = (a: string, b: string) => {
    const na = parseInt(a), nb = parseInt(b)
    if (!isNaN(na) && !isNaN(nb)) return na - nb
    return a.localeCompare(b)
  }
  return Array.from(map.keys()).sort(sortKey).map((level) => ({
    level,
    locations: map.get(level)!,
  }))
}

export default function MobileWarehouses() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { canWrite } = useAuthStore()

  const [whDialogOpen, setWhDialogOpen] = useState(false)
  const [editingWh, setEditingWh] = useState<Warehouse | null>(null)
  const [whForm, setWhForm] = useState<WarehouseForm>(emptyWh)
  const [whSubmitting, setWhSubmitting] = useState(false)

  const [activeWh, setActiveWh] = useState<Warehouse | null>(null)
  const [whExpanded, setWhExpanded] = useState(true)
  const [locDialogOpen, setLocDialogOpen] = useState(false)
  const [editingLoc, setEditingLoc] = useState<Location | null>(null)
  const [locForm, setLocForm] = useState<LocationForm>(emptyLoc)
  const [locSubmitting, setLocSubmitting] = useState(false)
  const [locViewMode, setLocViewMode] = useState<'grouped' | 'flat'>('grouped')
  const [collapsedZones, setCollapsedZones] = useState<Set<string>>(new Set())
  const [collapsedRacks, setCollapsedRacks] = useState<Set<string>>(new Set())
  const [collapsedLevels, setCollapsedLevels] = useState<Set<string>>(new Set())
  // 库位中商品的编辑弹窗
  const [invDialogOpen, setInvDialogOpen] = useState(false)
  const [editingInv, setEditingInv] = useState<any>(null)
  const [editingInvQty, setEditingInvQty] = useState('')

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
            product:products ( id, name, sku )
          )
        `)
        .eq('warehouse_id', activeWh!.id)
        .order('code')
      if (error) throw error
      return data as (Location & {
        inventory?: {
          id: string
          quantity: number
          product: { id: string; name: string; sku: string | null } | null
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

  const togglePin = useMutation({
    mutationFn: async (w: Warehouse) => {
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

  // 从库位移除商品（删除 inventory 记录）- 乐观更新
  const deleteInv = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('inventory').delete().eq('id', id)
      if (error) throw error
    },
    onMutate: async (id: string) => {
      const locsKey = ['locations', activeWh?.id] as const
      await queryClient.cancelQueries({ queryKey: locsKey })
      const prevLocs = queryClient.getQueryData<any[]>(locsKey)
      let removed: { invId: string; productId: string | null; qty: number; locId: string } | null = null
      if (prevLocs) {
        outer: for (const l of prevLocs) {
          const invs: any[] = l.inventory || []
          for (const inv of invs) {
            if (inv.id === id) {
              removed = {
                invId: id,
                productId: inv.product?.id || null,
                qty: Number(inv.quantity) || 0,
                locId: l.id,
              }
              break outer
            }
          }
        }
      }
      if (prevLocs && removed) {
        const next = prevLocs.map((l) =>
          l.id === removed!.locId
            ? { ...l, inventory: (l.inventory || []).filter((inv: any) => inv.id !== id) }
            : l,
        )
        queryClient.setQueryData(locsKey, next)
      }
      const qtyKey = ['products-qty-map'] as const
      const prevQty = queryClient.getQueryData<Map<string, number>>(qtyKey)
      if (removed && removed.productId && prevQty) {
        const next = new Map(prevQty)
        next.set(removed.productId, Math.max(0, (next.get(removed.productId) || 0) - removed.qty))
        queryClient.setQueryData(qtyKey, next)
      }
      const locMapKey = ['products-locations-map'] as const
      const prevLocMap = queryClient.getQueryData<Map<string, any[]>>(locMapKey)
      if (removed && removed.productId && prevLocMap && prevLocs) {
        const loc = prevLocs.find((l) => l.id === removed!.locId)
        if (loc) {
          const list = prevLocMap.get(removed.productId) || []
          const next = list.filter((item: any) => item.code !== loc.code)
          const newMap = new Map(prevLocMap)
          newMap.set(removed.productId, next)
          queryClient.setQueryData(locMapKey, newMap)
        }
      }
      return { prevLocs, prevQty, prevLocMap, locsKey, qtyKey, locMapKey }
    },
    onSuccess: () => {
      toast.success('已从库位移除')
      queryClient.invalidateQueries({ queryKey: ['locations', activeWh?.id], refetchType: 'none' })
    },
    onError: (err: any, _vars, ctx: any) => {
      if (ctx) {
        if (ctx.prevLocs !== undefined) queryClient.setQueryData(ctx.locsKey, ctx.prevLocs)
        if (ctx.prevQty !== undefined) queryClient.setQueryData(ctx.qtyKey, ctx.prevQty)
        if (ctx.prevLocMap !== undefined) queryClient.setQueryData(ctx.locMapKey, ctx.prevLocMap)
      }
      toast.error(err.message || '移除失败')
    },
  })

  // 修改库位中商品数量（含移动记录）
  const updateInvQty = useMutation({
    mutationFn: async ({ invId, newQty }: { invId: string; newQty: number }) => {
      const { data: current, error: qErr } = await supabase
        .from('inventory')
        .select('id, quantity, product_id, location_id')
        .eq('id', invId)
        .single()
      if (qErr) throw qErr
      const delta = newQty - (current?.quantity || 0)
      if (delta !== 0) {
        const { data: profile } = await supabase.auth.getUser()
        const user = profile.user
        const { error: moveErr } = await supabase.from('stock_moves').insert({
          product_id: current.product_id,
          location_id: current.location_id,
          move_type: delta > 0 ? 'in' : 'out',
          quantity: Math.abs(delta),
          reason: '手动调整',
          operator_id: user?.id || null,
        })
        if (moveErr) throw moveErr
      }
      const { error } = await supabase
        .from('inventory')
        .update({ quantity: newQty, updated_at: new Date().toISOString() })
        .eq('id', invId)
      if (error) throw error
    },
    onMutate: async ({ invId, newQty }) => {
      const locsKey = ['locations', activeWh?.id] as const
      await queryClient.cancelQueries({ queryKey: locsKey })
      const prevLocs = queryClient.getQueryData<any[]>(locsKey)
      let productId: string | null = null
      let locId: string | null = null
      let oldQty = 0
      if (prevLocs) {
        outer: for (const l of prevLocs) {
          for (const inv of l.inventory || []) {
            if (inv.id === invId) {
              productId = inv.product?.id || inv.product_id || null
              locId = l.id
              oldQty = Number(inv.quantity) || 0
              break outer
            }
          }
        }
      }
      if (prevLocs && locId) {
        const next = prevLocs.map((l) =>
          l.id === locId
            ? {
                ...l,
                inventory: (l.inventory || []).map((inv: any) =>
                  inv.id === invId ? { ...inv, quantity: newQty } : inv,
                ),
              }
            : l,
        )
        queryClient.setQueryData(locsKey, next)
      }
      const qtyKey = ['products-qty-map'] as const
      const prevQty = queryClient.getQueryData<Map<string, number>>(qtyKey)
      if (productId && prevQty) {
        const next = new Map(prevQty)
        const base = next.get(productId) || 0
        next.set(productId, Math.max(0, base - oldQty + newQty))
        queryClient.setQueryData(qtyKey, next)
      }
      return { prevLocs, prevQty, locsKey, qtyKey, oldQty, newQty, productId }
    },
    onSuccess: () => {
      toast.success('已更新数量')
      queryClient.invalidateQueries({ queryKey: ['locations', activeWh?.id], refetchType: 'none' })
    },
    onError: (err: any, _vars, ctx: any) => {
      if (ctx) {
        if (ctx.prevLocs !== undefined) queryClient.setQueryData(ctx.locsKey, ctx.prevLocs)
        if (ctx.prevQty !== undefined) queryClient.setQueryData(ctx.qtyKey, ctx.prevQty)
      }
      toast.error(err.message || '更新失败')
    },
  })

  const openEditInv = (inv: any, loc: any) => {
    setEditingInv({ ...inv, location: loc })
    setEditingInvQty(String(inv.quantity ?? ''))
    setInvDialogOpen(true)
  }

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

  const toggleZone = (zone: string) => {
    setCollapsedZones((prev) => {
      const next = new Set(prev)
      if (next.has(zone)) next.delete(zone)
      else next.add(zone)
      return next
    })
  }

  const toggleRack = (zone: string, rack: string) => {
    const key = `${zone}-${rack}`
    setCollapsedRacks((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const toggleLevel = (zone: string, rack: string, level: string) => {
    const key = `${zone}-${rack}-${level}`
    setCollapsedLevels((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const expandAllZones = (groups: ReturnType<typeof groupLocations>) => {
    setCollapsedZones(new Set())
    setCollapsedRacks(new Set())
    setCollapsedLevels(new Set())
    void groups
  }

  const collapseAllZones = (groups: ReturnType<typeof groupLocations>) => {
    const z = new Set<string>()
    for (const g of groups) z.add(g.zone)
    setCollapsedZones(z)
    setCollapsedRacks(new Set())
    setCollapsedLevels(new Set())
    void groups
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
        <h1 className="font-bold text-base flex-1">仓库管理</h1>
        <Button size="sm" onClick={openCreateWh} className="h-9">
          <Plus className="h-4 w-4" />
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* 仓库列表 */}
        <div className="border-b bg-background">
          <button
            onClick={() => setWhExpanded(!whExpanded)}
            className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-muted/30 transition-colors"
          >
            <div className="flex items-center gap-2 text-sm font-medium">
              <Building2 className="h-4 w-4 text-primary" />
              仓库列表
              {warehouses && (
                <span className="text-xs text-muted-foreground font-normal">
                  共 {warehouses.length} 个
                </span>
              )}
            </div>
            {whExpanded ? (
              <ChevronUp className="h-4 w-4 text-muted-foreground" />
            ) : (
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            )}
          </button>

          {whExpanded && (
            <div className="px-3 pb-3 space-y-2">
              {isLoading ? (
                <div className="text-center py-6 text-muted-foreground text-sm">
                  加载中...
                </div>
              ) : warehouses?.length === 0 ? (
                <div className="text-center py-6 text-muted-foreground text-sm">
                  暂无仓库，点击右上角 + 新增
                </div>
              ) : (
                warehouses?.map((w, idx) => (
                  <Card
                    key={w.id}
                    className={`cursor-pointer transition-all ${
                      activeWh?.id === w.id ? 'ring-2 ring-primary/50 border-primary/50' : ''
                    }`}
                    onClick={() => setActiveWh(w)}
                  >
                    <CardContent className="p-3">
                      <div className="flex items-start gap-2">
                        <button
                          className="mt-0.5 text-muted-foreground hover:text-primary flex-shrink-0 p-1 -m-1"
                          onClick={(e) => {
                            e.stopPropagation()
                            togglePin.mutate(w)
                          }}
                          title={w.sort_order > 0 ? '取消置顶' : '置顶'}
                        >
                          {w.sort_order > 0 ? (
                            <Pin className="h-4 w-4 fill-primary text-primary" />
                          ) : (
                            <PinOff className="h-4 w-4" />
                          )}
                        </button>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
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
                          <button
                            onClick={() => openEditWh(w)}
                            className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                          >
                            <Edit2 className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => {
                              if (confirm(`确定删除仓库「${getWhDisplayName(w)}」吗？`)) {
                                deleteWh.mutate(w.id)
                              }
                            }}
                            className="p-1.5 rounded-md hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))
              )}
            </div>
          )}
        </div>

        {/* 库位列表 */}
        <div className="p-3 space-y-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <MapPin className="h-4 w-4 text-primary" />
              <span className="text-sm font-medium">
                {activeWh ? `${getWhDisplayName(activeWh)} - 库位` : '库位管理'}
              </span>
              {locations && locations.length > 0 && (
                <span className="text-xs text-muted-foreground">共 {locations.length} 个</span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {activeWh && locations && locations.length > 0 && (
                <>
                  <div className="inline-flex rounded-md border overflow-hidden">
                    <button
                      type="button"
                      className={`inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium transition-colors ${
                        locViewMode === 'grouped'
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-background text-muted-foreground hover:bg-muted'
                      }`}
                      onClick={() => setLocViewMode('grouped')}
                      title="分层视图"
                    >
                      <Layers className="h-3 w-3" />
                      分层
                    </button>
                    <button
                      type="button"
                      className={`inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium transition-colors ${
                        locViewMode === 'flat'
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-background text-muted-foreground hover:bg-muted'
                      }`}
                      onClick={() => setLocViewMode('flat')}
                      title="平铺视图"
                    >
                      <List className="h-3 w-3" />
                      平铺
                    </button>
                  </div>
                  {locViewMode === 'grouped' && (() => {
                    const groups = groupLocations(locations)
                    return (
                      <div className="inline-flex rounded-md border overflow-hidden">
                        <button
                          type="button"
                          className="px-2 py-1 text-[11px] bg-background text-muted-foreground hover:bg-muted"
                          onClick={() => expandAllZones(groups)}
                          title="全部展开"
                        >
                          全展开
                        </button>
                        <button
                          type="button"
                          className="px-2 py-1 text-[11px] bg-background text-muted-foreground hover:bg-muted border-l"
                          onClick={() => collapseAllZones(groups)}
                          title="全部折叠"
                        >
                          全折叠
                        </button>
                      </div>
                    )
                  })()}
                </>
              )}
              {activeWh && (
                <Button size="sm" onClick={openCreateLoc} className="h-8">
                  <Plus className="h-3.5 w-3.5 mr-1" />
                  新增
                </Button>
              )}
            </div>
          </div>

          {!activeWh ? (
            <div className="text-center py-12 text-muted-foreground text-sm">
              点击上方仓库查看库位
            </div>
          ) : locations?.length === 0 ? (
            <div className="text-center py-12">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted mx-auto mb-3">
                <MapPin className="h-7 w-7 text-muted-foreground/50" />
              </div>
              <div className="text-muted-foreground text-sm mb-3">暂无库位</div>
              <Button size="sm" onClick={openCreateLoc}>
                <Plus className="h-4 w-4 mr-1" />
                新增库位
              </Button>
            </div>
          ) : locViewMode === 'flat' ? (
            <div className="space-y-2">
              {locations?.map((l: any) => {
                const occupied = (l.inventory || []).filter((inv: any) => inv.product)
                return (
                <Card key={l.id}>
                  <CardContent className="p-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          {l.zone && (
                            <span className="inline-flex items-center justify-center h-8 w-8 rounded-md bg-primary/10 text-primary text-sm font-bold">
                              {l.zone}
                            </span>
                          )}
                          <div className="flex items-center gap-1 text-sm">
                            {l.rack && (
                              <span className="text-muted-foreground">
                                <span className="font-semibold text-foreground">{l.rack}</span>
                                架
                              </span>
                            )}
                            {l.level && (
                              <>
                                <span className="text-muted-foreground">·</span>
                                <span className="text-muted-foreground">
                                  <span className="font-semibold text-foreground">{l.level}</span>
                                  层
                                </span>
                              </>
                            )}
                            {l.position && (
                              <>
                                <span className="text-muted-foreground">·</span>
                                <span className="text-muted-foreground">
                                  <span className="font-semibold text-foreground">
                                    {l.position}
                                  </span>
                                  位
                                </span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                        <span className="font-mono text-[10px] text-muted-foreground bg-muted px-2 py-1 rounded hidden sm:inline">
                          {l.code}
                        </span>
                        <div className="flex gap-0.5">
                          <button
                            onClick={() => openEditLoc(l)}
                            className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                          >
                            <Edit2 className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => {
                              if (confirm(`确定删除库位「${l.code}」吗？`)) {
                                deleteLoc.mutate(l.id)
                              }
                            }}
                            className="p-1.5 rounded-md hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                    {l.description && l.code !== l.description && (
                      <div className="text-xs text-muted-foreground mt-2 pl-10">
                        {l.description}
                      </div>
                    )}
                    {occupied.length > 0 ? (
                      <div className="flex flex-wrap gap-1 mt-2 pl-10">
                        {occupied.map((inv: any) => (
                          <span
                            key={inv.id}
                            className="inline-flex items-center gap-1 text-xs bg-blue-50 text-blue-700 px-2 py-1 rounded border border-blue-200"
                          >
                            <button
                              type="button"
                              className="truncate underline-offset-2 hover:underline"
                              onClick={() => canWrite() && openEditInv(inv, l)}
                            >
                              {inv.product.name}
                            </button>
                            <button
                              type="button"
                              className="font-semibold underline-offset-2 hover:underline"
                              onClick={() => canWrite() && openEditInv(inv, l)}
                            >
                              ×{inv.quantity}
                            </button>
                            {canWrite() && (
                              <>
                                <button
                                  type="button"
                                  className="hover:text-foreground transition-colors"
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    navigate(`/m/products?open=${inv.product.id}`)
                                  }}
                                  title="编辑产品信息"
                                >
                                  <Edit2 className="h-3 w-3" />
                                </button>
                                <button
                                  type="button"
                                  className="ml-0.5 hover:text-destructive transition-colors"
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    if (confirm(`确定从该库位移除「${inv.product.name}」吗？`)) {
                                      deleteInv.mutate(inv.id)
                                    }
                                  }}
                                  title="从该库位移除"
                                >
                                  <X className="h-3 w-3" />
                                </button>
                              </>
                            )}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <div className="text-xs text-muted-foreground mt-2 pl-10 italic">
                        空库位
                      </div>
                    )}
                  </CardContent>
                </Card>
              )})}
            </div>
          ) : (
            <div className="space-y-2">
              {(() => {
                const groups = groupLocations(locations || [])
                return groups.map((g) => {
                  const zoneStats = countOccupied(
                    g.racks.flatMap((r) => r.locations),
                  )
                  const zoneCollapsed = collapsedZones.has(g.zone)
                  return (
                    <div key={g.zone} className="rounded-lg border overflow-hidden">
                      {/* 区域头 */}
                      <button
                        type="button"
                        className="w-full flex items-center gap-2 px-3 py-2 bg-muted/50 hover:bg-muted transition-colors"
                        onClick={() => toggleZone(g.zone)}
                      >
                        <ChevronDown
                          className={`h-4 w-4 text-muted-foreground transition-transform ${
                            zoneCollapsed ? '-rotate-90' : ''
                          }`}
                        />
                        <span className="inline-flex items-center justify-center h-7 w-7 rounded-md bg-primary/15 text-primary text-sm font-bold">
                          {g.zone}
                        </span>
                        <span className="font-semibold text-sm">
                          {g.zone}区
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {zoneStats.total}个 · 占{zoneStats.occupied}
                        </span>
                        <span className="ml-auto text-xs text-muted-foreground">
                          {g.racks.length}架
                        </span>
                      </button>
                      {/* 区域内容 */}
                      {!zoneCollapsed && (
                        <div className="p-2 space-y-2">
                          {g.racks.map((r) => {
                            const rackStats = countOccupied(r.locations)
                            const rackCollapsed = collapsedRacks.has(
                              `${g.zone}-${r.rack}`,
                            )
                            return (
                              <div
                                key={`${g.zone}-${r.rack}`}
                                className="rounded-md border border-muted"
                              >
                                {/* 货架头 */}
                                <button
                                  type="button"
                                  className="w-full flex items-center gap-2 px-2.5 py-1.5 bg-muted/30 hover:bg-muted/60 transition-colors"
                                  onClick={() =>
                                    toggleRack(g.zone, r.rack)
                                  }
                                >
                                  <ChevronDown
                                    className={`h-3.5 w-3.5 text-muted-foreground transition-transform ${
                                      rackCollapsed ? '-rotate-90' : ''
                                    }`}
                                  />
                                  <span className="text-sm font-medium">
                                    货架 {r.rack}
                                  </span>
                                  <span className="text-xs text-muted-foreground">
                                    {rackStats.total}库位 · {rackStats.occupied}占用
                                  </span>
                                </button>
                                {/* 货架内容：先按 level 分组 */}
                                {!rackCollapsed && (
                                  <div className="space-y-1.5 p-1.5">
                                    {groupByLevel(r.locations).map((lvGroup) => {
                                      const lvStats = countOccupied(lvGroup.locations)
                                      const lvKey = `${g.zone}-${r.rack}-${lvGroup.level}`
                                      const lvCollapsed = collapsedLevels.has(lvKey)
                                      return (
                                        <div
                                          key={lvKey}
                                          className="rounded-sm border border-border/60 overflow-hidden"
                                        >
                                          <button
                                            type="button"
                                            className="w-full flex items-center gap-2 px-2 py-1 bg-primary/5 hover:bg-primary/10 transition-colors"
                                            onClick={() =>
                                              toggleLevel(g.zone, r.rack, lvGroup.level)
                                            }
                                          >
                                            <ChevronDown
                                              className={`h-3 w-3 text-muted-foreground transition-transform ${
                                                lvCollapsed ? '-rotate-90' : ''
                                              }`}
                                            />
                                            <span className="text-xs font-semibold text-primary/90">
                                              {lvGroup.level === '未分层'
                                                ? lvGroup.level
                                                : `${lvGroup.level} 层`}
                                            </span>
                                            <span className="text-[10px] text-muted-foreground ml-auto">
                                              {lvStats.total}库位 · {lvStats.occupied}占用
                                            </span>
                                          </button>
                                          {!lvCollapsed && (
                                            <div className="space-y-1 p-1.5">
                                              {lvGroup.locations.map((l: any) => {
                                                const occupied = (l.inventory || []).filter(
                                                  (inv: any) => inv.product,
                                                )
                                                return (
                                                  <div
                                                    key={l.id}
                                                    className={`flex items-center gap-2 p-2 rounded-md border transition-colors ${
                                                      occupied.length > 0
                                                        ? 'border-blue-200 bg-blue-50/30'
                                                        : 'border-border'
                                                    }`}
                                                  >
                                                    <div className="flex items-center gap-1.5 min-w-0 flex-1">
                                                      <span className="font-mono text-[11px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded flex-shrink-0">
                                                        {l.level}-{l.position}
                                                      </span>
                                                      {occupied.length > 0 ? (
                                                        <div className="flex flex-wrap gap-1 min-w-0">
                                                          {occupied.map((inv: any) => (
                                                            <span
                                                              key={inv.id}
                                                              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] bg-blue-100 text-blue-700 truncate max-w-full"
                                                            >
                                                              <Package className="h-3 w-3 flex-shrink-0" />
                                                              <button
                                                                type="button"
                                                                className="truncate underline-offset-2 hover:underline"
                                                                onClick={() =>
                                                                  canWrite() && openEditInv(inv, l)
                                                                }
                                                              >
                                                                {inv.product.name}
                                                              </button>
                                                              <button
                                                                type="button"
                                                                className="font-semibold flex-shrink-0 underline-offset-2 hover:underline"
                                                                onClick={() =>
                                                                  canWrite() && openEditInv(inv, l)
                                                                }
                                                              >
                                                                ×{inv.quantity}
                                                              </button>
                                                              {canWrite() && (
                                                                <>
                                                                  <button
                                                                    type="button"
                                                                    className="flex-shrink-0 hover:text-foreground transition-colors"
                                                                    onClick={(e) => {
                                                                      e.stopPropagation()
                                                                      navigate(
                                                                        `/m/products?open=${inv.product.id}`,
                                                                      )
                                                                    }}
                                                                    title="编辑产品信息"
                                                                  >
                                                                    <Edit2 className="h-2.5 w-2.5" />
                                                                  </button>
                                                                  <button
                                                                    type="button"
                                                                    className="ml-0.5 flex-shrink-0 hover:text-destructive transition-colors"
                                                                    onClick={(e) => {
                                                                      e.stopPropagation()
                                                                      if (
                                                                        confirm(
                                                                          `确定从该库位移除「${inv.product.name}」吗？`,
                                                                        )
                                                                      ) {
                                                                        deleteInv.mutate(inv.id)
                                                                      }
                                                                    }}
                                                                    title="从该库位移除"
                                                                  >
                                                                    <X className="h-3 w-3" />
                                                                  </button>
                                                                </>
                                                              )}
                                                            </span>
                                                          ))}
                                                        </div>
                                                      ) : (
                                                        <span className="text-[11px] text-muted-foreground italic">
                                                          空库位
                                                        </span>
                                                      )}
                                                    </div>
                                                    <div className="flex gap-0.5 flex-shrink-0">
                                                      <button
                                                        onClick={() => openEditLoc(l as Location)}
                                                        className="p-1 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                                                      >
                                                        <Edit2 className="h-3 w-3" />
                                                      </button>
                                                      <button
                                                        onClick={() => {
                                                          if (confirm(`确定删除库位「${l.code}」吗？`)) {
                                                            deleteLoc.mutate(l.id)
                                                          }
                                                        }}
                                                        className="p-1 rounded-md hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                                                      >
                                                        <Trash2 className="h-3 w-3" />
                                                      </button>
                                                    </div>
                                                  </div>
                                                )
                                              })}
                                            </div>
                                          )}
                                        </div>
                                      )
                                    })}
                                  </div>
                                )}
                              </div>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  )
                })
              })()}
            </div>
          )}
        </div>
      </div>

      {/* 仓库对话框 */}
      <Dialog open={whDialogOpen} onOpenChange={setWhDialogOpen}>
        <DialogContent className="max-w-md p-0">
          <form onSubmit={handleWhSubmit}>
            <DialogHeader className="px-4 pt-4">
              <DialogTitle>{editingWh ? '编辑仓库' : '新增仓库'}</DialogTitle>
              <DialogDescription>填写仓库基本信息</DialogDescription>
            </DialogHeader>
            <div className="space-y-3 p-4">
              <div className="space-y-2">
                <Label htmlFor="m-wh-code">仓库编码 *</Label>
                <Input
                  id="m-wh-code"
                  value={whForm.code}
                  onChange={(e) => setWhForm({ ...whForm, code: e.target.value })}
                  required
                  placeholder="如 WH001"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="m-wh-name">仓库名称</Label>
                <Input
                  id="m-wh-name"
                  value={whForm.name}
                  onChange={(e) => setWhForm({ ...whForm, name: e.target.value })}
                  placeholder="可留空，默认显示编码"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="m-wh-address">地址</Label>
                <Textarea
                  id="m-wh-address"
                  value={whForm.address}
                  onChange={(e) => setWhForm({ ...whForm, address: e.target.value })}
                  rows={2}
                  placeholder="选填"
                />
              </div>
            </div>
            <DialogFooter className="px-4 pb-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => setWhDialogOpen(false)}
                size="sm"
              >
                取消
              </Button>
              <Button type="submit" disabled={whSubmitting} size="sm">
                {whSubmitting ? '保存中...' : editingWh ? '保存修改' : '创建仓库'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* 库位对话框 */}
      <Dialog open={locDialogOpen} onOpenChange={setLocDialogOpen}>
        <DialogContent className="max-w-md p-0">
          <form onSubmit={handleLocSubmit}>
            <DialogHeader className="px-4 pt-4">
              <DialogTitle>{editingLoc ? '编辑库位' : '新增库位'}</DialogTitle>
              <DialogDescription>
                {activeWh ? `${getWhDisplayName(activeWh)} - 填写库位信息` : '填写库位信息'}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3 p-4">
              <div className="grid grid-cols-4 gap-2">
                <div className="space-y-2">
                  <Label className="text-xs">大区</Label>
                  <Select
                    value={locForm.zone}
                    onValueChange={(v) => setLocForm({ ...locForm, zone: v })}
                  >
                    <SelectTrigger className="h-10">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ZONES.map((z) => (
                        <SelectItem key={z} value={z}>
                          {z}区
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label className="text-xs">货架</Label>
                  <Input
                    value={locForm.rack}
                    onChange={(e) =>
                      setLocForm({ ...locForm, rack: e.target.value.replace(/[^0-9]/g, '') })
                    }
                    required
                    placeholder="如 3"
                    inputMode="numeric"
                    className="h-10"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs">层级</Label>
                  <Input
                    value={locForm.level}
                    onChange={(e) =>
                      setLocForm({ ...locForm, level: e.target.value.replace(/[^0-9]/g, '') })
                    }
                    required
                    placeholder="如 2"
                    inputMode="numeric"
                    className="h-10"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs">位次</Label>
                  <Input
                    value={locForm.position}
                    onChange={(e) =>
                      setLocForm({ ...locForm, position: e.target.value.replace(/[^0-9]/g, '') })
                    }
                    required
                    placeholder="如 5"
                    inputMode="numeric"
                    className="h-10"
                  />
                </div>
              </div>

              {(locForm.zone || locForm.rack || locForm.level || locForm.position) && (
                <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-muted text-xs">
                  <span className="text-muted-foreground">编码预览：</span>
                  <span className="font-mono font-medium">{genLocCode(locForm)}</span>
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="m-loc-desc">描述（留空自动生成）</Label>
                <Input
                  id="m-loc-desc"
                  value={locForm.description}
                  onChange={(e) => setLocForm({ ...locForm, description: e.target.value })}
                  placeholder={genLocDesc(locForm) || '自定义描述'}
                />
              </div>
            </div>
            <DialogFooter className="px-4 pb-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => setLocDialogOpen(false)}
                size="sm"
              >
                取消
              </Button>
              <Button type="submit" disabled={locSubmitting} size="sm">
                {locSubmitting ? '保存中...' : editingLoc ? '保存修改' : '创建库位'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* 编辑库位中商品 */}
      <Dialog open={invDialogOpen} onOpenChange={(o) => !o && setInvDialogOpen(false)}>
        <DialogContent className="max-w-md p-0">
          <DialogHeader className="px-4 pt-4">
            <DialogTitle>编辑库位商品</DialogTitle>
            <DialogDescription>
              {editingInv?.product?.name}
              {editingInv?.location?.code && (
                <span className="ml-2 text-xs font-mono text-muted-foreground">
                  库位 {editingInv.location.code}
                </span>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 p-4">
            <div className="space-y-2">
              <Label>当前数量</Label>
              <Input
                type="number"
                value={editingInvQty}
                onChange={(e) => setEditingInvQty(e.target.value)}
              />
            </div>
            <div className="text-xs text-muted-foreground">
              保存时会自动生成一笔出入库流水（原因：手动调整）。
            </div>
            <div className="flex flex-col gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  if (!editingInv?.product?.id) return
                  navigate(`/m/products?open=${editingInv.product.id}`)
                  setInvDialogOpen(false)
                }}
              >
                <Edit2 className="h-4 w-4 mr-1" />
                编辑产品信息
              </Button>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  className="flex-1"
                  onClick={() => setInvDialogOpen(false)}
                >
                  取消
                </Button>
                <Button
                  type="button"
                  className="flex-1"
                  disabled={
                    !editingInv?.id || editingInvQty === '' || Number(editingInvQty) < 0
                  }
                  onClick={() => {
                    if (!editingInv?.id) return
                    updateInvQty.mutate(
                      { invId: editingInv.id, newQty: Number(editingInvQty) },
                      { onSuccess: () => setInvDialogOpen(false) },
                    )
                  }}
                >
                  保存
                </Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
