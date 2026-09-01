import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  BarChart3,
  Calendar,
  Package,
  ArrowUpFromLine,
  ShoppingCart,
  TrendingUp,
  Search,
  ChevronDown,
  Lock,
  Truck,
  Store,
  Download,
  Sparkles,
  ArrowUpRight,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/auth'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { formatDate, cn } from '@/lib/utils'

type TimeRangeKey = 'week' | 'month' | '3month' | '6month' | '1year' | '2year' | '3year' | 'custom'

const RANGE_PRESETS: { key: TimeRangeKey; label: string; days: number }[] = [
  { key: 'week', label: '周', days: 7 },
  { key: 'month', label: '月', days: 30 },
  { key: '3month', label: '3月', days: 90 },
  { key: '6month', label: '半年', days: 180 },
  { key: '1year', label: '1年', days: 365 },
  { key: '2year', label: '2年', days: 730 },
  { key: '3year', label: '3年', days: 1095 },
]

function getBucketSize(range: TimeRangeKey, days: number): 'day' | 'week' | 'month' {
  if (range === 'week' || range === 'month' || days <= 45) return 'day'
  if (range === '3month' || range === '6month' || days <= 200) return 'week'
  return 'month'
}

interface StatsMoveRow {
  id: string
  move_type: 'in' | 'out'
  quantity: number
  created_at: string
  is_offline: boolean | null | undefined
  tracking_no: string | null | undefined
  product: { id: string; name: string; sku: string | null; unit: string }
}

function bucketKey(iso: string, bucket: 'day' | 'week' | 'month'): string {
  const d = new Date(iso)
  if (bucket === 'day') return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  if (bucket === 'month') return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  const start = new Date(d.getFullYear(), 0, 1)
  const dayOfYear = Math.floor((d.getTime() - start.getTime()) / 86400000)
  const weekNum = Math.ceil((dayOfYear + start.getDay() + 1) / 7)
  return `${d.getFullYear()}-W${String(weekNum).padStart(2, '0')}`
}

function bucketLabel(key: string, bucket: 'day' | 'week' | 'month'): string {
  if (bucket === 'day') return key.slice(5)
  if (bucket === 'month') return key.slice(2)
  return key.slice(2)
}

