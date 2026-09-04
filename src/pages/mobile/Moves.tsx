import { useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  ChevronDown,
  ChevronRight,
  Copy,
  Package,
  Pencil,
  Check,
  Search,
  Store,
  Truck,
  X,
  FileText,
  Layers,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { buildPageRange, cn, formatDate, scrollToTopOfPage } from '@/lib/utils'

type MoveRow = {
  id: string
  move_type: 'in' | 'out'
  quantity: number
  scan_mode: string
  batch_no: string | null
  remark: string | null
  tracking_no?: string | null
  is_offline?: boolean | null
  operator_name?: string | null
  created_at: string
  product: { id: string; name: string; sku: string | null; unit: string }
  location: { id: string; code: string; warehouse: { id: string; code: string; name: string | null } }
  operator?: { id: string; name: string | null } | null
}

type Group = {
  key: string
  type: (typeof GROUP_TYPE)[keyof typeof GROUP_TYPE]
  title: string           // 单号 / 客户名 / 入库批次
  items: MoveRow[]
  totalQty: number
  firstTime: string
  uniqueProducts: number
  accent: 'blue' | 'purple' | 'green' | 'slate'
  icon: typeof Truck | typeof Store | typeof ArrowDownToLine | typeof FileText
  badgeLabel: string
}

const GROUP_PAGE_SIZE = 12 // 移动端：每组卡片比较高，每页 12 组
const GROUP_TYPE = {
  OUT_ONLINE: 'online_out',
  OUT_OFFLINE: 'offline_out',
  OUT_OTHER: 'other_out',
  IN: 'in',
} as const

function shipInfo(m: MoveRow): { type: 'online' | 'offline' | 'other'; ref: string } {
  if (m.move_type !== 'out') return { type: 'other', ref: '—' }
  if (typeof m.is_offline === 'boolean' && m.is_offline) {
    let r = m.remark || '线下客户'
    if (r.startsWith('线下:')) r = r.slice(3)
    return { type: 'offline', ref: r || '线下客户' }
  }
  if (m.tracking_no) return { type: 'online', ref: m.tracking_no }
  return { type: 'other', ref: m.remark || '—' }
}

export default function MobileMoves() {
  const queryClient = useQueryClient()
  const [typeFilter, setTypeFilter] = useState<'all' | 'in' | 'out'>('all')
  const [shipModeFilter, setShipModeFilter] = useState<'all' | 'online' | 'offline'>('all')
  const [trackingSearch, setTrackingSearch] = useState('')
  const [showTrackingInput, setShowTrackingInput] = useState(false)
  const [search, setSearch] = useState('')
  const [showSearch, setShowSearch] = useState(false)
  const [expanded, setExpanded] = useState<Record<string, boolean> | 'all-on' | 'all-off'>('all-on')
  const [copyToast, setCopyToast] = useState('')
  const [page, setPage] = useState(1)

  // 组级编辑
  const [editingGroup, setEditingGroup] = useState<Group | null>(null)
  const [editShipMode, setEditShipMode] = useState<'online' | 'offline' | 'other'>('other')
  const [editTrackingNo, setEditTrackingNo] = useState('')
  const [editRemark, setEditRemark] = useState('')
  const [savingEdit, setSavingEdit] = useState(false)

  const { data: moves, isLoading, error, refetch } = useQuery({
    queryKey: ['m-stock-moves-v2', typeFilter, shipModeFilter, trackingSearch],
    queryFn: async () => {
      // 稳定字段直接查：tracking_no / is_offline / operator_name
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
        .limit(300) as any
      if (typeFilter !== 'all') qb = qb.eq('move_type', typeFilter)
      const { data, error: err } = await qb
      if (err) throw err
      const rows = (data || []) as MoveRow[]
      const s = search?.toLowerCase() || ''
      const ts = trackingSearch?.toLowerCase() || ''
      return rows.filter((r) => {
        if (typeFilter !== 'all' && r.move_type !== typeFilter) return false
        const ship = shipInfo(r)
        if (shipModeFilter === 'online' && ship.type !== 'online') return false
        if (shipModeFilter === 'offline' && ship.type !== 'offline') return false
        if (ts && !ship.ref.toLowerCase().includes(ts)) return false
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
  })

  // 分组逻辑
  const { groups, summary } = useMemo<{
    groups: Group[]
    summary: { in: number; out: number; online: number; offline: number; onlineCount: number; offlineCount: number }
  }>(() => {
    const rows = moves || []
    const map = new Map<string, Group>()
    let inIdx = 0
    const inBucket = new Map<string, string>()
    let sumIn = 0, sumOut = 0, sumOnline = 0, sumOffline = 0, onlineCount = 0, offlineCount = 0

    for (const r of rows) {
      const qty = Number(r.quantity)
      if (r.move_type === 'in') {
        sumIn += qty
        const t = new Date(r.created_at)
        const bucket = `${t.getFullYear()}-${t.getMonth()}-${t.getDate()}-${t.getHours()}-${Math.floor(t.getMinutes() / 10)}_${(r.operator as any)?.id || 'anon'}`
        let key = inBucket.get(bucket)
        if (!key) { key = `IN_${inIdx++}_${bucket}`; inBucket.set(bucket, key) }
        let g = map.get(key)
        if (!g) {
          g = {
            key, type: GROUP_TYPE.IN,
            title: `入库 ${t.toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}`,
            items: [], totalQty: 0, firstTime: r.created_at, uniqueProducts: 0,
            accent: 'green', icon: ArrowDownToLine, badgeLabel: '入库',
          }
          map.set(key, g)
        }
        g.items.push(r); g.totalQty += qty
        continue
      }

      sumOut += qty
      const ship = shipInfo(r)
      let key: string, accent: Group['accent'], badgeLabel: string, icon: Group['icon'], type: Group['type']
      if (ship.type === 'online') {
        key = `ONLINE_${ship.ref}`
        accent = 'blue'; badgeLabel = '线上快递'; icon = Truck; type = GROUP_TYPE.OUT_ONLINE
        sumOnline += qty; onlineCount++
      } else if (ship.type === 'offline') {
        const d = new Date(r.created_at)
        const datePart = `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`
        key = `OFFLINE_${datePart}_${ship.ref}`
        accent = 'purple'; badgeLabel = '线下交易'; icon = Store; type = GROUP_TYPE.OUT_OFFLINE
        sumOffline += qty; offlineCount++
      } else {
        key = `OTHER_${r.id}`
        accent = 'slate'; badgeLabel = '其他出库'; icon = FileText; type = GROUP_TYPE.OUT_OTHER
      }
      let g = map.get(key)
      if (!g) {
        g = {
          key, type, title: ship.ref,
          items: [], totalQty: 0, firstTime: r.created_at, uniqueProducts: 0,
          accent, icon, badgeLabel,
        }
        map.set(key, g)
      }
      g.items.push(r); g.totalQty += qty
    }

    const list = Array.from(map.values()).map((g) => {
      g.uniqueProducts = new Set(g.items.map((i) => i.product.id)).size
      g.firstTime = g.items[0]?.created_at || g.firstTime
      return g
    }).sort((a, b) => +new Date(b.firstTime) - +new Date(a.firstTime))
    return {
      groups: list,
      summary: {
        in: sumIn, out: sumOut,
        online: sumOnline, offline: sumOffline,
        onlineCount, offlineCount,
      },
    }
  }, [moves])

  // 🆕 搜索（产品/SKU/批次/备注）过滤 + 组分页
  const visibleGroups = useMemo(() => {
    if (!search.trim()) return groups
    const kw = search.trim().toLowerCase()
    return groups.filter((g) => g.items.some((m) =>
      (m.product.name || '').toLowerCase().includes(kw) ||
      (m.product.sku || '').toLowerCase().includes(kw) ||
      (m.batch_no || '').toLowerCase().includes(kw) ||
      (m.remark || '').toLowerCase().includes(kw),
    ))
  }, [groups, search])

  const totalGroups = visibleGroups.length
  const totalPages = Math.max(1, Math.ceil(totalGroups / GROUP_PAGE_SIZE))

  // 筛选变化 → 回第 1 页
  useMemo(() => { setPage(1) }, [totalGroups, typeFilter, shipModeFilter, trackingSearch])

  const pagedGroups = useMemo(
    () => visibleGroups.slice((page - 1) * GROUP_PAGE_SIZE, page * GROUP_PAGE_SIZE),
    [visibleGroups, page],
  )

  const copy = async (text: string, tag = '内容') => {
    try {
      await navigator.clipboard.writeText(text)
      setCopyToast(`已复制${tag}`)
      setTimeout(() => setCopyToast(''), 2000)
    } catch { /* ignore */ }
  }
  const toggle = (k: string) => setExpanded((s) => {
    if (s === 'all-on') {
      const base = Object.fromEntries(groups.map((g) => [g.key, true]))
      return { ...base, [k]: !base[k] }
    }
    if (s === 'all-off') {
      const base = Object.fromEntries(groups.map((g) => [g.key, false]))
      return { ...base, [k]: !base[k] }
    }
    return { ...s, [k]: !s[k] }
  })
  const isOpen = (k: string) => {
    if (expanded === 'all-on') return true
    if (expanded === 'all-off') return false
    return !!expanded[k]
  }

  return (
    <>
      <div className="p-3 space-y-3 pb-24">
      {copyToast && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 text-xs bg-slate-900/90 text-white px-3 py-2 rounded-lg shadow-xl">
          ✓ {copyToast}
        </div>
      )}

      {/* ================ 🆕 顶部 5 张汇总卡（一眼看全） ================ */}
      <div className="rounded-2xl bg-gradient-to-br from-slate-50 via-white to-indigo-50/40 p-3 border border-slate-200 shadow-sm space-y-3">
        <div className="flex items-center gap-1.5 text-[11px] font-medium text-indigo-600">
          <Layers className="h-3 w-3" /> 当前筛选 · 一眼全局
        </div>
        <div className="grid grid-cols-5 gap-1.5">
          <div className="rounded-xl bg-white border border-slate-100 shadow-inner p-2 flex flex-col items-center justify-center">
            <div className="text-[9px] font-bold text-slate-400 uppercase tracking-wide">分组</div>
            <div className="text-lg font-black tabular-nums text-slate-800 leading-none mt-1">{groups.length}</div>
          </div>
          <div className="rounded-xl bg-gradient-to-br from-green-50 to-white border border-green-100 shadow-inner p-2 flex flex-col items-center justify-center">
            <div className="text-[9px] font-bold text-green-600 uppercase tracking-wide flex items-center gap-0.5"><ArrowDownToLine className="h-2.5 w-2.5" />入库</div>
            <div className="text-lg font-black tabular-nums text-green-700 leading-none mt-1">+{summary.in.toLocaleString()}</div>
          </div>
          <div className="rounded-xl bg-gradient-to-br from-orange-50 to-white border border-orange-100 shadow-inner p-2 flex flex-col items-center justify-center">
            <div className="text-[9px] font-bold text-orange-600 uppercase tracking-wide flex items-center gap-0.5"><ArrowUpFromLine className="h-2.5 w-2.5" />出库</div>
            <div className="text-lg font-black tabular-nums text-orange-700 leading-none mt-1">-{summary.out.toLocaleString()}</div>
          </div>
          <div className="rounded-xl bg-gradient-to-br from-blue-50 to-white border border-blue-100 shadow-inner p-2 flex flex-col items-center justify-center">
            <div className="text-[9px] font-bold text-blue-600 uppercase tracking-wide flex items-center gap-0.5"><Truck className="h-2.5 w-2.5" />线上</div>
            <div className="text-lg font-black tabular-nums text-blue-700 leading-none mt-1">{summary.online.toLocaleString()}</div>
          </div>
          <div className="rounded-xl bg-gradient-to-br from-purple-50 to-white border border-purple-100 shadow-inner p-2 flex flex-col items-center justify-center">
            <div className="text-[9px] font-bold text-purple-600 uppercase tracking-wide flex items-center gap-0.5"><Store className="h-2.5 w-2.5" />线下</div>
            <div className="text-lg font-black tabular-nums text-purple-700 leading-none mt-1">{summary.offline.toLocaleString()}</div>
          </div>
        </div>
        {/* 全展开/全收起按钮（移动端也要） */}
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setExpanded('all-on')}
            className={cn('flex-1 py-1.5 text-[11px] font-semibold rounded-lg border transition-colors',
              expanded === 'all-on' ? 'bg-indigo-50 border-indigo-200 text-indigo-700' : 'bg-white border-slate-200 text-slate-500')}
          >全部展开</button>
          <button
            onClick={() => setExpanded('all-off')}
            className={cn('flex-1 py-1.5 text-[11px] font-semibold rounded-lg border transition-colors',
              expanded === 'all-off' ? 'bg-slate-100 border-slate-200 text-slate-700' : 'bg-white border-slate-200 text-slate-500')}
          >全部收起</button>
        </div>
      </div>

      {/* 类型筛选 */}
      <div className="flex items-center gap-1 p-1 bg-muted rounded-xl">
        {(['all', 'in', 'out'] as const).map((t) => (
          <button
            key={t}
            onClick={() => { setTypeFilter(t); if (t === 'in') setShipModeFilter('all') }}
            className={cn(
              'flex-1 py-2 rounded-lg text-[12px] font-semibold transition-colors',
              typeFilter === t ? 'bg-white shadow-sm' : 'text-muted-foreground',
              typeFilter === t && t === 'in' && 'text-green-700',
              typeFilter === t && t === 'out' && 'text-orange-700',
            )}
          >
            {t === 'all' ? '全部' : t === 'in' ? '入库' : '出库'}
          </button>
        ))}
      </div>

      {/* 出库方式 + 搜索按钮 */}
      <div className="flex items-center gap-2">
        <div className="flex-1 flex items-center gap-1 p-1 bg-muted rounded-xl">
          <button
            onClick={() => setShipModeFilter('all')}
            disabled={typeFilter === 'in'}
            className={cn('flex-1 py-1.5 rounded-lg text-[12px] font-semibold transition-colors disabled:opacity-40',
              shipModeFilter === 'all' ? 'bg-white shadow-sm' : 'text-muted-foreground')}
          >全部</button>
          <button
            onClick={() => setShipModeFilter('online')}
            disabled={typeFilter === 'in'}
            className={cn('flex-1 py-1.5 rounded-lg text-[12px] font-semibold transition-colors disabled:opacity-40',
              shipModeFilter === 'online' ? 'bg-blue-50 shadow-sm text-blue-700' : 'text-muted-foreground')}
          >快递</button>
          <button
            onClick={() => setShipModeFilter('offline')}
            disabled={typeFilter === 'in'}
            className={cn('flex-1 py-1.5 rounded-lg text-[12px] font-semibold transition-colors disabled:opacity-40',
              shipModeFilter === 'offline' ? 'bg-purple-50 shadow-sm text-purple-700' : 'text-muted-foreground')}
          >线下</button>
        </div>
        <button
          onClick={() => { setShowTrackingInput(!showTrackingInput); if (showSearch) setShowSearch(false) }}
          className={cn('p-2.5 rounded-xl border transition-colors',
            showTrackingInput || trackingSearch ? 'bg-blue-50 border-blue-200 text-blue-700' : 'bg-background border-border text-muted-foreground')}
        >
          <Truck className="h-4 w-4" />
        </button>
        <button
          onClick={() => { setShowSearch(!showSearch); if (showTrackingInput) setShowTrackingInput(false) }}
          className={cn('p-2.5 rounded-xl border transition-colors',
            showSearch || search ? 'bg-indigo-50 border-indigo-200 text-indigo-700' : 'bg-background border-border text-muted-foreground')}
        >
          <Search className="h-4 w-4" />
        </button>
      </div>

      {showTrackingInput && (
        <div className="flex items-center gap-2 animate-in slide-in-from-top-2">
          <div className="relative flex-1">
            <Truck className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <input
              type="text" value={trackingSearch}
              onChange={(e) => setTrackingSearch(e.target.value)}
              placeholder="搜索快递单号/客户名..."
              className="w-full h-10 pl-8 pr-3 text-sm rounded-xl border border-input bg-background focus:outline-none focus:ring-2 focus:ring-blue-400/40"
            />
          </div>
          {trackingSearch && (
            <button onClick={() => setTrackingSearch('')} className="p-2 rounded-xl border border-border text-muted-foreground hover:bg-muted">
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      )}

      {showSearch && (
        <div className="flex items-center gap-2 animate-in slide-in-from-top-2">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <input
              type="text" value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="搜索产品/SKU/批次/备注..."
              className="w-full h-10 pl-8 pr-3 text-sm rounded-xl border border-input bg-background focus:outline-none focus:ring-2 focus:ring-indigo-400/40"
            />
          </div>
          {search && (
            <button onClick={() => setSearch('')} className="p-2 rounded-xl border border-border text-muted-foreground hover:bg-muted">
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      )}

      {/* 列表 */}
      {isLoading ? (
        <div className="text-center py-16 text-sm text-muted-foreground flex items-center justify-center gap-2">
          <div className="animate-spin rounded-full h-4 w-4 border-2 border-primary border-t-transparent" />加载中...
        </div>
      ) : error ? (
        <div className="text-center py-12 text-xs text-destructive px-4">
          查询失败：{(error as Error).message}
          <div className="mt-2 text-muted-foreground">若提示 tracking_no/is_offline 列不存在，请先执行迁移 0017</div>
          <button onClick={() => refetch()} className="mt-2 px-3 py-1.5 rounded-lg border text-xs bg-background">重试</button>
        </div>
      ) : groups.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <FileText className="h-10 w-10 mx-auto mb-2 opacity-20" />
          <div className="text-sm font-medium">暂无记录</div>
          <div className="text-xs mt-1 opacity-80">修改筛选条件再试试</div>
        </div>
      ) : (
        <div className="space-y-2.5">
          {pagedGroups.map((g) => {
            const open = isOpen(g.key)
            const Icon = g.icon
            const isIn = g.type === GROUP_TYPE.IN
            const operatorName = g.items[0]?.operator_name || g.items[0]?.operator?.name || '—'
            const openEdit = (e: React.MouseEvent) => {
              e.stopPropagation()
              setEditingGroup(g)
              const first = g.items[0]
              if (g.type === GROUP_TYPE.OUT_ONLINE) { setEditShipMode('online'); setEditTrackingNo(first?.tracking_no || g.title || '') }
              else if (g.type === GROUP_TYPE.OUT_OFFLINE) { setEditShipMode('offline'); setEditTrackingNo('') }
              else { setEditShipMode('other'); setEditTrackingNo(first?.tracking_no || '') }
              setEditRemark(first?.remark || '')
            }
            const accentBg =
              g.accent === 'blue' ? 'bg-gradient-to-br from-blue-100 to-indigo-100 text-blue-700' :
              g.accent === 'purple' ? 'bg-gradient-to-br from-purple-100 to-fuchsia-100 text-purple-700' :
              g.accent === 'green' ? 'bg-gradient-to-br from-green-100 to-emerald-100 text-green-700' :
              'bg-gradient-to-br from-slate-100 to-slate-200 text-slate-700'
            const badgeClass =
              g.accent === 'blue' ? 'bg-blue-100 text-blue-700 border-blue-200' :
              g.accent === 'purple' ? 'bg-purple-100 text-purple-700 border-purple-200' :
              g.accent === 'green' ? 'bg-green-100 text-green-700 border-green-200' :
              'bg-slate-100 text-slate-700 border-slate-200'
            const topStripe =
              g.accent === 'blue' ? 'bg-gradient-to-r from-blue-500 to-indigo-500' :
              g.accent === 'purple' ? 'bg-gradient-to-r from-purple-500 to-fuchsia-500' :
              g.accent === 'green' ? 'bg-gradient-to-r from-emerald-500 to-green-500' :
              'bg-gradient-to-r from-slate-400 to-slate-500'
            return (
              <div key={g.key} className="rounded-2xl border-2 shadow-sm overflow-hidden bg-white transition-all hover:shadow-md"
                style={{ borderColor:
                  g.accent === 'blue' ? '#bfdbfe' :
                  g.accent === 'purple' ? '#e9d5ff' :
                  g.accent === 'green' ? '#bbf7d0' :
                  '#e2e8f0'
                }}
              >
                <div className={cn('h-1', topStripe)} />
                <button onClick={() => toggle(g.key)} className="w-full text-left">
                  {/* 🆕 组头：关键信息一行全覆盖（图标/badge/单号+复制/款数/件数/时间/操作人） */}
                  <div className="px-3 py-2.5 flex items-start gap-2">
                    {/* 图标 + 折叠指示（左） */}
                    <div className="flex flex-col items-center gap-1 flex-shrink-0 pt-0.5">
                      <div className={cn('h-9 w-9 rounded-xl flex items-center justify-center shadow-inner', accentBg)}>
                        <Icon className="h-4.5 w-4.5" />
                      </div>
                      {open
                        ? <ChevronDown className="h-3.5 w-3.5 text-slate-500" />
                        : <ChevronRight className="h-3.5 w-3.5 text-slate-500" />}
                    </div>

                    <div className="flex-1 min-w-0 space-y-1">
                      {/* 第一行：类型 badge + 单号/客户 + 复制按钮 */}
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className={cn('inline-flex items-center px-2 py-0.5 rounded-full border text-[10px] font-bold', badgeClass)}>
                          {g.badgeLabel}
                        </span>
                        <h3 className={cn(
                          'font-black text-[14px] break-words leading-tight',
                          g.type === GROUP_TYPE.OUT_ONLINE ? 'font-mono tracking-wider text-slate-900' :
                          g.type === GROUP_TYPE.OUT_OFFLINE ? 'text-purple-900' :
                          g.type === GROUP_TYPE.IN ? 'text-green-900' : 'text-slate-800',
                        )}>
                          {g.title}
                        </h3>
                        {g.type === GROUP_TYPE.OUT_ONLINE && (
                          <button onClick={(e) => { e.stopPropagation(); copy(g.title, '单号') }}
                            className="text-[10px] text-blue-700 inline-flex items-center gap-0.5 bg-blue-50 border border-blue-100 px-1.5 py-0.5 rounded hover:bg-blue-100 font-semibold flex-shrink-0">
                            <Copy className="h-2.5 w-2.5" />复制单号
                          </button>
                        )}
                      </div>

                      {/* 第二行：款数 · 条数 · 时间 · 操作人（一眼全知道） */}
                      <div className="flex items-center gap-1.5 flex-wrap text-[11px]">
                        <span className="inline-flex items-center gap-0.5 bg-slate-100 text-slate-700 rounded-md px-1.5 py-0.5 font-semibold">
                          <Package className="h-3 w-3" />
                          {g.uniqueProducts}款 · {g.items.length}条
                        </span>
                        <span className="inline-flex items-center gap-0.5 bg-slate-50 text-slate-600 rounded-md px-1.5 py-0.5 font-medium">
                          ⏱ {formatDate(g.firstTime)}
                        </span>
                        <span className="inline-flex items-center gap-0.5 bg-indigo-50 text-indigo-700 rounded-md px-1.5 py-0.5 font-medium">
                          👤 {operatorName}
                        </span>
                      </div>
                    </div>

                    {/* 右侧：大号数量 + 编辑按钮 */}
                    <div className="flex flex-col items-end gap-1 flex-shrink-0 pt-1">
                      <div className={cn('text-[22px] font-black tabular-nums leading-none',
                        isIn ? 'text-green-700' : 'text-orange-700')}>
                        {isIn ? '+' : '-'}{g.totalQty.toLocaleString()}
                      </div>
                      <button
                        onClick={openEdit}
                        className="text-[10px] font-bold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-md px-1.5 py-0.5 inline-flex items-center gap-0.5 transition-colors"
                      >
                        <Pencil className="h-3 w-3" /> 编辑
                      </button>
                    </div>
                  </div>
                </button>

                {/* 明细（默认直接展开） */}
                {open && (
                  <div className="border-t border-slate-200 bg-slate-50/70">
                    <div className="divide-y divide-slate-200/70">
                      {g.items.map((m) => (
                        <div key={m.id} className="px-2.5 py-2.5 flex items-start gap-2">
                          {/* 方向图标 */}
                          <div className={cn('h-9 w-9 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5 shadow-sm',
                            m.move_type === 'in'
                              ? 'bg-gradient-to-br from-green-100 to-emerald-100 text-green-700'
                              : 'bg-gradient-to-br from-orange-100 to-amber-100 text-orange-700')}>
                            {m.move_type === 'in'
                              ? <ArrowDownToLine className="h-4 w-4" />
                              : <ArrowUpFromLine className="h-4 w-4" />}
                          </div>

                          {/* 中间信息（大字号、紧凑、层次分明） */}
                          <div className="flex-1 min-w-0 space-y-1">
                            {/* 第一行：产品名 + 大数量 */}
                            <div className="flex items-start justify-between gap-2">
                              <div className="text-[14px] font-bold leading-tight text-slate-900 break-words">{m.product.name}</div>
                              <div className={cn('text-[17px] font-black tabular-nums leading-none flex-shrink-0 pt-0.5',
                                m.move_type === 'in' ? 'text-green-700' : 'text-orange-700')}>
                                {m.move_type === 'in' ? '+' : '-'}{Number(m.quantity)}
                                <span className="text-[10px] font-semibold text-slate-400 ml-0.5">{m.product.unit}</span>
                              </div>
                            </div>
                            {/* 第二行：SKU · 仓库 · 库位 */}
                            <div className="text-[11.5px] text-slate-600 flex items-center gap-1.5 flex-wrap leading-tight">
                              <span className="inline-flex items-center gap-0.5">
                                <Package className="h-3 w-3 text-slate-400" />
                                <span className="font-mono font-medium">{m.product.sku || '—'}</span>
                              </span>
                              <span className="text-slate-300">·</span>
                              <span>{m.location.warehouse.name || m.location.warehouse.code}</span>
                              <span className="text-slate-300">·</span>
                              <span className="font-mono">位 {m.location.code}</span>
                            </div>
                            {/* 第三行：方式 badge + 批次 badge + 时间 */}
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-semibold border"
                                style={m.scan_mode === 'scan'
                                  ? { background: '#d1fae5', color: '#047857', borderColor: '#a7f3d0' }
                                  : { background: '#f1f5f9', color: '#475569', borderColor: '#e2e8f0' }}>
                                {m.scan_mode === 'scan' ? '扫码' : '手动'}
                              </span>
                              {m.batch_no && (
                                <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-mono border"
                                  style={{ background: '#fef3c7', color: '#92400e', borderColor: '#fde68a' }}>
                                  批次 {m.batch_no}
                                </span>
                              )}
                              <span className="text-[10.5px] text-slate-500 tabular-nums flex-shrink-0">⏱ {formatDate(m.created_at)}</span>
                            </div>
                            {/* 第四行：备注（气泡样式） */}
                            {m.remark && (
                              <div className="text-[11.5px] text-slate-700 bg-white rounded-lg border border-slate-200 px-2 py-1.5 mt-1 break-words shadow-sm">
                                📝 {m.remark}
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* 组分页条 */}
      {totalPages > 1 && (
        <div className="px-1 flex items-center justify-center gap-1 flex-wrap text-xs pb-4">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => { setPage(1); scrollToTopOfPage() }}>首页</Button>
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => { setPage(page - 1); scrollToTopOfPage() }}>上一页</Button>
          {buildPageRange(page, totalPages, 3).map((p, i) =>
            typeof p === 'number' ? (
              <Button key={i} variant={p === page ? 'default' : 'outline'} size="sm"
                onClick={() => { setPage(p); scrollToTopOfPage() }}>
                {p}
              </Button>
            ) : (
              <span key={i} className="px-0.5 text-muted-foreground text-xs">…</span>
            ),
          )}
          <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => { setPage(page + 1); scrollToTopOfPage() }}>下一页</Button>
          <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => { setPage(totalPages); scrollToTopOfPage() }}>末页</Button>
          <span className="w-full text-center pt-1 text-[11px] text-muted-foreground">第 {page}/{totalPages} 页 · 共 {totalGroups} 组 / {(moves?.length || 0).toLocaleString()} 条明细</span>
        </div>
      )}
    </div>

    {/* 编辑对话框：改备注 / 补单号 / 切线上线下 */}
    <Dialog open={!!editingGroup} onOpenChange={(o) => !o && setEditingGroup(null)}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Pencil className="h-4 w-4 text-indigo-600" />
            编辑订单
            <span className="text-xs font-normal text-muted-foreground ml-1">
              （{editingGroup?.items.length || 0} 条流水）
            </span>
          </DialogTitle>
        </DialogHeader>
        {editingGroup && editingGroup.type !== GROUP_TYPE.IN && (
          <div className="space-y-2">
            <Label className="text-xs">出库方式</Label>
            <div className="grid grid-cols-3 gap-2">
              {(['online','offline','other'] as const).map((m) => {
                const active = editShipMode === m
                const texts = { online: '线上快递', offline: '线下交易', other: '其他出库' }
                return (
                  <button key={m} type="button"
                    onClick={() => setEditShipMode(m)}
                    className={`p-2.5 rounded-xl border-2 text-xs font-semibold transition ${
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
        <div className="space-y-2 mt-3">
          <Label htmlFor="m_edit_tracking_no" className="text-xs">快递单号 {editShipMode !== 'online' && <span className="text-muted-foreground">（选填）</span>}</Label>
          <Input id="m_edit_tracking_no"
            disabled={editShipMode === 'offline'}
            value={editShipMode === 'offline' ? '（线下，不写单号）' : editTrackingNo}
            onChange={(e) => setEditTrackingNo(e.target.value)}
            placeholder="例如：SF1234567890"
            className="h-10"
          />
        </div>
        <div className="space-y-2 mt-3">
          <Label htmlFor="m_edit_remark" className="text-xs">备注 <span className="text-muted-foreground">（会覆盖本组所有流水的备注）</span></Label>
          <Textarea id="m_edit_remark" value={editRemark} onChange={(e) => setEditRemark(e.target.value)}
            rows={3} placeholder="例如：客户自提 / 赠品 / 补录单号"
            className="text-sm"
          />
        </div>
        <DialogFooter className="mt-4">
          <Button variant="ghost" size="sm" onClick={() => setEditingGroup(null)} disabled={savingEdit}>
            <X className="h-3.5 w-3.5 mr-1" /> 取消
          </Button>
          <Button size="sm" disabled={savingEdit} onClick={async () => {
            const g = editingGroup
            if (!g) return
            setSavingEdit(true)
            try {
              const ids = g.items.map((m) => m.id)
              const patch: Record<string, any> = {}
              if (g.type !== GROUP_TYPE.IN) {
                patch.tracking_no = editShipMode === 'online' ? (editTrackingNo.trim() || null) : null
                patch.is_offline = editShipMode === 'offline' ? true : (editShipMode === 'online' ? false : g.items[0]?.is_offline ?? null)
              }
              patch.remark = editRemark.trim() || null
              const { error } = await supabase.from('stock_moves').update(patch).in('id', ids)
              if (error) throw error
              toast.success('✅ 已保存')
              setEditingGroup(null)
              await queryClient.invalidateQueries({ queryKey: ['m-stock-moves-v2'] })
              await queryClient.invalidateQueries({ queryKey: ['stock-moves-v2'] })
              await queryClient.invalidateQueries({ queryKey: ['sales-velocity-30d'] })
            } catch (e: any) {
              console.error('[移动编辑订单失败]', e)
              toast.error(e?.message || '保存失败')
            } finally {
              setSavingEdit(false)
            }
          }}>
            <Check className="h-3.5 w-3.5 mr-1" /> {savingEdit ? '保存中...' : '保存'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    </>
  )
}
