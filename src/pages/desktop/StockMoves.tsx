import { useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  ChevronDown,
  ChevronRight,
  Copy,
  Download,
  Filter,
  FileText,
  Package,
  Store,
  Truck,
  Layers,
  Pencil,
  X,
  Check,
} from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { buildPageRange, cn, formatDate, scrollToTopOfPage } from '@/lib/utils'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'

type StockMoveRow = {
  id: string
  move_type: 'in' | 'out'
  quantity: number
  scan_mode: 'manual' | 'scan'
  batch_no: string | null
  remark: string | null
  tracking_no: string | null
  is_offline: boolean | null
  operator_name: string | null
  created_at: string
  product: { id: string; name: string; sku: string | null; unit: string }
  location: {
    id: string
    code: string
    warehouse: { id: string; code: string; name: string | null }
  }
  operator: { id: string; name: string | null } | null
}

// 分组键：出库时按 tracking_no / 线下交易分组；入库按 created_at 的秒级（相邻入库）合并成批次
type GroupKey = string

const GROUP_TYPE = {
  OUT_ONLINE: 'online_out',
  OUT_OFFLINE: 'offline_out',
  OUT_OTHER: 'other_out',
  IN: 'in',
} as const

interface MoveGroup {
  key: GroupKey
  groupType: (typeof GROUP_TYPE)[keyof typeof GROUP_TYPE]
  label: string          // 单号 / 线下客户 / 批次
  subtitle: string       // 副标题（件数、SKU数）
  items: StockMoveRow[]
  totalQty: number
  uniqueProducts: number
  firstTime: string
  shipBadge?: { text: string; variant: 'blue' | 'purple' | 'slate' | 'green' }
  icon: typeof Truck | typeof Store | typeof FileText | typeof ArrowDownToLine
}

function moveShipLabel(m: StockMoveRow): {
  type: 'online' | 'offline' | 'other'
  ref: string          // 单号 / 客户名 / 备注
} {
  if (m.move_type !== 'out') return { type: 'other', ref: '—' }
  if (typeof m.is_offline === 'boolean' && m.is_offline) {
    let ref = m.remark || '线下客户'
    if (ref.startsWith('线下:')) ref = ref.slice(3)
    return { type: 'offline', ref: ref || '线下客户' }
  }
  if (m.tracking_no) return { type: 'online', ref: m.tracking_no }
  return { type: 'other', ref: m.remark || '—' }
}

const GROUP_PAGE_SIZE = 15 // 每页显示多少组（一组=一个快递单/一个线下客户/一个入库批次）

