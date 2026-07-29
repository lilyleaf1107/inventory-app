import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  ScanLine,
  Search,
  Package,
  TrendingUp,
  TrendingDown,
  Clock,
  MapPin,
  ChevronRight,
  AlertTriangle,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { formatDate } from '@/lib/utils'
import { Card, CardContent } from '@/components/ui/card'
import { useOutOfStock } from '@/hooks/useOutOfStock'

interface RecentMove {
  id: string
  move_type: 'in' | 'out'
  quantity: number
  scan_mode: string
  created_at: string
  product: { id: string; name: string; unit: string }
  location: { id: string; code: string; warehouse: { id: string; code: string; name: string | null } }
}

export default function MobileHome() {
  const { data: outOfStockItems } = useOutOfStock()
  const outOfStockCount = outOfStockItems?.length || 0

  const { data: stats } = useQuery({
    queryKey: ['mobile-stats'],
    queryFn: async () => {
      const [products, inventory, movesIn, movesOut] = await Promise.all([
        supabase.from('products').select('id', { count: 'exact', head: true }),
        supabase.from('inventory').select('quantity').gt('quantity', 0),
        supabase
          .from('stock_moves')
          .select('quantity')
          .eq('move_type', 'in')
          .gte('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()),
        supabase
          .from('stock_moves')
          .select('quantity')
          .eq('move_type', 'out')
          .gte('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()),
      ])

      const totalQty = inventory.data?.reduce((s, i) => s + Number(i.quantity), 0) || 0
      const weekIn = movesIn.data?.reduce((s, m) => s + Number(m.quantity), 0) || 0
      const weekOut = movesOut.data?.reduce((s, m) => s + Number(m.quantity), 0) || 0

      return {
        productCount: products.count || 0,
        totalQty,
        weekIn,
        weekOut,
      }
    },
  })

  const { data: recentMoves } = useQuery({
    queryKey: ['mobile-recent-moves'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('stock_moves')
        .select(`
          id, move_type, quantity, scan_mode, created_at,
          product:products ( id, name, unit ),
          location:locations ( id, code, warehouse:warehouses ( id, code, name ) )
        `)
        .order('created_at', { ascending: false })
        .limit(5)
      if (error) throw error
      return data as unknown as RecentMove[]
    },
  })

  const quickActions = [
    {
      to: '/m/scan?type=in',
      label: '扫码入库',
      icon: ArrowDownToLine,
      color: 'bg-green-500',
    },
    {
      to: '/m/scan?type=out',
      label: '扫码出库',
      icon: ArrowUpFromLine,
      color: 'bg-orange-500',
    },
    {
      to: '/m/inventory',
      label: '查库存',
      icon: Search,
      color: 'bg-blue-500',
    },
    {
      to: '/m/scan',
      label: '扫一扫',
      icon: ScanLine,
      color: 'bg-purple-500',
    },
  ]

  return (
    <div className="p-4 space-y-4">
      {/* 缺货提示 */}
      {outOfStockCount > 0 && (
        <Link to="/m/out-of-stock">
          <Card className="border-red-200 bg-red-50/40">
            <CardContent className="p-3 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-red-100 flex-shrink-0">
                <AlertTriangle className="h-5 w-5 text-red-600" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-red-700">
                  {outOfStockCount} 个商品缺货
                </div>
                <div className="text-xs text-red-500/80">
                  点击查看缺货详情及断货时长
                </div>
              </div>
              <ChevronRight className="h-4 w-4 text-red-400 flex-shrink-0" />
            </CardContent>
          </Card>
        </Link>
      )}

      {/* 统计卡片 */}
      <div className="grid grid-cols-2 gap-3">
        <Card>
          <CardContent className="p-3">
            <div className="flex items-center gap-2 text-muted-foreground text-xs">
              <Package className="h-3 w-3" />
              产品总数
            </div>
            <div className="text-xl font-bold mt-1">{stats?.productCount || 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <div className="flex items-center gap-2 text-muted-foreground text-xs">
              <Search className="h-3 w-3" />
              库存数量
            </div>
            <div className="text-xl font-bold mt-1">
              {stats?.totalQty.toLocaleString() || 0}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <div className="flex items-center gap-2 text-muted-foreground text-xs">
              <TrendingUp className="h-3 w-3 text-green-500" />
              本周入库
            </div>
            <div className="text-xl font-bold mt-1 text-green-600">
              +{stats?.weekIn || 0}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <div className="flex items-center gap-2 text-muted-foreground text-xs">
              <TrendingDown className="h-3 w-3 text-orange-500" />
              本周出库
            </div>
            <div className="text-xl font-bold mt-1 text-orange-600">
              -{stats?.weekOut || 0}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 快捷操作 */}
      <div>
        <h2 className="text-sm font-medium text-muted-foreground mb-3">快捷操作</h2>
        <div className="grid grid-cols-4 gap-3">
          {quickActions.map((action) => (
            <Link
              key={action.label}
              to={action.to}
              className="flex flex-col items-center gap-2"
            >
              <div className={`flex h-14 w-14 items-center justify-center rounded-2xl ${action.color} text-white shadow-md`}>
                <action.icon className="h-6 w-6" />
              </div>
              <span className="text-xs text-center">{action.label}</span>
            </Link>
          ))}
        </div>
      </div>

      {/* 最近操作 */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-medium text-muted-foreground">最近操作</h2>
          <Link to="/m/moves" className="text-xs text-primary flex items-center">
            全部
            <ChevronRight className="h-3 w-3" />
          </Link>
        </div>
        <div className="space-y-2">
          {!recentMoves || recentMoves.length === 0 ? (
            <div className="text-center py-6 text-sm text-muted-foreground">
              暂无操作记录
            </div>
          ) : (
            recentMoves.map((m) => (
              <div
                key={m.id}
                className="flex items-center gap-3 p-3 bg-background rounded-lg border"
              >
                <div
                  className={`flex h-8 w-8 items-center justify-center rounded-full flex-shrink-0 ${
                    m.move_type === 'in'
                      ? 'bg-green-50 text-green-600'
                      : 'bg-orange-50 text-orange-600'
                  }`}
                >
                  {m.move_type === 'in' ? (
                    <ArrowDownToLine className="h-4 w-4" />
                  ) : (
                    <ArrowUpFromLine className="h-4 w-4" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm truncate">{m.product.name}</div>
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <MapPin className="h-3 w-3" />
                    {m.location.warehouse.name || m.location.warehouse.code} · {m.location.code}
                    <span className="mx-0.5">·</span>
                    <Clock className="h-3 w-3" />
                    {formatDate(m.created_at)}
                  </div>
                </div>
                <div className="text-right flex-shrink-0">
                  <div
                    className={`font-bold text-sm ${
                      m.move_type === 'in' ? 'text-green-600' : 'text-orange-600'
                    }`}
                  >
                    {m.move_type === 'in' ? '+' : '-'}
                    {m.quantity}
                  </div>
                  <div className="text-xs text-muted-foreground">{m.product.unit}</div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* 桌面端入口 */}
      <Card className="bg-primary/5 border-primary/20">
        <CardContent className="p-3 flex items-center justify-between">
          <div>
            <div className="text-sm font-medium">需要管理产品和仓库？</div>
            <div className="text-xs text-muted-foreground mt-0.5">
              切换到电脑端完整功能
            </div>
          </div>
          <Link
            to="/products"
            className="text-xs text-primary underline"
          >
            进入电脑端
          </Link>
        </CardContent>
      </Card>
    </div>
  )
}
