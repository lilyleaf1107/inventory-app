import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  ArrowLeft,
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
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/auth'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { formatDate } from '@/lib/utils'

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
  is_offline: boolean | null
  tracking_no: string | null
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

export default function MobileStats() {
  const navigate = useNavigate()
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

  const rangeDays = useMemo(() => Math.max(1, Math.round((new Date(untilISO).getTime() - new Date(sinceISO).getTime()) / 86400000)), [sinceISO, untilISO])
  const bucket = useMemo(() => getBucketSize(range, rangeDays), [range, rangeDays])

  const { data, isLoading, error } = useQuery({
    queryKey: ['stats-data', sinceISO, untilISO],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('stock_moves')
        .select(`
          id, move_type, quantity, created_at, is_offline, tracking_no,
          product:products ( id, name, sku, unit )
        `)
        .gte('created_at', sinceISO)
        .lte('created_at', untilISO)
        .order('created_at', { ascending: true })
      if (error) throw error
      return { rows: (data || []) as unknown as StatsMoveRow[] }
    },
    staleTime: 1000 * 60 * 5,
  })

  const analysis = useMemo(() => {
    const rows = data?.rows || []
    const outs = rows.filter((r) => r.move_type === 'out')
    const ins = rows.filter((r) => r.move_type === 'in')

    const totalOutQty = outs.reduce((s, r) => s + Number(r.quantity), 0)
    const totalInQty = ins.reduce((s, r) => s + Number(r.quantity), 0)
    const totalOutOrders = outs.length
    const uniqueProducts = new Set(outs.map((r) => r.product.id)).size
    const dailyAvgQty = totalOutQty / Math.max(1, rangeDays)

    const productMap = new Map<string, { id: string; name: string; sku: string | null; unit: string; qty: number; count: number; onlineQty: number; offlineQty: number }>()
    for (const r of outs) {
      const pid = r.product.id
      let item = productMap.get(pid)
      if (!item) {
        item = { id: pid, name: r.product.name, sku: r.product.sku, unit: r.product.unit, qty: 0, count: 0, onlineQty: 0, offlineQty: 0 }
        productMap.set(pid, item)
      }
      item.qty += Number(r.quantity)
      item.count += 1
      if (r.is_offline) item.offlineQty += Number(r.quantity)
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
      ranking,
      trend,
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

  if (!isAdmin()) {
    return (
      <div className="flex flex-col h-full">
        <div className="flex items-center gap-2 px-4 py-3 border-b bg-background">
          <button onClick={() => navigate(-1)} className="p-1.5 -ml-1.5 rounded-lg hover:bg-muted">
            <ArrowLeft className="h-5 w-5" />
          </button>
          <h1 className="font-bold text-base">数据统计</h1>
        </div>
        <div className="flex-1 flex items-center justify-center p-6">
          <Card className="w-full">
            <CardContent className="p-6 flex flex-col items-center gap-3 text-center">
              <div className="h-14 w-14 rounded-full bg-amber-50 flex items-center justify-center">
                <Lock className="h-7 w-7 text-amber-600" />
              </div>
              <h2 className="text-base font-bold">无权访问</h2>
              <p className="text-sm text-muted-foreground">
                数据统计仅对「管理员」及以上角色开放
                {profile?.role && `（当前角色：${profile.role}）`}
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    )
  }

  const { summary, trend, shipMode } = analysis

  const trendMaxQty = Math.max(1, ...trend.map((t) => Math.max(t.outQty, t.inQty)))
  const chartW = Math.max(280, trend.length * 28)
  const chartH = 200
  const padL = 30, padR = 6, padT = 12, padB = 24
  const plotW = chartW - padL - padR
  const plotH = chartH - padT - padB
  const barGap = 2
  const groupW = trend.length > 0 ? plotW / trend.length : plotW
  const singleBarW = Math.max(2, (groupW - barGap) / 2 - 1)

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 px-4 py-3 border-b bg-background flex-shrink-0">
        <button onClick={() => navigate(-1)} className="p-1.5 -ml-1.5 rounded-lg hover:bg-muted">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <h1 className="font-bold text-base flex items-center gap-1.5 text-indigo-600">
          <BarChart3 className="h-5 w-5" />
          数据统计
        </h1>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="p-3 space-y-3">
          {/* 周期 */}
          <div className="text-[11px] text-muted-foreground">
            {formatDate(sinceISO)} ~ {formatDate(untilISO)} · 共 {rangeDays} 天
          </div>

          {/* 时间筛选 */}
          <div className="flex gap-1 flex-wrap">
            {RANGE_PRESETS.map((p) => (
              <button
                key={p.key}
                onClick={() => setRange(p.key)}
                className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                  range === p.key
                    ? 'bg-indigo-600 text-white'
                    : 'bg-muted text-muted-foreground hover:text-foreground'
                }`}
              >
                {p.label}
              </button>
            ))}
            <button
              onClick={() => setRange('custom')}
              className={`px-2.5 py-1 rounded-full text-xs font-medium inline-flex items-center gap-0.5 ${
                range === 'custom'
                  ? 'bg-indigo-600 text-white'
                  : 'bg-muted text-muted-foreground hover:text-foreground'
              }`}
            >
              <Calendar className="h-3 w-3" /> 自定义 <ChevronDown className="h-2.5 w-2.5" />
            </button>
          </div>
          {range === 'custom' && (
            <div className="flex items-center gap-2">
              <Input
                type="date"
                value={customStart}
                onChange={(e) => setCustomStart(e.target.value)}
                className="h-8 text-xs"
              />
              <span className="text-muted-foreground">~</span>
              <Input
                type="date"
                value={customEnd}
                onChange={(e) => setCustomEnd(e.target.value)}
                className="h-8 text-xs"
              />
            </div>
          )}

          {/* 汇总卡片（2x2网格） */}
          <div className="grid grid-cols-2 gap-2">
            <Card><CardContent className="p-2.5">
              <div className="text-[10px] text-muted-foreground flex items-center gap-1"><ArrowUpFromLine className="h-3 w-3 text-orange-500" />出库单量</div>
              <div className="text-lg font-bold mt-0.5">{summary.totalOutOrders}</div>
              <div className="text-[10px] text-muted-foreground mt-0.5 truncate">
                快递 {shipMode.onlineCount} · 线下 {shipMode.offlineCount}
              </div>
            </CardContent></Card>
            <Card><CardContent className="p-2.5">
              <div className="text-[10px] text-muted-foreground flex items-center gap-1"><Package className="h-3 w-3 text-orange-600" />出库件数</div>
              <div className="text-lg font-bold mt-0.5 text-orange-600">{summary.totalOutQty}</div>
              <div className="text-[10px] mt-0.5 truncate">
                <span className="text-blue-600"><Truck className="h-2.5 w-2.5 inline align-[-2px]" />{shipMode.onlineQty}</span>
                <span className="text-muted-foreground mx-1">/</span>
                <span className="text-purple-600"><Store className="h-2.5 w-2.5 inline align-[-2px]" />{shipMode.offlineQty}</span>
              </div>
            </CardContent></Card>
            <Card><CardContent className="p-2.5">
              <div className="text-[10px] text-muted-foreground flex items-center gap-1"><ShoppingCart className="h-3 w-3 text-blue-500" />出库产品</div>
              <div className="text-lg font-bold mt-0.5 text-blue-600">{summary.uniqueProducts}</div>
              <div className="text-[10px] text-muted-foreground mt-0.5">入库 {summary.totalInQty}</div>
            </CardContent></Card>
            <Card><CardContent className="p-2.5">
              <div className="text-[10px] text-muted-foreground flex items-center gap-1"><TrendingUp className="h-3 w-3 text-green-500" />日均件数</div>
              <div className="text-lg font-bold mt-0.5 text-green-600">{summary.dailyAvgQty.toFixed(1)}</div>
              <div className="text-[10px] text-muted-foreground mt-0.5">按 {rangeDays} 天</div>
            </CardContent></Card>
          </div>

          {/* 趋势图 */}
          <Card>
            <CardContent className="p-3">
              <div className="text-sm font-medium mb-2 flex items-center gap-1">
                <BarChart3 className="h-4 w-4" />
                出入库趋势（{bucket === 'day' ? '日' : bucket === 'week' ? '周' : '月'}）
              </div>
              {isLoading ? (
                <div className="text-center py-8 text-muted-foreground text-xs">加载中...</div>
              ) : error ? (
                <div className="text-center py-8 text-destructive text-xs">加载失败</div>
              ) : trend.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground text-xs">暂无数据</div>
              ) : (
                <div className="overflow-x-auto">
                  <svg width={chartW} height={chartH} className="min-w-full">
                    {[0, 0.5, 1].map((ratio, i) => {
                      const y = padT + plotH * (1 - ratio)
                      return (
                        <g key={i}>
                          <line x1={padL} x2={padL + plotW} y1={y} y2={y} stroke="#e5e7eb" strokeDasharray={i === 0 ? undefined : '3,3'} />
                          <text x={padL - 4} y={y + 3} textAnchor="end" fontSize="9" fill="#6b7280">{Math.round(trendMaxQty * ratio)}</text>
                        </g>
                      )
                    })}
                    {trend.map((t, i) => {
                      const x0 = padL + i * groupW
                      const outH = (t.outQty / trendMaxQty) * plotH
                      const inH = (t.inQty / trendMaxQty) * plotH
                      const outX = x0 + 1
                      const inX = x0 + 1 + singleBarW + barGap
                      return (
                        <g key={t.key}>
                          <rect x={outX} y={padT + plotH - outH} width={singleBarW} height={outH} rx="1.5" fill="#f97316" opacity="0.9" />
                          <rect x={inX} y={padT + plotH - inH} width={singleBarW} height={inH} rx="1.5" fill="#10b981" opacity="0.75" />
                          <text x={x0 + groupW / 2} y={chartH - padB + 14} textAnchor="middle" fontSize="9" fill="#6b7280">{t.label}</text>
                        </g>
                      )
                    })}
                  </svg>
                  <div className="flex items-center justify-end gap-3 mt-1 text-[10px] text-muted-foreground">
                    <span className="flex items-center gap-1"><span className="inline-block w-2.5 h-2.5 rounded-sm bg-orange-500" />出库</span>
                    <span className="flex items-center gap-1"><span className="inline-block w-2.5 h-2.5 rounded-sm bg-green-500 opacity-75" />入库</span>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* 排行榜搜索 */}
          <div>
            <div className="text-sm font-medium mb-2 flex items-center gap-1">
              <TrendingUp className="h-4 w-4" /> 产品出库排行
            </div>
            <div className="relative mb-2">
              <Search className="absolute left-2.5 top-2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="搜索产品 / SKU..."
                value={rankSearch}
                onChange={(e) => setRankSearch(e.target.value)}
                className="pl-8 h-9 text-sm"
              />
            </div>
          </div>

          {/* 排行榜列表 */}
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground text-sm">加载中...</div>
          ) : filteredRanking.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground text-sm">
              {rankSearch ? '无匹配产品' : '暂无出库数据'}
            </div>
          ) : (
            <div className="space-y-2">
              {(() => {
                const totalQty = filteredRanking.reduce((s, r) => s + r.qty, 0) || 1
                const maxQty = filteredRanking[0]?.qty || 1
                return filteredRanking.slice(0, 50).map((r, i) => {
                  const pct = (r.qty / totalQty) * 100
                  const barW = (r.qty / maxQty) * 100
                  return (
                    <Card key={r.id}>
                      <CardContent className="p-3">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-start gap-2 flex-1 min-w-0">
                            <div className={`h-6 w-6 rounded-full flex items-center justify-center flex-shrink-0 font-bold text-xs ${
                              i === 0 ? 'bg-yellow-100 text-yellow-700' :
                              i === 1 ? 'bg-slate-200 text-slate-700' :
                              i === 2 ? 'bg-amber-100 text-amber-700' :
                              'bg-muted text-muted-foreground'
                            }`}>
                              {i + 1}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="text-sm font-medium truncate">{r.name}</div>
                              <div className="text-[10px] text-muted-foreground font-mono truncate">
                                {r.sku || '—'} · {r.count}次
                              </div>
                              <div className="mt-1.5 flex items-center gap-2">
                                <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                                  <div className="h-full bg-gradient-to-r from-orange-400 to-orange-600 rounded-full" style={{ width: `${barW}%` }} />
                                </div>
                                <span className="text-[10px] text-muted-foreground flex-shrink-0 w-10 text-right">{pct.toFixed(1)}%</span>
                              </div>
                              <div className="mt-1 text-[10px] flex items-center gap-1.5 flex-wrap">
                                <span className="text-blue-600 inline-flex items-center gap-0.5"><Truck className="h-2.5 w-2.5" />线上{r.onlineQty}</span>
                                <span className="text-muted-foreground">·</span>
                                <span className="text-purple-600 inline-flex items-center gap-0.5"><Store className="h-2.5 w-2.5" />线下{r.offlineQty}</span>
                              </div>
                            </div>
                          </div>
                          <div className="text-right flex-shrink-0">
                            <div className="text-sm font-bold text-orange-600">{r.qty.toLocaleString()}</div>
                            <div className="text-[10px] text-muted-foreground">{r.unit}</div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  )
                })
              })()}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
