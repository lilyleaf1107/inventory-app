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
  FolderOpen,
  List,
  Users,
  Settings,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { Card, CardContent } from '@/components/ui/card'
import { useOutOfStockCount } from '@/hooks/useOutOfStock'
import { useLowStockCountLight } from '@/hooks/useLowStock'
import { useAuthStore } from '@/store/auth'

export default function MobileHome() {
  const { canWrite, canManageUsers } = useAuthStore()

  // 轻量 count 查询，不拉完整数据
  const { data: outOfStockCount } = useOutOfStockCount()
  const { data: lowStockCount } = useLowStockCountLight()

  // 首页统计：全部用 head count，不拉数据行
  const { data: stats } = useQuery({
    queryKey: ['mobile-stats-light'],
    queryFn: async () => {
      const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
      const [productRes, invRes, movesInRes, movesOutRes] = await Promise.all([
        supabase.from('products').select('*', { count: 'exact', head: true }),
        // 用 RPC 聚合求和，避免拉全量行；如果没有 RPC 则回退 head count
        supabase.rpc('get_inventory_total_qty'),
        supabase.rpc('get_week_move_sum', { p_move_type: 'in', p_since: weekAgo }),
        supabase.rpc('get_week_move_sum', { p_move_type: 'out', p_since: weekAgo }),
      ])

      return {
        productCount: productRes.count || 0,
        totalQty: typeof invRes.data === 'number' ? invRes.data : 0,
        weekIn: typeof movesInRes.data === 'number' ? movesInRes.data : 0,
        weekOut: typeof movesOutRes.data === 'number' ? movesOutRes.data : 0,
      }
    },
    // 如果 RPC 不存在，回退到轻量查询
    retry: 0,
  })

  // 回退方案：RPC 不存在时用简单 count
  const { data: fallbackStats } = useQuery({
    queryKey: ['mobile-stats-fallback'],
    queryFn: async () => {
      const [productRes, invRes] = await Promise.all([
        supabase.from('products').select('*', { count: 'exact', head: true }),
        supabase.from('inventory').select('quantity').gt('quantity', 0),
      ])
      return {
        productCount: productRes.count || 0,
        totalQty: invRes.data?.reduce((s, i: any) => s + Number(i.quantity), 0) || 0,
      }
    },
    enabled: !stats,
    staleTime: 1000 * 60 * 2,
  })

  const productCount = stats?.productCount ?? fallbackStats?.productCount ?? 0
  const totalQty = stats?.totalQty ?? fallbackStats?.totalQty ?? 0
  const weekIn = stats?.weekIn ?? 0
  const weekOut = stats?.weekOut ?? 0

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

  // 管理入口（对应桌面端侧边栏全部功能）
  const allManageEntries = [
    {
      to: '/m/products',
      label: '产品管理',
      desc: '维护产品信息',
      icon: Package,
      iconClass: 'text-sky-600',
      bgClass: 'bg-sky-50',
      requireWrite: false,
      requireAdmin: false,
    },
    {
      to: '/m/materials',
      label: '物料管理',
      desc: '维护物料清单与缺货标红',
      icon: Boxes,
      iconClass: 'text-teal-600',
      bgClass: 'bg-teal-50',
      requireWrite: false,
      requireAdmin: false,
    },
    {
      to: '/m/categories',
      label: '分类管理',
      desc: '维护产品分类',
      icon: FolderOpen,
      iconClass: 'text-purple-600',
      bgClass: 'bg-purple-50',
      requireWrite: false,
      requireAdmin: false,
    },
    {
      to: '/m/warehouses',
      label: '仓库管理',
      desc: '仓库与库位',
      icon: Warehouse,
      iconClass: 'text-indigo-600',
      bgClass: 'bg-indigo-50',
      requireWrite: false,
      requireAdmin: false,
    },
    {
      to: '/m/stock-in',
      label: '入库',
      desc: '扫码/手动入库操作',
      icon: ArrowDownToLine,
      iconClass: 'text-emerald-600',
      bgClass: 'bg-emerald-50',
      requireWrite: true,
      requireAdmin: false,
    },
    {
      to: '/m/stock-out',
      label: '出库',
      desc: '扫码/手动出库操作',
      icon: ArrowUpFromLine,
      iconClass: 'text-amber-600',
      bgClass: 'bg-amber-50',
      requireWrite: true,
      requireAdmin: false,
    },
    {
      to: '/m/inventory',
      label: '库存查询',
      desc: '搜索库存及分布',
      icon: Search,
      iconClass: 'text-sky-600',
      bgClass: 'bg-sky-50',
      requireWrite: false,
      requireAdmin: false,
    },
    {
      to: '/m/out-of-stock',
      label: '缺货提醒',
      desc: (outOfStockCount || 0) > 0 ? `${outOfStockCount} 个缺货` : '暂无缺货',
      icon: AlertTriangle,
      iconClass: (outOfStockCount || 0) > 0 ? 'text-red-600' : 'text-slate-500',
      bgClass: (outOfStockCount || 0) > 0 ? 'bg-red-50' : 'bg-slate-50',
      badge: (outOfStockCount || 0) > 0 ? outOfStockCount : undefined,
      requireWrite: false,
      requireAdmin: false,
    },
    {
      to: '/m/low-stock',
      label: '低库存预警',
      desc: (lowStockCount || 0) > 0 ? `${lowStockCount} 个预警` : '库存充足',
      icon: Gauge,
      iconClass: (lowStockCount || 0) > 0 ? 'text-orange-600' : 'text-slate-500',
      bgClass: (lowStockCount || 0) > 0 ? 'bg-orange-50' : 'bg-slate-50',
      badge: (lowStockCount || 0) > 0 ? lowStockCount : undefined,
      requireWrite: false,
      requireAdmin: false,
    },
    {
      to: '/m/moves',
      label: '进出库记录',
      desc: '最近出入库流水',
      icon: List,
      iconClass: 'text-slate-600',
      bgClass: 'bg-slate-50',
      requireWrite: true,
      requireAdmin: false,
    },
    {
      to: '/m/users',
      label: '用户管理',
      desc: '团队成员与权限',
      icon: Users,
      iconClass: 'text-rose-600',
      bgClass: 'bg-rose-50',
      requireWrite: false,
      requireAdmin: true,
    },
    {
      to: '/m/settings',
      label: '设置',
      desc: '外观、预警、数据维护',
      icon: Settings,
      iconClass: 'text-slate-600',
      bgClass: 'bg-slate-50',
      requireWrite: false,
      requireAdmin: true,
    },
  ]
  // 过滤权限
  const manageEntries = allManageEntries.filter((e) => {
    if (e.requireWrite && !canWrite()) return false
    if (e.requireAdmin && !canManageUsers()) return false
    return true
  })

  return (
    <div className="p-4 space-y-4">
      {/* 缺货提示 */}
      {(outOfStockCount || 0) > 0 && (
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
      {(lowStockCount || 0) > 0 && (
        <Link to="/m/low-stock">
          <Card className="border-orange-200 bg-orange-50/40">
            <CardContent className="p-3 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-orange-100 flex-shrink-0">
                <Gauge className="h-5 w-5 text-orange-600" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-orange-700">
                  {lowStockCount} 个商品低库存预警
                </div>
                <div className="text-xs text-orange-500/80">
                  点击查看低库存详情
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
            <div className="text-xl font-bold mt-1">{productCount}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <div className="flex items-center gap-2 text-muted-foreground text-xs">
              <Boxes className="h-3 w-3" />
              库存数量
            </div>
            <div className="text-xl font-bold mt-1">
              {totalQty.toLocaleString()}
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
                +{weekIn}
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
                -{weekOut}
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
