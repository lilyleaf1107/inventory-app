import { useQuery } from '@tanstack/react-query'
import {
  Package,
  Warehouse,
  ArrowDownToLine,
  ArrowUpFromLine,
  Search,
  ClipboardList,
  TrendingUp,
  TrendingDown,
  Activity,
  MapPin,
  Clock,
  AlertTriangle,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { formatDate } from '@/lib/utils'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useOutOfStock, formatOutOfStockDuration, getStockoutLevel } from '@/hooks/useOutOfStock'

interface RecentMove {
  id: string
  move_type: 'in' | 'out'
  quantity: number
  scan_mode: 'manual' | 'scan'
  batch_no: string | null
  remark: string | null
  created_at: string
  product: {
    id: string
    name: string
    sku: string
    unit: string
  }
  location: {
    id: string
    code: string
    warehouse: {
      id: string
      code: string
      name: string | null
    }
  }
  operator: {
    id: string
    name: string | null
  } | null
}

export default function DashboardPage() {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const todayIso = today.toISOString()

  const { data: outOfStockItems } = useOutOfStock()
  const outOfStockCount = outOfStockItems?.length || 0
  const topOutOfStock = (outOfStockItems || [])
    .sort((a, b) => {
      const ta = a.lastOutAt ? new Date(a.lastOutAt).getTime() : 0
      const tb = b.lastOutAt ? new Date(b.lastOutAt).getTime() : 0
      return ta - tb
    })
    .slice(0, 5)

  const { data: stats } = useQuery({
    queryKey: ['dashboard-stats'],
    queryFn: async () => {
      const [
        productsRes,
        { data: inventory },
        warehousesRes,
        { data: todayMoves },
        { data: recentMoves },
      ] = await Promise.all([
        supabase.from('products').select('id', { count: 'exact', head: true }),
        supabase
          .from('inventory')
          .select('quantity')
          .gt('quantity', 0),
        supabase.from('warehouses').select('id', { count: 'exact', head: true }),
        supabase
          .from('stock_moves')
          .select('move_type,quantity')
          .gte('created_at', todayIso),
        supabase
          .from('stock_moves')
          .select(`
            id,
            move_type,
            quantity,
            scan_mode,
            batch_no,
            remark,
            created_at,
            product:products ( id, name, sku, unit ),
            location:locations (
              id,
              code,
              warehouse:warehouses ( id, code, name )
            ),
            operator:profiles!stock_moves_operator_id_fkey ( id, name )
          `)
          .order('created_at', { ascending: false })
          .limit(10),
      ])

      const totalQty = inventory?.reduce((sum, i) => sum + Number(i.quantity), 0) || 0
      const todayIn = todayMoves
        ?.filter((m) => m.move_type === 'in')
        .reduce((sum, m) => sum + Number(m.quantity), 0) || 0
      const todayOut = todayMoves
        ?.filter((m) => m.move_type === 'out')
        .reduce((sum, m) => sum + Number(m.quantity), 0) || 0

      return {
        productCount: productsRes.count ?? 0,
        totalQuantity: totalQty,
        warehouseCount: warehousesRes.count ?? 0,
        todayIn,
        todayOut,
        recentMoves: (recentMoves as unknown as RecentMove[]) || [],
      }
    },
  })

  const shortcuts = [
    {
      to: '/stock-in',
      label: '入库',
      desc: '扫码或手动入库',
      icon: ArrowDownToLine,
      color: 'text-green-600',
      bg: 'bg-green-50',
    },
    {
      to: '/stock-out',
      label: '出库',
      desc: '扫码或手动出库',
      icon: ArrowUpFromLine,
      color: 'text-orange-600',
      bg: 'bg-orange-50',
    },
    {
      to: '/inventory',
      label: '库存查询',
      desc: '查看库存分布',
      icon: Search,
      color: 'text-blue-600',
      bg: 'bg-blue-50',
    },
    {
      to: '/products',
      label: '产品管理',
      desc: '管理产品和条码',
      icon: Package,
      color: 'text-purple-600',
      bg: 'bg-purple-50',
    },
  ]

  return (
    <div className="space-y-6">
      {/* 标题 */}
      <div>
        <h2 className="text-2xl font-bold tracking-tight">工作台</h2>
        <p className="text-sm text-muted-foreground">库存概览与快捷操作</p>
      </div>

      {/* 统计卡片 */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              产品总数
            </CardTitle>
            <Package className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.productCount ?? '-'}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              库存总数量
            </CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {(stats?.totalQuantity ?? 0).toLocaleString()}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              仓库数
            </CardTitle>
            <Warehouse className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.warehouseCount ?? '-'}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              今日动态
            </CardTitle>
            <ClipboardList className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-3">
              <span className="text-sm font-medium text-green-600">
                <TrendingUp className="inline h-3 w-3 mr-0.5" />
                +{stats?.todayIn ?? 0}
              </span>
              <span className="text-sm font-medium text-orange-600">
                <TrendingDown className="inline h-3 w-3 mr-0.5" />
                -{stats?.todayOut ?? 0}
              </span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 缺货提醒 */}
      {outOfStockCount > 0 && (
        <Card className="border-red-200">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base font-bold text-red-600 flex items-center gap-2">
              <AlertTriangle className="h-5 w-5" />
              缺货提醒
              <span className="inline-flex items-center justify-center h-5 min-w-[1.25rem] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold">
                {outOfStockCount}
              </span>
            </CardTitle>
            <Link to="/out-of-stock">
              <Button variant="ghost" size="sm" className="text-red-600 hover:text-red-700">
                查看全部
              </Button>
            </Link>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y">
              {topOutOfStock.map((item) => {
                const level = getStockoutLevel(item.lastOutAt)
                return (
                  <div
                    key={item.id}
                    className="flex items-center gap-3 px-4 py-2.5 hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-red-50 text-red-600">
                      <AlertTriangle className="h-4 w-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm truncate">{item.product.name}</div>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <MapPin className="h-3 w-3" />
                        {item.location.warehouse.name || item.location.warehouse.code} · {item.location.code}
                      </div>
                    </div>
                    <div className="flex-shrink-0 text-right">
                      <div
                        className={`text-xs font-bold ${
                          level === 'critical'
                            ? 'text-red-600'
                            : level === 'warning'
                              ? 'text-orange-600'
                              : 'text-yellow-600'
                        }`}
                      >
                        {formatOutOfStockDuration(item.lastOutAt)}
                      </div>
                      <div className="text-[10px] text-muted-foreground">
                        {item.lastOutAt ? new Date(item.lastOutAt).toLocaleDateString('zh-CN') : '未知'}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* 快捷入口 + 最近操作 */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* 快捷入口 */}
        <div className="lg:col-span-1 space-y-4">
          <h3 className="text-sm font-medium text-muted-foreground">快捷入口</h3>
          <div className="grid grid-cols-2 gap-3">
            {shortcuts.map((s) => (
              <Link
                key={s.to}
                to={s.to}
                className="group flex flex-col items-start gap-2 rounded-lg border bg-background p-4 hover:shadow-sm transition-shadow"
              >
                <div className={`rounded-md p-2 ${s.bg}`}>
                  <s.icon className={`h-5 w-5 ${s.color}`} />
                </div>
                <div>
                  <div className="font-medium text-sm">{s.label}</div>
                  <div className="text-xs text-muted-foreground">{s.desc}</div>
                </div>
              </Link>
            ))}
          </div>
        </div>

        {/* 最近操作 */}
        <div className="lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium text-muted-foreground">最近操作</h3>
            <Link to="/moves">
              <Button variant="ghost" size="sm">查看全部</Button>
            </Link>
          </div>

          <Card>
            <CardContent className="p-0">
              {stats?.recentMoves.length === 0 ? (
                <div className="py-8 text-center text-sm text-muted-foreground">
                  暂无操作记录
                </div>
              ) : (
                <div className="divide-y">
                  {stats?.recentMoves.map((m) => (
                    <div
                      key={m.id}
                      className="flex items-center gap-4 px-4 py-3 hover:bg-muted/50 transition-colors"
                    >
                      <div
                        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
                          m.move_type === 'in' ? 'bg-green-50 text-green-600' : 'bg-orange-50 text-orange-600'
                        }`}
                      >
                        {m.move_type === 'in' ? (
                          <ArrowDownToLine className="h-4 w-4" />
                        ) : (
                          <ArrowUpFromLine className="h-4 w-4" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-sm truncate">
                            {m.product.name}
                          </span>
                          <span
                            className={`text-xs font-bold ${
                              m.move_type === 'in' ? 'text-green-600' : 'text-orange-600'
                            }`}
                          >
                            {m.move_type === 'in' ? '+' : '-'}
                            {m.quantity}
                            {m.product.unit}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <MapPin className="h-3 w-3" />
                          {m.location.warehouse.name || m.location.warehouse.code} · {m.location.code}
                          <span className="mx-1">·</span>
                          <Clock className="h-3 w-3" />
                          {formatDate(m.created_at)}
                          {m.operator?.name && (
                            <>
                              <span className="mx-1">·</span>
                              {m.operator.name}
                            </>
                          )}
                        </div>
                      </div>
                      {m.scan_mode === 'scan' && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                          扫码
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
