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
  ChevronRight,
  AlertTriangle,
  Warehouse,
  Gauge,
  Boxes,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { Card, CardContent } from '@/components/ui/card'
import { useOutOfStock } from '@/hooks/useOutOfStock'
import { useLowStockCount } from '@/hooks/useLowStock'
import { useAuthStore } from '@/store/auth'

export default function MobileHome() {
  const { canWrite } = useAuthStore()
  const { data: outOfStockItems } = useOutOfStock()
  const outOfStockCount = outOfStockItems?.length || 0
  const lowStockCount = useLowStockCount()

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

  // 功能区：日常高频操作（低明度清新淡雅配色）
  const allQuickActions = [
    {
      to: '/m/scan?type=in',
      label: '扫码入库',
      icon: ArrowDownToLine,
      iconClass: 'text-emerald-600',
      bgClass: 'bg-emerald-50',
      requireWrite: true,
    },
    {
      to: '/m/scan?type=out',
      label: '扫码出库',
      icon: ArrowUpFromLine,
      iconClass: 'text-amber-600',
      bgClass: 'bg-amber-50',
      requireWrite: true,
    },
    {
      to: '/m/inventory',
      label: '查库存',
      icon: Search,
      iconClass: 'text-sky-600',
      bgClass: 'bg-sky-50',
      requireWrite: false,
    },
    {
      to: '/m/scan',
      label: '扫一扫',
      icon: ScanLine,
      iconClass: 'text-violet-600',
      bgClass: 'bg-violet-50',
      requireWrite: true,
    },
  ]
  // 员工（无写入权限）只保留查库存
  const quickActions = allQuickActions.filter((a) => !a.requireWrite || canWrite())

  // 管理入口
  const manageEntries = [
    {
      to: '/m/products',
      label: '产品管理',
      desc: '维护产品信息',
      icon: Package,
      iconClass: 'text-sky-600',
      bgClass: 'bg-sky-50',
    },
    {
      to: '/m/warehouses',
      label: '仓库管理',
      desc: '仓库与库位',
      icon: Warehouse,
      iconClass: 'text-indigo-600',
      bgClass: 'bg-indigo-50',
    },
    {
      to: '/m/out-of-stock',
      label: '缺货提醒',
      desc: outOfStockCount > 0 ? `${outOfStockCount} 个缺货` : '暂无缺货',
      icon: AlertTriangle,
      iconClass: outOfStockCount > 0 ? 'text-red-600' : 'text-slate-500',
      bgClass: outOfStockCount > 0 ? 'bg-red-50' : 'bg-slate-50',
      badge: outOfStockCount > 0 ? outOfStockCount : undefined,
    },
    {
      to: '/m/low-stock',
      label: '低库存预警',
      desc: lowStockCount.total > 0 ? `${lowStockCount.total} 个预警` : '库存充足',
      icon: Gauge,
      iconClass: lowStockCount.total > 0 ? 'text-orange-600' : 'text-slate-500',
      bgClass: lowStockCount.total > 0 ? 'bg-orange-50' : 'bg-slate-50',
      badge: lowStockCount.total > 0 ? lowStockCount.total : undefined,
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

      {/* 低库存提示 */}
      {lowStockCount.total > 0 && (
        <Link to="/m/low-stock">
          <Card className="border-orange-200 bg-orange-50/40">
            <CardContent className="p-3 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-orange-100 flex-shrink-0">
                <Gauge className="h-5 w-5 text-orange-600" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-orange-700">
                  {lowStockCount.total} 个商品低库存预警
                </div>
                <div className="text-xs text-orange-500/80">
                  黄色 {lowStockCount.warning} · 橙色 {lowStockCount.danger} · 红色 {lowStockCount.critical}
                </div>
              </div>
              <ChevronRight className="h-4 w-4 text-orange-400 flex-shrink-0" />
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
              <Boxes className="h-3 w-3" />
              库存数量
            </div>
            <div className="text-xl font-bold mt-1">
              {stats?.totalQty.toLocaleString() || 0}
            </div>
          </CardContent>
        </Card>
        {canWrite() && (
          <Card>
            <CardContent className="p-3">
              <div className="flex items-center gap-2 text-muted-foreground text-xs">
                <TrendingUp className="h-3 w-3 text-emerald-500" />
                本周入库
              </div>
              <div className="text-xl font-bold mt-1 text-emerald-600">
                +{stats?.weekIn || 0}
              </div>
            </CardContent>
          </Card>
        )}
        {canWrite() && (
          <Card>
            <CardContent className="p-3">
              <div className="flex items-center gap-2 text-muted-foreground text-xs">
                <TrendingDown className="h-3 w-3 text-amber-500" />
                本周出库
              </div>
              <div className="text-xl font-bold mt-1 text-amber-600">
                -{stats?.weekOut || 0}
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* 功能区 */}
      <div>
        <h2 className="text-sm font-medium text-muted-foreground mb-3">功能区</h2>
        <div className="grid grid-cols-4 gap-3">
          {quickActions.map((action) => (
            <Link
              key={action.label}
              to={action.to}
              className="flex flex-col items-center gap-2"
            >
              <div className={`flex h-14 w-14 items-center justify-center rounded-2xl ${action.bgClass} ${action.iconClass} shadow-sm`}>
                <action.icon className="h-6 w-6" />
              </div>
              <span className="text-xs text-center">{action.label}</span>
            </Link>
          ))}
        </div>
      </div>

      {/* 管理入口 */}
      <div>
        <h2 className="text-sm font-medium text-muted-foreground mb-3">管理</h2>
        <div className="space-y-2">
          {manageEntries.map((entry) => (
            <Link key={entry.to} to={entry.to}>
              <Card className="border-border/60 hover:bg-muted/40 transition-colors">
                <CardContent className="p-3 flex items-center gap-3">
                  <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${entry.bgClass} ${entry.iconClass} flex-shrink-0`}>
                    <entry.icon className="h-5 w-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium">{entry.label}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">{entry.desc}</div>
                  </div>
                  {entry.badge !== undefined && (
                    <span className="inline-flex items-center justify-center h-5 min-w-[1.25rem] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex-shrink-0">
                      {entry.badge > 99 ? '99+' : entry.badge}
                    </span>
                  )}
                  <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </div>
    </div>
  )
}