export default function StockMovesPage() {
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState<'all' | 'in' | 'out'>('all')
  const [shipModeFilter, setShipModeFilter] = useState<'all' | 'online' | 'offline'>('all')
  const [trackingSearch, setTrackingSearch] = useState('')
  const [expanded, setExpanded] = useState<Record<GroupKey, boolean> | 'all-on' | 'all-off'>('all-on')
  const [copyToast, setCopyToast] = useState<string>('')
  const [page, setPage] = useState(1)

  // 组级编辑：改备注 / 补单号 / 切线上线下
  const [editingGroup, setEditingGroup] = useState<MoveGroup | null>(null)
  const [editShipMode, setEditShipMode] = useState<'online' | 'offline' | 'other'>('other')
  const [editTrackingNo, setEditTrackingNo] = useState('')
  const [editRemark, setEditRemark] = useState('')
  const [savingEdit, setSavingEdit] = useState(false)

  const { data: moves, isLoading, error, refetch } = useQuery({
    queryKey: ['stock-moves-v2', typeFilter, shipModeFilter, trackingSearch],
    queryFn: async () => {
      // 直接查询 tracking_no / is_offline / operator_name（0017/0018 迁移已执行完毕）
      let qb = supabase
        .from('stock_moves')
        .select(`
          id, move_type, quantity, scan_mode, batch_no, remark, created_at,
          tracking_no, is_offline, operator_name,
          product:products(id, name, sku, unit),
          location:locations(id, code, warehouse:warehouses(id, code, name)),
          operator:profiles!stock_moves_operator_id_fkey(id, name)
        `)
        .order('created_at', { ascending: false })
        .limit(500) as any
      if (typeFilter !== 'all') qb = qb.eq('move_type', typeFilter)
      const { data, error: err } = await qb
      if (err) throw err
      const rows = (data || []) as StockMoveRow[]

      // 客户搜索筛选
      const s = search?.toLowerCase() || ''
      return rows.filter((r) => {
        if (typeFilter !== 'all' && r.move_type !== typeFilter) return false
        const ship = moveShipLabel(r)
        if (shipModeFilter === 'online' && ship.type !== 'online') return false
        if (shipModeFilter === 'offline' && ship.type !== 'offline') return false
        if (trackingSearch && !ship.ref.toLowerCase().includes(trackingSearch.toLowerCase())) return false
        if (s) {
          const hit =
            r.product.name.toLowerCase().includes(s) ||
            (r.product.sku || '').toLowerCase().includes(s) ||
            (r.batch_no || '').toLowerCase().includes(s) ||
            (ship.ref || '').toLowerCase().includes(s) ||
            (r.remark || '').toLowerCase().includes(s)
          if (!hit) return false
        }
        return true
      })
    },
    staleTime: 1000 * 60 * 5,
  })

  // ============= 分组逻辑 =============
  const { groups, summary } = useMemo<{ groups: MoveGroup[]; summary: { in: number; out: number; online: number; offline: number; onlineCount: number; offlineCount: number } }>(() => {
    const rows = moves || []
    const groupsMap = new Map<GroupKey, MoveGroup>()
    let sumIn = 0, sumOut = 0, sumOnline = 0, sumOffline = 0, onlineCount = 0, offlineCount = 0

    let inIndex = 0
    const inBucket = new Map<string, string>() // created_at bucket → groupKey

    for (const m of rows) {
      const qty = Number(m.quantity)
      if (m.move_type === 'in') {
        sumIn += qty
        // 入库：按 10 分钟内同操作人合并为 1 批（更贴近"入库单"）
        const t = new Date(m.created_at)
        const bucket = `${t.getFullYear()}-${t.getMonth()}-${t.getDate()}-${t.getHours()}-${Math.floor(t.getMinutes() / 10)}_${m.operator?.id || 'anon'}`
        let key = inBucket.get(bucket)
        if (!key) { key = `in_${inIndex++}_${bucket}`; inBucket.set(bucket, key) }
        let g = groupsMap.get(key)
        if (!g) {
          g = {
            key,
            groupType: GROUP_TYPE.IN,
            label: `入库批次 ${t.toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}`,
            subtitle: '',
            items: [],
            totalQty: 0,
            uniqueProducts: 0,
            firstTime: m.created_at,
            shipBadge: { text: '入库', variant: 'green' },
            icon: ArrowDownToLine,
          }
          groupsMap.set(key, g)
        }
        g.items.push(m)
        g.totalQty += qty
        continue
      }

      sumOut += qty
      const ship = moveShipLabel(m)
      let key: string
      let label: string
      let groupType: MoveGroup['groupType']
      let badge: MoveGroup['shipBadge']
      let icon: MoveGroup['icon']

      if (ship.type === 'online') {
        groupType = GROUP_TYPE.OUT_ONLINE
        key = `ONLINE_${ship.ref}`
        label = ship.ref
        badge = { text: '线上快递', variant: 'blue' }
        icon = Truck
        sumOnline += qty
        onlineCount++
      } else if (ship.type === 'offline') {
        groupType = GROUP_TYPE.OUT_OFFLINE
        // 线下按"客户名 + 创建日期"合并，避免不同日期同客户合并
        const d = new Date(m.created_at)
        const datePart = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
        key = `OFFLINE_${datePart}_${ship.ref}`
        label = ship.ref
        badge = { text: '线下交易', variant: 'purple' }
        icon = Store
        sumOffline += qty
        offlineCount++
      } else {
        groupType = GROUP_TYPE.OUT_OTHER
        key = `OTHER_${m.id}`
        label = m.remark || '未标注出库'
        badge = { text: '其他出库', variant: 'slate' }
        icon = FileText
      }

      let g = groupsMap.get(key)
      if (!g) {
        g = {
          key, groupType, label, subtitle: '',
          items: [], totalQty: 0, uniqueProducts: 0,
          firstTime: m.created_at,
          shipBadge: badge, icon,
        }
        groupsMap.set(key, g)
      }
      g.items.push(m)
      g.totalQty += qty
    }

    // 计算摘要 & 排序
    const list = Array.from(groupsMap.values()).map((g) => {
      g.uniqueProducts = new Set(g.items.map((m) => m.product.id)).size
      const qtyLabel = `${g.totalQty.toLocaleString()} 件`
      g.subtitle = `${g.items.length} 条记录 · ${g.uniqueProducts} 款产品 · ${qtyLabel}`
      g.firstTime = g.items[0]?.created_at || g.firstTime
      return g
    }).sort((a, b) => +new Date(b.firstTime) - +new Date(a.firstTime))

    return {
      groups: list,
      summary: { in: sumIn, out: sumOut, online: sumOnline, offline: sumOffline, onlineCount, offlineCount },
    }
  }, [moves])

  // 搜索分组后的筛选（内容搜索只过滤组，不分页总数）
  const visibleGroups = useMemo(() => {
    if (!search.trim()) return groups
    const kw = search.trim().toLowerCase()
    return groups.filter((g) => g.items.some((m) => {
      if (m.product.name?.toLowerCase().includes(kw)) return true
      if (m.product.sku?.toLowerCase().includes(kw)) return true
      if (m.batch_no?.toLowerCase().includes(kw)) return true
      if (m.remark?.toLowerCase().includes(kw)) return true
      return false
    }))
  }, [groups, search])

  const totalGroups = visibleGroups.length
  const totalPages = Math.max(1, Math.ceil(totalGroups / GROUP_PAGE_SIZE))

  // 筛选条件变化 → 回第 1 页
  useMemo(() => { setPage(1) }, [totalGroups, typeFilter, shipModeFilter, trackingSearch])

  // 分页 slice（按组切）
  const pagedGroups = useMemo(
    () => visibleGroups.slice((page - 1) * GROUP_PAGE_SIZE, page * GROUP_PAGE_SIZE),
    [visibleGroups, page],
  )

  const totalIn = summary.in
  const totalOut = summary.out

  const exportCSV = () => {
    if (!moves?.length) return
    const headers = ['时间', '类型', '产品', 'SKU', '数量', '单位', '仓库', '库位', '批次', '操作方式', '出库类型', '快递单号/备注', '操作人', '备注']
    const rows = moves.map((m) => {
      const ship = moveShipLabel(m)
      return [
        formatDate(m.created_at),
        m.move_type === 'in' ? '入库' : '出库',
        m.product.name,
        m.product.sku || '-',
        Number(m.quantity),
        m.product.unit,
        m.location.warehouse.name || m.location.warehouse.code,
        m.location.code,
        m.batch_no || '',
        m.scan_mode === 'scan' ? '扫码' : '手动',
        ship.type === 'online' ? '线上快递' : ship.type === 'offline' ? '线下交易' : (m.move_type === 'out' ? '其他出库' : '—'),
        ship.ref,
        m.operator?.name || '',
        m.remark || '',
      ]
    })
    const csv = [headers, ...rows].map((row) => row.map((v) => `"${v}"`).join(',')).join('\n')
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `进出库记录_${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const copyText = async (text: string, tag = '内容') => {
    try {
      await navigator.clipboard.writeText(text)
      setCopyToast(`已复制${tag}: ${text}`)
      setTimeout(() => setCopyToast(''), 2200)
    } catch { /* ignore */ }
  }

  const toggleExpand = (k: GroupKey) => {
    setExpanded((s) => {
      // 若当前处于"全开"标记态，先生成全开的字典再反转
      if (s === 'all-on') {
        const base = Object.fromEntries(groups.map((g) => [g.key, true])) as Record<GroupKey, boolean>
        return { ...base, [k]: !base[k] }
      }
      if (s === 'all-off') {
        const base = Object.fromEntries(groups.map((g) => [g.key, false])) as Record<GroupKey, boolean>
        return { ...base, [k]: !base[k] }
      }
      return { ...s, [k]: !s[k] }
    })
  }
  const expandAll = () => setExpanded('all-on')
  const collapseAll = () => setExpanded('all-off')

  // 根据 expanded 状态判断某一组是否展开
  const isGroupOpen = (k: GroupKey) => {
    if (expanded === 'all-on') return true
    if (expanded === 'all-off') return false
    return !!expanded[k]
  }

  return (
    <>
      <div className="space-y-4 max-w-[1400px] mx-auto">
      {/* 页头 */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <div className="flex items-center gap-1.5 text-xs font-medium text-indigo-600 mb-1">
            <Layers className="h-3.5 w-3.5" />
            按单号 / 客户 / 批次 · 聚合展示
          </div>
          <h2 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <FileText className="h-6 w-6 text-indigo-600" /> 进出库记录
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            同一单号下的多产品出库自动合并成 1 组 · 线上快递、线下交易、入库批次分开展示
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={() => refetch()}>刷新</Button>
          <Button variant="outline" size="sm" onClick={exportCSV} disabled={!moves?.length}>
            <Download className="mr-1.5 h-3.5 w-3.5" /> 导出 CSV
          </Button>
        </div>
      </div>

      {/* 复制提示 */}
      {copyToast && (
        <div className="fixed top-6 right-6 z-50 text-xs bg-slate-900/90 text-white px-3 py-2 rounded-lg shadow-xl animate-in fade-in">
          ✓ {copyToast}
        </div>
      )}

      {/* ================ 🆕 顶部全局汇总条（一眼看完全局） ================ */}
      <div className="rounded-2xl border border-slate-200 bg-gradient-to-r from-white via-slate-50/70 to-white shadow-sm p-4 grid grid-cols-2 md:grid-cols-5 gap-3">
        <div className="flex flex-col gap-0.5">
          <div className="text-[11px] font-semibold uppercase text-slate-500 tracking-wide flex items-center gap-1"><Layers className="h-3 w-3" />分组 / 记录</div>
          <div className="text-[22px] font-black tabular-nums text-slate-800 leading-none">
            {groups.length.toLocaleString()}<span className="text-sm text-slate-400 font-semibold ml-1">组</span>
          </div>
          <div className="text-xs text-slate-500 mt-1">{(moves?.length || 0).toLocaleString()} 条明细</div>
        </div>
        <div className="flex flex-col gap-0.5">
          <div className="text-[11px] font-semibold uppercase text-green-600 tracking-wide flex items-center gap-1"><ArrowDownToLine className="h-3 w-3" />入库总量</div>
          <div className="text-[22px] font-black tabular-nums text-green-700 leading-none">+{totalIn.toLocaleString()}</div>
          <div className="text-xs text-slate-500 mt-1">件</div>
        </div>
        <div className="flex flex-col gap-0.5">
          <div className="text-[11px] font-semibold uppercase text-orange-600 tracking-wide flex items-center gap-1"><ArrowUpFromLine className="h-3 w-3" />出库总量</div>
          <div className="text-[22px] font-black tabular-nums text-orange-700 leading-none">-{totalOut.toLocaleString()}</div>
          <div className="text-xs text-slate-500 mt-1">件</div>
        </div>
        <div className="flex flex-col gap-0.5">
          <div className="text-[11px] font-semibold uppercase text-blue-600 tracking-wide flex items-center gap-1"><Truck className="h-3 w-3" />线上快递</div>
          <div className="text-[22px] font-black tabular-nums text-blue-700 leading-none">{summary.online.toLocaleString()}<span className="text-sm text-blue-400 font-semibold ml-1">件</span></div>
          <div className="text-xs text-slate-500 mt-1">{summary.onlineCount.toLocaleString()} 单</div>
        </div>
        <div className="flex flex-col gap-0.5">
          <div className="text-[11px] font-semibold uppercase text-purple-600 tracking-wide flex items-center gap-1"><Store className="h-3 w-3" />线下交易</div>
          <div className="text-[22px] font-black tabular-nums text-purple-700 leading-none">{summary.offline.toLocaleString()}<span className="text-sm text-purple-400 font-semibold ml-1">件</span></div>
          <div className="text-xs text-slate-500 mt-1">{summary.offlineCount.toLocaleString()} 单</div>
        </div>
      </div>

      {/* 筛选 */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Filter className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input placeholder="搜索产品 / SKU / 批次 / 备注 / 客户" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-8" />
        </div>
        <div className="flex items-center gap-1 p-1 bg-muted rounded-md">
          {(['all', 'in', 'out'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTypeFilter(t)}
              className={cn(
                'px-3 py-1.5 text-sm rounded transition-colors',
                typeFilter === t
                  ? 'bg-background shadow-sm' + (t === 'in' ? ' text-green-600' : t === 'out' ? ' text-orange-600' : '')
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {t === 'all' ? '全部' : t === 'in' ? '入库' : '出库'}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1 p-1 bg-muted rounded-md">
          {([
            { k: 'all', label: '全部类型' },
            { k: 'online', label: '线上快递', color: 'text-blue-600' },
            { k: 'offline', label: '线下交易', color: 'text-purple-600' },
          ] as const).map((t) => (
            <button
              key={t.k}
              onClick={() => setShipModeFilter(t.k)}
              disabled={typeFilter === 'in'}
              className={cn(
                'px-3 py-1.5 text-sm rounded transition-colors disabled:opacity-40 disabled:cursor-not-allowed',
                shipModeFilter === t.k ? 'bg-background shadow-sm ' + ((t as any).color || '') : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="relative min-w-[220px]">
          <Truck className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input placeholder="搜索单号 / 线下客户名" value={trackingSearch} onChange={(e) => setTrackingSearch(e.target.value)} className="pl-8" />
        </div>
        <div className="flex items-center gap-1.5 ml-auto">
          <Button variant="ghost" size="sm" onClick={expandAll} disabled={!groups.length}>全部展开</Button>
          <Button variant="ghost" size="sm" onClick={collapseAll} disabled={!groups.length}>全部收起</Button>
        </div>
      </div>

      {/* 分组列表 */}
      <div className="space-y-3">
        {isLoading ? (
          <Card><CardContent className="py-10 text-center text-muted-foreground flex items-center justify-center gap-2">
            <div className="animate-spin rounded-full h-4 w-4 border-2 border-primary border-t-transparent" /> 加载中...
          </CardContent></Card>
        ) : error ? (
          <Card><CardContent className="py-10 text-center text-destructive">
            查询失败：{(error as Error).message}
            <div className="text-xs text-muted-foreground mt-2 font-mono">若提示 tracking_no / is_offline 列不存在，请先在 Supabase SQL Editor 执行迁移文件 0017_tracking_offline.sql</div>
            <Button size="sm" variant="outline" className="mt-2" onClick={() => refetch()}>重试</Button>
          </CardContent></Card>
        ) : visibleGroups.length === 0 ? (
          <Card><CardContent className="py-16 text-center text-muted-foreground">
            <FileText className="h-12 w-12 mx-auto mb-3 opacity-20" />
            <div className="font-medium">暂无符合条件的进出库记录</div>
            <div className="text-xs mt-1 opacity-80">试着调整筛选条件或导出操作</div>
          </CardContent></Card>
        ) : (
          pagedGroups.map((g) => {
            const isOpen = isGroupOpen(g.key)
            const Icon = g.icon
            const isIn = g.groupType === GROUP_TYPE.IN
            const accent = g.shipBadge?.variant === 'blue' ? 'blue' : g.shipBadge?.variant === 'purple' ? 'purple' : g.shipBadge?.variant === 'green' ? 'green' : 'slate'
            const borderClass = accent === 'blue' ? 'border-blue-200'
              : accent === 'purple' ? 'border-purple-200'
              : accent === 'green' ? 'border-green-200'
              : 'border-slate-200'
            const topAccent = accent === 'blue' ? 'from-blue-500 to-indigo-500'
              : accent === 'purple' ? 'from-purple-500 to-fuchsia-500'
              : accent === 'green' ? 'from-emerald-500 to-green-500'
              : 'from-slate-400 to-slate-500'
            const badgeClass =
              accent === 'blue'   ? 'bg-blue-100 text-blue-700 border-blue-200'   :
              accent === 'purple' ? 'bg-purple-100 text-purple-700 border-purple-200' :
              accent === 'green'  ? 'bg-green-100 text-green-700 border-green-200'   :
                                    'bg-slate-100 text-slate-700 border-slate-200'
            const operatorName = g.items[0]?.operator_name || g.items[0]?.operator?.name || '—'
            const openEdit = (e: React.MouseEvent) => {
              e.stopPropagation()
              setEditingGroup(g)
              // 初始化编辑字段
              const first = g.items[0]
              if (g.groupType === GROUP_TYPE.OUT_ONLINE) { setEditShipMode('online'); setEditTrackingNo(first?.tracking_no || g.label || '') }
              else if (g.groupType === GROUP_TYPE.OUT_OFFLINE) { setEditShipMode('offline'); setEditTrackingNo('') }
              else { setEditShipMode('other'); setEditTrackingNo(first?.tracking_no || '') }
              setEditRemark(first?.remark || '')
            }
            return (
              <Card key={g.key} className={cn('overflow-hidden border-2 shadow-sm hover:shadow-md transition-all', borderClass)}>
                {/* 🆕 分组头（点击展开/收起） · 一行显示所有关键信息 */}
                <button
                  onClick={() => toggleExpand(g.key)}
                  className="w-full text-left bg-white hover:bg-slate-50/60 transition-colors relative"
                >
                  <div className={cn('absolute top-0 left-0 right-0 h-[3px] bg-gradient-to-r', topAccent)} />
                  <div className="flex items-center gap-3 px-4 py-3">
                    {/* 折叠指示 */}
                    <div className="flex-shrink-0">
                      {isOpen
                        ? <ChevronDown className="h-5 w-5 text-slate-500" />
                        : <ChevronRight className="h-5 w-5 text-slate-500" />}
                    </div>

                    {/* 图标 + 类型badge + 单号/客户（合并成一行，最左的关键信息） */}
                    <div className={cn(
                      'h-10 w-10 rounded-xl flex items-center justify-center flex-shrink-0 shadow-inner',
                      accent === 'blue'   ? 'bg-gradient-to-br from-blue-50 to-indigo-100'   :
                      accent === 'purple' ? 'bg-gradient-to-br from-purple-50 to-fuchsia-100' :
                      accent === 'green'  ? 'bg-gradient-to-br from-green-50 to-emerald-100'  :
                                            'bg-gradient-to-br from-slate-50 to-slate-200',
                    )}>
                      <Icon className={cn('h-5 w-5',
                        accent === 'blue'   ? 'text-blue-700'   :
                        accent === 'purple' ? 'text-purple-700' :
                        accent === 'green'  ? 'text-green-700'  :
                                              'text-slate-700',
                      )} />
                    </div>

                    {/* 🏷 出库方式 badge */}
                    <Badge variant="outline" className={cn('text-xs font-bold border-0 rounded-lg px-2.5 py-1 flex-shrink-0', badgeClass)}>
                      {g.shipBadge?.text}
                    </Badge>

                    {/* 📦 单号 / 客户名 / 批次号（最醒目位置） */}
                    <h3 className={cn(
                      'font-bold truncate text-[15px]',
                      isIn ? 'text-slate-800' : 'font-mono tracking-wide text-slate-900',
                    )}>
                      {g.label}
                    </h3>

                    {/* 一键复制单号（仅线上快递） */}
                    {g.groupType === GROUP_TYPE.OUT_ONLINE && (
                      <button
                        onClick={(e) => { e.stopPropagation(); copyText(g.label, '单号') }}
                        className="flex-shrink-0 text-xs text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg px-2 py-1 transition-colors inline-flex items-center gap-1 font-medium"
                      >
                        <Copy className="h-3.5 w-3.5" /> 复制单号
                      </button>
                    )}

                    {/* 🧮 关键统计：SKU款数 / 件数（中间分隔） */}
                    <div className="ml-auto flex items-center gap-5 flex-shrink-0 flex-wrap text-sm">
                      {/* 款数 */}
                      <div className="flex flex-col items-end leading-tight">
                        <div className="text-[10px] font-semibold uppercase text-slate-400 tracking-wider">SKU 款</div>
                        <div className="text-base font-black tabular-nums text-slate-700">{g.uniqueProducts}</div>
                      </div>
                      <div className="h-7 w-px bg-slate-200" />
                      {/* 件数 */}
                      <div className="flex flex-col items-end leading-tight">
                        <div className="text-[10px] font-semibold uppercase text-slate-400 tracking-wider">总件数</div>
                        <div className={cn('text-[20px] font-black tabular-nums leading-none', isIn ? 'text-green-700' : 'text-orange-700')}>
                          {isIn ? '+' : '-'}{g.totalQty.toLocaleString()}
                        </div>
                      </div>
                      <div className="h-7 w-px bg-slate-200" />
                      {/* 时间 */}
                      <div className="flex flex-col items-end leading-tight">
                        <div className="text-[10px] font-semibold uppercase text-slate-400 tracking-wider">时间</div>
                        <div className="text-sm font-semibold text-slate-700 tabular-nums whitespace-nowrap">{formatDate(g.firstTime)}</div>
                      </div>
                      <div className="h-7 w-px bg-slate-200" />
                      {/* 操作人 + 编辑按钮 */}
                      <div className="flex flex-col items-end leading-tight">
                        <div className="text-[10px] font-semibold uppercase text-slate-400 tracking-wider">操作人</div>
                        <div className="text-sm font-semibold text-slate-700 whitespace-nowrap">👤 {operatorName}</div>
                      </div>
                      <div className="h-7 w-px bg-slate-200" />
                      <button
                        onClick={openEdit}
                        className="h-8 px-2.5 inline-flex items-center gap-1 text-xs font-bold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-lg transition-colors flex-shrink-0"
                        title="编辑本组：备注 / 单号 / 线上线下"
                      >
                        <Pencil className="h-3.5 w-3.5" /> 编辑
                      </button>
                    </div>
                  </div>
                </button>

                {/* 明细（默认直接展开） */}
                {isOpen && (
                  <div className="border-t border-slate-200/80 bg-slate-50/50">
                    <div className="overflow-x-auto">
                      <table className="w-full text-[13px]">
                        <thead className="bg-slate-100/90 border-b border-slate-200">
                          <tr>
                            <th className="px-4 py-2 text-left text-[11px] font-bold text-slate-600 uppercase tracking-wide">产品</th>
                            <th className="px-4 py-2 text-left text-[11px] font-bold text-slate-600 uppercase tracking-wide w-36">仓库 / 库位</th>
                            <th className="px-4 py-2 text-right text-[11px] font-bold text-slate-600 uppercase tracking-wide w-24">数量</th>
                            <th className="px-4 py-2 text-left text-[11px] font-bold text-slate-600 uppercase tracking-wide w-28">批次</th>
                            <th className="px-4 py-2 text-left text-[11px] font-bold text-slate-600 uppercase tracking-wide w-20">方式</th>
                            <th className="px-4 py-2 text-left text-[11px] font-bold text-slate-600 uppercase tracking-wide w-40">时间</th>
                            <th className="px-4 py-2 text-left text-[11px] font-bold text-slate-600 uppercase tracking-wide">备注</th>
                          </tr>
                        </thead>
                        <tbody>
                          {g.items.map((m, idx) => (
                            <tr key={m.id} className={cn('border-b border-slate-200/50 last:border-0 hover:bg-white transition-colors', idx % 2 && 'bg-white/70')}>
                              {/* 产品：图标 + 名称 + SKU（一眼看清） */}
                              <td className="px-4 py-2">
                                <div className="flex items-center gap-2">
                                  <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-indigo-100 to-violet-100 flex items-center justify-center flex-shrink-0 shadow-sm">
                                    <Package className="h-4 w-4 text-indigo-600" />
                                  </div>
                                  <div className="min-w-0">
                                    <div className="font-semibold text-foreground truncate">{m.product.name}</div>
                                    <div className="text-[11px] text-muted-foreground font-mono mt-0.5">
                                      SKU: {m.product.sku || '—'}
                                    </div>
                                  </div>
                                </div>
                              </td>
                              {/* 仓库 / 库位 */}
                              <td className="px-4 py-2">
                                <div className="font-medium">{m.location.warehouse.name || m.location.warehouse.code}</div>
                                <div className="text-[11px] text-muted-foreground font-mono">位 {m.location.code}</div>
                              </td>
                              {/* 数量（字号大，带单位，一眼注意到） */}
                              <td className="px-4 py-2 text-right">
                                <span className={cn('font-black tabular-nums text-[15px]', isIn ? 'text-green-700' : 'text-orange-700')}>
                                  {isIn ? '+' : '-'}{Number(m.quantity).toLocaleString()}
                                </span>
                                <span className="text-[11px] text-muted-foreground ml-1">{m.product.unit}</span>
                              </td>
                              {/* 批次 */}
                              <td className="px-4 py-2 font-mono text-[12px]">
                                {m.batch_no || <span className="text-muted-foreground">—</span>}
                              </td>
                              {/* 扫码/手动 */}
                              <td className="px-4 py-2">
                                {m.scan_mode === 'scan' ? (
                                  <Badge variant="outline" className="bg-emerald-100 text-emerald-700 border-emerald-200 text-[11px] font-bold px-2 py-0.5 rounded-md">扫码</Badge>
                                ) : (
                                  <Badge variant="outline" className="bg-slate-100 text-slate-700 border-slate-200 text-[11px] font-bold px-2 py-0.5 rounded-md">手动</Badge>
                                )}
                              </td>
                              {/* 时间 */}
                              <td className="px-4 py-2">
                                <div className="text-[12px] font-medium text-slate-700 tabular-nums whitespace-nowrap">{formatDate(m.created_at)}</div>
                              </td>
                              {/* 备注 */}
                              <td className="px-4 py-2 text-[12px] text-slate-600 max-w-[260px]">
                                {m.remark ? (
                                  <div className="whitespace-pre-wrap break-words truncate" title={m.remark}>{m.remark}</div>
                                ) : <span className="text-muted-foreground/60">—</span>}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </Card>
            )
          })
        )}
      </div>

      {/* 🆕 组分页条（按「订单/批次」为单位翻页，不是按明细行翻） */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-1 py-2 text-sm flex-wrap">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => { setPage(1); scrollToTopOfPage() }}>首页</Button>
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => { setPage(page - 1); scrollToTopOfPage() }}>上一页</Button>
          {buildPageRange(page, totalPages).map((p, i) =>
            typeof p === 'number' ? (
              <Button key={i} variant={p === page ? 'default' : 'outline'} size="sm"
                onClick={() => { setPage(p); scrollToTopOfPage() }}>
                {p}
              </Button>
            ) : (
              <span key={i} className="px-1 text-muted-foreground">…</span>
            ),
          )}
          <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => { setPage(page + 1); scrollToTopOfPage() }}>下一页</Button>
          <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => { setPage(totalPages); scrollToTopOfPage() }}>末页</Button>
          <span className="text-muted-foreground ml-2">第 {page}/{totalPages} 页 · 共 {totalGroups} 组 / {(moves?.length || 0).toLocaleString()} 条明细</span>
        </div>
      )}
    </div>

    {/* 编辑对话框：改备注 / 补单号 / 切换线上线下 */}
    <Dialog open={!!editingGroup} onOpenChange={(o) => !o && setEditingGroup(null)}>
      <DialogContent className="sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Pencil className="h-5 w-5 text-indigo-600" />
            编辑订单：{editingGroup?.label || '—'}
            <span className="text-xs font-normal text-muted-foreground ml-1">
              （含 {editingGroup?.items.length || 0} 条流水）
            </span>
          </DialogTitle>
        </DialogHeader>
        {editingGroup && editingGroup.groupType !== GROUP_TYPE.IN && (
          <div className="space-y-3">
            <Label>出库方式</Label>
            <div className="grid grid-cols-3 gap-2">
              {(['online','offline','other'] as const).map((m) => {
                const active = editShipMode === m
                const texts = { online: '线上快递', offline: '线下交易', other: '其他出库' }
                return (
                  <button key={m} type="button"
                    onClick={() => setEditShipMode(m)}
                    className={`p-3 rounded-xl border-2 text-sm font-semibold transition ${
                      active
                        ? m === 'online' ? 'bg-blue-50 border-blue-500 text-blue-800'
                        : m === 'offline' ? 'bg-emerald-50 border-emerald-500 text-emerald-800'
                        : 'bg-slate-100 border-slate-500 text-slate-800'
                        : 'bg-background border-border text-muted-foreground hover:bg-muted/40'
                    }`}
                  >{texts[m]}</button>
                )
              })}
            </div>
          </div>
        )}
        <div className="space-y-2">
          <Label htmlFor="edit_tracking_no">快递单号 {editShipMode !== 'online' && <span className="text-xs text-muted-foreground">（选填）</span>}</Label>
          <Input id="edit_tracking_no"
            disabled={editShipMode === 'offline'}
            value={editShipMode === 'offline' ? '（线下，不写单号）' : editTrackingNo}
            onChange={(e) => setEditTrackingNo(e.target.value)}
            placeholder="例如：SF1234567890"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="edit_remark">备注 <span className="text-xs text-muted-foreground">（后补充内容写这里，写了会覆盖本组所有流水原有备注）</span></Label>
          <Textarea id="edit_remark" value={editRemark} onChange={(e) => setEditRemark(e.target.value)}
            rows={3} placeholder="例如：客户自提 / 赠品 / 补录单号 SFxxxx" />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setEditingGroup(null)} disabled={savingEdit}>
            <X className="h-4 w-4 mr-1" /> 取消
          </Button>
          <Button disabled={savingEdit} onClick={async () => {
            const g = editingGroup
            if (!g) return
            setSavingEdit(true)
            try {
              const ids = g.items.map((m) => m.id)
              const patch: Record<string, any> = {}
              if (g.groupType !== GROUP_TYPE.IN) {
                patch.tracking_no = editShipMode === 'online' ? (editTrackingNo.trim() || null) : null
                patch.is_offline = editShipMode === 'offline' ? true : (editShipMode === 'online' ? false : g.items[0]?.is_offline ?? null)
              } else {
                patch.tracking_no = editTrackingNo.trim() || null
              }
              patch.remark = editRemark.trim() || null
              const { error } = await supabase.from('stock_moves').update(patch).in('id', ids)
              if (error) throw error
              toast.success('✅ 已保存')
              setEditingGroup(null)
              await queryClient.invalidateQueries({ queryKey: ['stock-moves'] })
              await queryClient.invalidateQueries({ queryKey: ['sales-velocity-30d'] })
            } catch (e: any) {
              console.error('[编辑订单失败]', e)
              toast.error(e?.message || '保存失败')
            } finally {
              setSavingEdit(false)
            }
          }}>
            <Check className="h-4 w-4 mr-1" /> {savingEdit ? '保存中...' : '保存'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    </>
  )
}