export default function StatsPage() {
  const { isAdmin, profile } = useAuthStore()
  const [range, setRange] = useState<TimeRangeKey>('month')
  const [customStart, setCustomStart] = useState('')
  const [customEnd, setCustomEnd] = useState('')
  const [rankSearch, setRankSearch] = useState('')

  const { sinceISO, untilISO } = useMemo(() => {
    const now = new Date()
    const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999)
    if (range === 'custom' && customStart && customEnd) {
      return {
        sinceISO: new Date(customStart + 'T00:00:00').toISOString(),
        untilISO: new Date(customEnd + 'T23:59:59').toISOString(),
      }
    }
    const preset = RANGE_PRESETS.find((p) => p.key === range) || RANGE_PRESETS[1]
    const start = new Date(end)
    start.setDate(start.getDate() - (preset.days - 1))
    start.setHours(0, 0, 0, 0)
    return { sinceISO: start.toISOString(), untilISO: end.toISOString() }
  }, [range, customStart, customEnd])

  const rangeDays = useMemo(
    () => Math.max(1, Math.round((new Date(untilISO).getTime() - new Date(sinceISO).getTime()) / 86400000)),
    [sinceISO, untilISO],
  )
  const bucket = useMemo(() => getBucketSize(range, rangeDays), [range, rangeDays])

  // 问题2兜底：SELECT 时不加 tracking_no/is_offline 列，避免数据库列不存在时报错；
  // 改成分开查一次 stock_moves 表结构 → 更简单做法：先全量查不含这两个列，再 try 一次补查询字段。
  // 这里我们选择"先只查安全列"，等用户执行 SQL 后，is_offline / tracking_no 会以空值形式出现在结果里吗？
  // — 不，只有 SELECT 了才会返回。所以我们另查一次这两个字段，失败时忽略。
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['stats-data', sinceISO, untilISO],
    queryFn: async () => {
      // 1) 基础查询：产品+数量+时间，稳定字段，必不报错
      const base = await supabase
        .from('stock_moves')
        .select(`id, move_type, quantity, created_at,
          product:products(id, name, sku, unit)`)
        .gte('created_at', sinceISO)
        .lte('created_at', untilISO)
        .order('created_at', { ascending: true })
      if (base.error) throw base.error
      const rows = (base.data || []) as unknown as StatsMoveRow[]
      const ids = rows.map((r) => r.id)

      // 2) 尝试查询 tracking_no + is_offline（列不存在会 error → 直接跳过）
      if (ids.length > 0) {
        try {
          const extra = await supabase
            .from('stock_moves')
            .select('id, tracking_no, is_offline')
            .in('id', ids)
          if (!extra.error && extra.data) {
            const map = new Map((extra.data as any[]).map((d) => [d.id, { tracking_no: d.tracking_no as any, is_offline: d.is_offline as any }]))
            for (const r of rows) {
              const e = map.get(r.id)
              if (e) { (r as any).tracking_no = e.tracking_no; (r as any).is_offline = e.is_offline }
            }
          }
        } catch { /* 数据库列不存在时静默忽略 */ }
      }
      return rows
    },
    staleTime: 1000 * 60 * 5,
    refetchOnWindowFocus: false,
  })

  const analysis = useMemo(() => {
    const rows = data || []
    const outs = rows.filter((r) => r.move_type === 'out')
    const ins = rows.filter((r) => r.move_type === 'in')

    const totalOutQty = outs.reduce((s, r) => s + Number(r.quantity), 0)
    const totalInQty = ins.reduce((s, r) => s + Number(r.quantity), 0)
    const totalOutOrders = outs.length
    const uniqueProducts = new Set(outs.map((r) => r.product.id)).size
    const dailyAvgQty = totalOutQty / Math.max(1, rangeDays)

    const productMap = new Map<string, {
      id: string; name: string; sku: string | null; unit: string;
      qty: number; count: number; onlineQty: number; offlineQty: number;
    }>()
    for (const r of outs) {
      const pid = r.product.id
      let item = productMap.get(pid)
      if (!item) {
        item = {
          id: pid, name: r.product.name, sku: r.product.sku, unit: r.product.unit,
          qty: 0, count: 0, onlineQty: 0, offlineQty: 0,
        }
        productMap.set(pid, item)
      }
      item.qty += Number(r.quantity)
      item.count += 1
      // 问题2兜底：tracking_no / is_offline 可能 undefined
      if (typeof r.is_offline === 'boolean' && r.is_offline) item.offlineQty += Number(r.quantity)
      else if (r.tracking_no) item.onlineQty += Number(r.quantity)
    }
    const ranking = Array.from(productMap.values()).sort((a, b) => b.qty - a.qty)

    const trendMap = new Map<string, { outQty: number; outCount: number; inQty: number }>()
    for (const r of rows) {
      const k = bucketKey(r.created_at, bucket)
      let t = trendMap.get(k)
      if (!t) { t = { outQty: 0, outCount: 0, inQty: 0 }; trendMap.set(k, t) }
      if (r.move_type === 'out') { t.outQty += Number(r.quantity); t.outCount += 1 }
      else { t.inQty += Number(r.quantity) }
    }
    const labels: string[] = []
    if (bucket === 'day') {
      const s = new Date(sinceISO)
      const e = new Date(untilISO)
      const cur = new Date(s.getFullYear(), s.getMonth(), s.getDate())
      while (cur <= e) { labels.push(bucketKey(cur.toISOString(), 'day')); cur.setDate(cur.getDate() + 1) }
    } else {
      labels.push(...Array.from(trendMap.keys()).sort())
    }
    const trend = labels.map((k) => {
      const t = trendMap.get(k) || { outQty: 0, outCount: 0, inQty: 0 }
      return { key: k, label: bucketLabel(k, bucket), ...t }
    })

    return {
      summary: { totalOutQty, totalInQty, totalOutOrders, uniqueProducts, dailyAvgQty },
      ranking, trend,
      shipMode: {
        onlineQty: outs.reduce((s, r) => s + (r.tracking_no && !r.is_offline ? Number(r.quantity) : 0), 0),
        offlineQty: outs.reduce((s, r) => s + (r.is_offline ? Number(r.quantity) : 0), 0),
        onlineCount: outs.filter((r) => r.tracking_no && !r.is_offline).length,
        offlineCount: outs.filter((r) => r.is_offline).length,
      },
    }
  }, [data, bucket, sinceISO, untilISO, rangeDays])

  const filteredRanking = useMemo(() => {
    if (!rankSearch.trim()) return analysis.ranking
    const s = rankSearch.toLowerCase()
    return analysis.ranking.filter(
      (r) => r.name.toLowerCase().includes(s) || (r.sku || '').toLowerCase().includes(s),
    )
  }, [analysis.ranking, rankSearch])

  // 权限
  if (!isAdmin()) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Card className="w-full max-w-md border-2 border-amber-200 shadow-lg">
          <CardContent className="p-10 flex flex-col items-center gap-3 text-center">
            <div className="h-20 w-20 rounded-2xl bg-gradient-to-br from-amber-100 to-amber-200 flex items-center justify-center shadow-inner">
              <Lock className="h-10 w-10 text-amber-600" />
            </div>
            <h2 className="text-xl font-bold">🔒 无权访问</h2>
            <p className="text-sm text-muted-foreground leading-relaxed">
              数据统计页面仅对「管理员」及以上角色开放
              {profile?.role && <><br /><span className="mt-1 inline-block">当前角色：<span className="font-semibold">{profile.role}</span></span></>}
            </p>
          </CardContent>
        </Card>
      </div>
    )
  }

  const { summary, trend, shipMode } = analysis

  // SVG 尺寸
  const trendMaxQty = Math.max(1, ...trend.map((t) => Math.max(t.outQty, t.inQty)))
  const chartW = Math.max(400, trend.length * 48)
  const chartH = 260
  const padL = 44, padR = 18, padT = 22, padB = 36
  const plotW = chartW - padL - padR
  const plotH = chartH - padT - padB
  const groupW = trend.length > 0 ? plotW / trend.length : plotW
  const singleBarW = Math.max(4, (groupW - 4) / 2 - 1)

  return (
    <div className="space-y-5 max-w-[1400px] mx-auto">
      {/* ============== 页头 ============== */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-medium text-indigo-600 mb-1.5">
            <Sparkles className="h-3.5 w-3.5" />
            管理员专属 · 销售数据分析
          </div>
          <h2 className="text-3xl font-extrabold tracking-tight bg-gradient-to-r from-indigo-600 via-violet-600 to-fuchsia-600 bg-clip-text text-transparent flex items-center gap-3">
            <BarChart3 className="h-8 w-8 text-indigo-600" />
            数据统计中心
          </h2>
          <p className="text-sm text-muted-foreground mt-1.5 flex items-center gap-2">
            <Calendar className="h-3.5 w-3.5" />
            统计周期：<span className="font-semibold text-foreground">{formatDate(sinceISO)} ~ {formatDate(untilISO)}</span>
            <span className="text-muted-foreground/70">· 共 {rangeDays} 天</span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            <TrendingUp className="h-3.5 w-3.5 mr-1.5" /> 刷新数据
          </Button>
          <Button variant="outline" size="sm" onClick={() => window.print()}>
            <Download className="h-3.5 w-3.5 mr-1.5" /> 导出 / 打印
          </Button>
        </div>
      </div>

      {/* ============== 时间筛选（胶囊渐变） ============== */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="inline-flex items-center p-1.5 bg-gradient-to-br from-muted to-muted/60 rounded-2xl border shadow-sm">
          <Calendar className="h-4 w-4 text-indigo-500 ml-2 mr-1" />
          {RANGE_PRESETS.map((p) => (
            <button
              key={p.key}
              onClick={() => setRange(p.key)}
              className={cn(
                'px-4 py-1.5 text-sm rounded-xl transition-all duration-200',
                range === p.key
                  ? 'bg-gradient-to-r from-indigo-500 via-violet-500 to-fuchsia-500 text-white shadow-md shadow-indigo-500/20 font-semibold scale-[1.02]'
                  : 'text-muted-foreground hover:text-foreground hover:bg-background/70',
              )}
            >
              {p.label}
            </button>
          ))}
          <button
            onClick={() => setRange('custom')}
            className={cn(
              'px-4 py-1.5 text-sm rounded-xl transition-all inline-flex items-center gap-1 mr-1',
              range === 'custom'
                ? 'bg-gradient-to-r from-indigo-500 via-violet-500 to-fuchsia-500 text-white shadow-md shadow-indigo-500/20 font-semibold scale-[1.02]'
                : 'text-muted-foreground hover:text-foreground hover:bg-background/70',
            )}
          >
            自定义 <ChevronDown className="h-3 w-3" />
          </button>
        </div>
        {range === 'custom' && (
          <div className="flex items-center gap-2">
            <Input type="date" value={customStart} onChange={(e) => setCustomStart(e.target.value)} className="w-auto h-9" />
            <span className="text-muted-foreground text-sm">~</span>
            <Input type="date" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)} className="w-auto h-9" />
          </div>
        )}
      </div>

      {/* ============== 4 张汇总卡片（美化：渐变+左侧色条+对比小数据） ============== */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {/* 出库单量 */}
        <Card className="relative overflow-hidden border-0 shadow-md bg-gradient-to-br from-blue-50 to-background border-l-4 border-l-blue-500 hover:shadow-lg hover:-translate-y-0.5 transition-all">
          <div className="absolute top-0 right-0 h-20 w-20 opacity-10 translate-x-6 -translate-y-6">
            <ArrowUpFromLine className="h-full w-full text-blue-600" />
          </div>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
              出库单量
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-baseline gap-2">
              <div className="text-3xl font-black text-blue-700 tabular-nums">{summary.totalOutOrders.toLocaleString()}</div>
              <span className="text-xs text-muted-foreground">单</span>
            </div>
            <div className="flex items-center gap-1.5 text-[11px] mt-2 text-blue-600 bg-blue-100/60 rounded-md inline-flex px-2 py-0.5">
              <Truck className="h-3 w-3" /> 线上 {shipMode.onlineCount}
              <span className="mx-1 opacity-50">·</span>
              <Store className="h-3 w-3" /> 线下 {shipMode.offlineCount}
            </div>
          </CardContent>
        </Card>

        {/* 出库件数 */}
        <Card className="relative overflow-hidden border-0 shadow-md bg-gradient-to-br from-orange-50 to-background border-l-4 border-l-orange-500 hover:shadow-lg hover:-translate-y-0.5 transition-all">
          <div className="absolute top-0 right-0 h-20 w-20 opacity-10 translate-x-6 -translate-y-6">
            <Package className="h-full w-full text-orange-600" />
          </div>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">出库件数</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-baseline gap-2">
              <div className="text-3xl font-black text-orange-700 tabular-nums">{summary.totalOutQty.toLocaleString()}</div>
              <span className="text-xs text-muted-foreground">件</span>
            </div>
            <div className="flex items-center gap-3 text-[11px] mt-2">
              <span className="inline-flex items-center gap-1 text-blue-700 font-medium">
                <Truck className="h-3 w-3" /> 线上 <span className="tabular-nums font-bold">{shipMode.onlineQty.toLocaleString()}</span>
              </span>
              <span className="text-muted-foreground">|</span>
              <span className="inline-flex items-center gap-1 text-fuchsia-700 font-medium">
                <Store className="h-3 w-3" /> 线下 <span className="tabular-nums font-bold">{shipMode.offlineQty.toLocaleString()}</span>
              </span>
            </div>
          </CardContent>
        </Card>

        {/* 出库产品数 */}
        <Card className="relative overflow-hidden border-0 shadow-md bg-gradient-to-br from-violet-50 to-background border-l-4 border-l-violet-500 hover:shadow-lg hover:-translate-y-0.5 transition-all">
          <div className="absolute top-0 right-0 h-20 w-20 opacity-10 translate-x-6 -translate-y-6">
            <ShoppingCart className="h-full w-full text-violet-600" />
          </div>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">出库产品数</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-baseline gap-2">
              <div className="text-3xl font-black text-violet-700 tabular-nums">{summary.uniqueProducts.toLocaleString()}</div>
              <span className="text-xs text-muted-foreground">SKU</span>
            </div>
            <div className="flex items-center gap-1.5 text-[11px] mt-2 text-violet-600 bg-violet-100/60 rounded-md inline-flex px-2 py-0.5">
              <ArrowUpRight className="h-3 w-3" />
              入库件数共 {summary.totalInQty.toLocaleString()}
            </div>
          </CardContent>
        </Card>

        {/* 日均件数 */}
        <Card className="relative overflow-hidden border-0 shadow-md bg-gradient-to-br from-emerald-50 to-background border-l-4 border-l-emerald-500 hover:shadow-lg hover:-translate-y-0.5 transition-all">
          <div className="absolute top-0 right-0 h-20 w-20 opacity-10 translate-x-6 -translate-y-6">
            <TrendingUp className="h-full w-full text-emerald-600" />
          </div>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">日均出库件数</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-baseline gap-2">
              <div className="text-3xl font-black text-emerald-700 tabular-nums">{summary.dailyAvgQty.toFixed(1)}</div>
              <span className="text-xs text-muted-foreground">件/天</span>
            </div>
            <div className="flex items-center gap-1.5 text-[11px] mt-2 text-emerald-600 bg-emerald-100/60 rounded-md inline-flex px-2 py-0.5">
              <Calendar className="h-3 w-3" /> 统计 {rangeDays} 天
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ============== 趋势图 ============== */}
      <Card className="border-0 shadow-md overflow-hidden">
        <CardHeader className="pb-2 bg-gradient-to-r from-indigo-50/70 via-white to-fuchsia-50/70 border-b">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <CardTitle className="text-base font-bold flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow">
                <BarChart3 className="h-4 w-4" />
              </div>
              出入库趋势 <span className="text-xs font-normal text-muted-foreground">· 按 {bucket === 'day' ? '日' : bucket === 'week' ? '周' : '月'} 聚合</span>
            </CardTitle>
            <div className="flex items-center gap-3 text-xs">
              <span className="flex items-center gap-1.5 text-orange-700 font-semibold">
                <span className="inline-block w-3 h-3 rounded-sm bg-gradient-to-t from-orange-500 to-orange-400" /> 出库件数
              </span>
              <span className="flex items-center gap-1.5 text-emerald-700 font-semibold">
                <span className="inline-block w-3 h-3 rounded-sm bg-gradient-to-t from-emerald-500 to-emerald-400" /> 入库件数
              </span>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-5">
          {isLoading ? (
            <div className="text-center py-20 text-muted-foreground flex items-center justify-center gap-2">
              <div className="animate-spin rounded-full h-4 w-4 border-2 border-primary border-t-transparent" />
              数据加载中...
            </div>
          ) : error ? (
            <div className="text-center py-20 text-destructive flex items-center justify-center gap-2">
              加载失败：{(error as Error).message}
              <Button size="sm" variant="outline" onClick={() => refetch()}>重试</Button>
            </div>
          ) : trend.length === 0 ? (
            <div className="text-center py-20 text-muted-foreground">
              <BarChart3 className="h-12 w-12 mx-auto mb-3 opacity-20" />
              <div className="font-medium">当前时间段暂无数据</div>
              <div className="text-xs mt-1 opacity-80">换一个更长的时间范围试试</div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <svg width={chartW} height={chartH} className="min-w-full">
                <defs>
                  <linearGradient id="outBar" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#fb923c" stopOpacity="1" />
                    <stop offset="100%" stopColor="#f97316" stopOpacity="1" />
                  </linearGradient>
                  <linearGradient id="inBar" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#34d399" stopOpacity="0.9" />
                    <stop offset="100%" stopColor="#10b981" stopOpacity="0.9" />
                  </linearGradient>
                </defs>
                {/* Y 轴网格 + 数值 */}
                {[0, 0.25, 0.5, 0.75, 1].map((ratio, i) => {
                  const y = padT + plotH * (1 - ratio)
                  const val = Math.round(trendMaxQty * ratio)
                  return (
                    <g key={i}>
                      <line x1={padL} x2={padL + plotW} y1={y} y2={y}
                        stroke={i === 0 ? '#cbd5e1' : '#e5e7eb'}
                        strokeDasharray={i === 0 ? undefined : '3,3'} />
                      <text x={padL - 8} y={y + 4} textAnchor="end" fontSize="10" fill="#64748b" fontWeight="500">
                        {val.toLocaleString()}
                      </text>
                    </g>
                  )
                })}
                {/* 柱 */}
                {trend.map((t, i) => {
                  const x0 = padL + i * groupW
                  const outH = (t.outQty / trendMaxQty) * plotH
                  const inH = (t.inQty / trendMaxQty) * plotH
                  const outX = x0 + 2
                  const inX = x0 + 2 + singleBarW + 4
                  const yOut = padT + plotH - outH
                  const yIn = padT + plotH - inH
                  return (
                    <g key={t.key}>
                      <rect x={outX} y={yOut} width={singleBarW} height={outH} rx="3" fill="url(#outBar)">
                        <title>出库 {t.outQty.toLocaleString()} 件（{t.outCount} 单）</title>
                      </rect>
                      <rect x={inX} y={yIn} width={singleBarW} height={inH} rx="3" fill="url(#inBar)">
                        <title>入库 {t.inQty.toLocaleString()} 件</title>
                      </rect>
                      {/* 柱顶数值（只在柱子够高时显示） */}
                      {outH > 16 && (
                        <text x={outX + singleBarW / 2} y={yOut - 4} textAnchor="middle" fontSize="10" fill="#ea580c" fontWeight="600">
                          {t.outQty >= 1000 ? `${(t.outQty / 1000).toFixed(1)}k` : t.outQty}
                        </text>
                      )}
                      {/* X 轴标签 */}
                      <text x={x0 + groupW / 2} y={chartH - padB + 18} textAnchor="middle" fontSize="10" fill="#64748b" fontWeight="500">
                        {t.label}
                      </text>
                    </g>
                  )
                })}
              </svg>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ============== 产品出库排行榜 ============== */}
      <Card className="border-0 shadow-md overflow-hidden">
        <CardHeader className="pb-2 bg-gradient-to-r from-orange-50/70 via-white to-rose-50/60 border-b">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <CardTitle className="text-base font-bold flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-gradient-to-br from-orange-500 to-rose-500 text-white shadow">
                <TrendingUp className="h-4 w-4" />
              </div>
              产品出库排行榜 <span className="text-xs font-normal text-muted-foreground">· 按出库件数降序</span>
            </CardTitle>
            <div className="relative max-w-xs w-full">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="搜索产品名 / SKU..."
                value={rankSearch}
                onChange={(e) => setRankSearch(e.target.value)}
                className="pl-9 h-9 rounded-xl border-muted focus:border-orange-400 focus:ring-orange-400/20"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="text-center py-20 text-muted-foreground flex items-center justify-center gap-2">
              <div className="animate-spin rounded-full h-4 w-4 border-2 border-primary border-t-transparent" /> 加载中...
            </div>
          ) : filteredRanking.length === 0 ? (
            <div className="text-center py-20 text-muted-foreground">
              <Package className="h-12 w-12 mx-auto mb-3 opacity-20" />
              <div className="font-medium">{rankSearch ? '没有匹配的产品' : '当前时间段暂无出库数据'}</div>
            </div>
          ) : (
            <div className="max-h-[560px] overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 z-10 bg-white/90 backdrop-blur-md border-b shadow-sm">
                  <tr>
                    <th className="px-5 py-3 text-left text-xs font-bold text-muted-foreground w-16">排名</th>
                    <th className="px-5 py-3 text-left text-xs font-bold text-muted-foreground">产品</th>
                    <th className="px-5 py-3 text-right text-xs font-bold text-muted-foreground w-32">出库件数</th>
                    <th className="px-5 py-3 text-right text-xs font-bold text-muted-foreground w-24">次数</th>
                    <th className="px-5 py-3 text-left text-xs font-bold text-muted-foreground w-64">线上/线下构成</th>
                    <th className="px-5 py-3 text-left text-xs font-bold text-muted-foreground w-56">销量占比</th>
                  </tr>
                </thead>
                <tbody>
                  {(() => {
                    const totalQty = filteredRanking.reduce((s, r) => s + r.qty, 0) || 1
                    const maxPct = (filteredRanking[0]?.qty / totalQty) * 100 || 1
                    return filteredRanking.map((r, i) => {
                      const pct = (r.qty / totalQty) * 100
                      const barW = (pct / maxPct) * 100
                      const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : null
                      const rankBg = i === 0 ? 'bg-gradient-to-r from-yellow-50 to-amber-50'
                        : i === 1 ? 'bg-gradient-to-r from-slate-50 to-slate-100'
                        : i === 2 ? 'bg-gradient-to-r from-orange-50 to-rose-50'
                        : ''
                      return (
                        <tr key={r.id} className={cn('border-t hover:bg-indigo-50/30 transition-colors', rankBg)}>
                          <td className="px-5 py-4">
                            {medal ? (
                              <div className="h-8 w-8 rounded-xl flex items-center justify-center text-lg">
                                {medal}
                              </div>
                            ) : (
                              <div className="h-7 w-7 rounded-lg bg-gradient-to-br from-slate-100 to-slate-200 flex items-center justify-center text-xs font-bold text-slate-600">
                                {i + 1}
                              </div>
                            )}
                          </td>
                          <td className="px-5 py-4">
                            <div className="flex items-center gap-3">
                              <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-indigo-100 to-violet-100 flex items-center justify-center flex-shrink-0 shadow-sm">
                                <Package className="h-5 w-5 text-indigo-600" />
                              </div>
                              <div className="min-w-0">
                                <div className="font-semibold text-foreground truncate">{r.name}</div>
                                <div className="text-xs text-muted-foreground font-mono mt-0.5">
                                  {r.sku ? `SKU: ${r.sku}` : '—'}
                                </div>
                              </div>
                            </div>
                          </td>
                          <td className="px-5 py-4 text-right">
                            <div className="text-xl font-black tabular-nums text-orange-700">
                              {r.qty.toLocaleString()}
                              <span className="text-xs text-muted-foreground font-normal ml-1">{r.unit}</span>
                            </div>
                          </td>
                          <td className="px-5 py-4 text-right text-slate-600 tabular-nums font-semibold">
                            {r.count.toLocaleString()}
                          </td>
                          <td className="px-5 py-4">
                            <div className="flex items-center gap-2">
                              <div className="flex-1 flex gap-1 h-2 rounded-full overflow-hidden bg-muted">
                                <div
                                  className="h-full bg-gradient-to-r from-blue-500 to-blue-600"
                                  style={{ width: `${r.qty ? (r.onlineQty / r.qty) * 100 : 0}%` }}
                                  title={`线上 ${r.onlineQty.toLocaleString()}`}
                                />
                                <div
                                  className="h-full bg-gradient-to-r from-fuchsia-500 to-purple-600"
                                  style={{ width: `${r.qty ? (r.offlineQty / r.qty) * 100 : 0}%` }}
                                  title={`线下 ${r.offlineQty.toLocaleString()}`}
                                />
                              </div>
                            </div>
                            <div className="flex items-center gap-2 text-[11px] mt-1.5">
                              <span className="inline-flex items-center gap-1 text-blue-700 font-medium">
                                <Truck className="h-3 w-3" /> {r.onlineQty.toLocaleString()}
                              </span>
                              <span className="text-muted-foreground">|</span>
                              <span className="inline-flex items-center gap-1 text-fuchsia-700 font-medium">
                                <Store className="h-3 w-3" /> {r.offlineQty.toLocaleString()}
                              </span>
                            </div>
                          </td>
                          <td className="px-5 py-4 pr-8">
                            <div className="flex items-center gap-3">
                              <div className="flex-1 h-3 bg-slate-100 rounded-full overflow-hidden">
                                <div
                                  className="h-full rounded-full bg-gradient-to-r from-orange-400 via-orange-500 to-rose-500 transition-all"
                                  style={{ width: `${barW}%` }}
                                />
                              </div>
                              <span className="text-xs font-bold text-slate-700 tabular-nums w-12 text-right">
                                {pct.toFixed(1)}%
                              </span>
                            </div>
                          </td>
                        </tr>
                      )
                    })
                  })()}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
