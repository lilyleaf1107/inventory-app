import { memo, useMemo } from 'react'
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
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { Card, CardContent } from '@/components/ui/card'
import { useOutOfStockCount } from '@/hooks/useOutOfStock'
import { useLowStockCountLight } from '@/hooks/useLowStock'
import { useAuthStore } from '@/store/auth'
import { shallow } from 'zustand/shallow'

interface QuickAction {
  to: string
  label: string
  icon: any
  iconClass: string
  bgClass: string
  requireWrite: boolean
}

interface ManageEntry {
  to: string
  label: string
  desc: string | number
  icon: any
  iconClass: string
  bgClass: string
  badge?: number
  requireWrite: boolean
  requireAdmin: boolean
}

const QuickActionsGrid = memo(function QuickActionsGrid({ actions }: { actions: QuickAction[] }) {
  return (
    <div className="grid grid-cols-4 gap-3">
      {actions.map((a) => (
        <Link key={a.to} to={a.to}>
          <div className={`${a.bgClass} rounded-xl p-3 flex flex-col items-center gap-2 aspect-square justify-center`}>
            <a.icon className={`h-6 w-6 ${a.iconClass}`} />
            <span className="text-xs font-medium">{a.label}</span>
          </div>
        </Link>
      ))}
    </div>
  )
})

const ManageEntriesList = memo(function ManageEntriesList({ entries }: { entries: ManageEntry[] }) {
  return (
    <div className="grid grid-cols-1 gap-2">
      {entries.map((e) => (
        <Link key={e.to} to={e.to}>
          <Card>
            <CardContent className="p-3 flex items-center gap-3">
              <div className={`${e.bgClass} rounded-lg h-10 w-10 flex items-center justify-center flex-shrink-0`}>
                <e.icon className={`h-5 w-5 ${e.iconClass}`} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-sm">{e.label}</span>
                  {e.badge !== undefined && (
                    <span className="inline-flex items-center rounded-full bg-red-500 text-white text-[10px] px-1.5 py-0.5 font-semibold">
                      {e.badge}
                    </span>
                  )}
                </div>
                <div className="text-xs text-muted-foreground truncate">{e.desc}</div>
              </div>
              <ChevronRight className="h-4 w-4 text-muted-foreground/60 flex-shrink-0" />
            </CardContent>
          </Card>
        </Link>
      ))}
    </div>
  )
})

const StatsGrid = memo(function StatsGrid({
  canWrite,
  productCount,
  totalQty,
  weekIn,
  weekOut,
}: {
  canWrite: boolean
  productCount: number
  totalQty: number
  weekIn: number
  weekOut: number
}) {
  return (
    <div className="grid grid-cols-2 gap-2">
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
      {canWrite && (
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
      {canWrite && (
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
  )
})

const AlertBanner = memo(function AlertBanner({
  type,
  count,
}: {
  type: 'out' | 'low'
  count: number
}) {
  if (count <= 0) return null
  const isOut = type === 'out'
  const to = isOut ? '/m/out-of-stock' : '/m/low-stock'
  const border = isOut ? 'border-red-200' : 'border-orange-200'
  const bg = isOut ? 'bg-red-50/40' : 'bg-orange-50/40'
  const wrap = isOut ? 'bg-red-100' : 'bg-orange-100'
  const iconColor = isOut ? 'text-red-600' : 'text-orange-600'
  const title = isOut ? `${count} 个商品缺货` : `${count} 个商品低库存预警`
  const desc = isOut ? '点击查看缺货详情及断货时长' : '点击查看低库存详情'
  const chevronColor = isOut ? 'text-red-400' : 'text-orange-400'
  const Icon = isOut ? AlertTriangle : Gauge
  return (
    <Link to={to}>
      <Card className={`${border} ${bg}`}>
        <CardContent className="p-3 flex items-center gap-3">
          <div className={`flex h-10 w-10 items-center justify-center rounded-full ${wrap} flex-shrink-0`}>
            <Icon className={`h-5 w-5 ${iconColor}`} />
          </div>
          <div className="flex-1 min-w-0">
            <div className={`text-sm font-medium ${iconColor}`}>{title}</div>
            <div className={`text-xs ${isOut ? 'text-red-500/80' : 'text-orange-500/80'}`}>{desc}</div>
          </div>
          <ChevronRight className={`h-4 w-4 ${chevronColor} flex-shrink-0`} />
        </CardContent>
      </Card>
    </Link>
  )
})

function MobileHomeInner() {
  const { canWrite, canManageUsers } = useAuthStore(
    (s) => ({
      canWrite: s.canWrite,
      canManageUsers: s.canManageUsers,
    }),
    shallow,
  )

  const { data: outOfStockCount = 0 } = useOutOfStockCount()
  const { data: lowStockCount = 0 } = useLowStockCountLight()

  // 统一直接查表，避免 RPC 不存在/返回结构不一致时 totalQty 一直为 0
  const { data: stats } = useQuery({
    queryKey: ['mobile-stats-light'],
    queryFn: async () => {
      const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
      const [productRes, invRes, movesInRes, movesOutRes] = await Promise.all([
        supabase.from('products').select('*', { count: 'exact', head: true }),
        supabase.from('inventory').select('quantity'),
        supabase
          .from('stock_moves')
          .select('quantity')
          .eq('move_type', 'in')
          .gte('created_at', weekAgo),
        supabase
          .from('stock_moves')
          .select('quantity')
          .eq('move_type', 'out')
          .gte('created_at', weekAgo),
      ])
      return {
        productCount: productRes.count || 0,
        totalQty: (invRes.data || []).reduce((s, i: any) => s + Number(i.quantity || 0), 0),
        weekIn: (movesInRes.data || []).reduce((s, i: any) => s + Number(i.quantity || 0), 0),
        weekOut: (movesOutRes.data || []).reduce((s, i: any) => s + Number(i.quantity || 0), 0),
      }
    },
    retry: 0,
    staleTime: 1000 * 60 * 2,
  })

  const productCount = stats?.productCount ?? 0
  const totalQty = stats?.totalQty ?? 0
  const weekIn = stats?.weekIn ?? 0
  const weekOut = stats?.weekOut ?? 0

  const quickActions: QuickAction[] = useMemo(
    () =>
      [
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
      ].filter((a) => !a.requireWrite || canWrite()),
    [canWrite],
  )

  const manageEntries: ManageEntry[] = useMemo(() => {
    const list: ManageEntry[] = [
      { to: '/m/products', label: '产品管理', desc: '维护产品信息', icon: Package, iconClass: 'text-sky-600', bgClass: 'bg-sky-50', requireWrite: false, requireAdmin: false },
      { to: '/m/materials', label: '物料管理', desc: '维护物料清单与缺货标红', icon: Boxes, iconClass: 'text-teal-600', bgClass: 'bg-teal-50', requireWrite: false, requireAdmin: false },
      { to: '/m/categories', label: '分类管理', desc: '维护产品分类', icon: FolderOpen, iconClass: 'text-purple-600', bgClass: 'bg-purple-50', requireWrite: false, requireAdmin: false },
      { to: '/m/warehouses', label: '仓库管理', desc: '仓库与库位', icon: Warehouse, iconClass: 'text-indigo-600', bgClass: 'bg-indigo-50', requireWrite: false, requireAdmin: false },
      { to: '/m/stock-in', label: '入库', desc: '扫码/手动入库操作', icon: ArrowDownToLine, iconClass: 'text-emerald-600', bgClass: 'bg-emerald-50', requireWrite: true, requireAdmin: false },
      { to: '/m/stock-out', label: '出库', desc: '扫码/手动出库操作', icon: ArrowUpFromLine, iconClass: 'text-amber-600', bgClass: 'bg-amber-50', requireWrite: true, requireAdmin: false },
      { to: '/m/inventory', label: '库存查询', desc: '搜索库存及分布', icon: Search, iconClass: 'text-sky-600', bgClass: 'bg-sky-50', requireWrite: false, requireAdmin: false },
      {
        to: '/m/out-of-stock',
        label: '缺货提醒',
        desc: outOfStockCount > 0 ? `${outOfStockCount} 个缺货` : '暂无缺货',
        icon: AlertTriangle,
        iconClass: outOfStockCount > 0 ? 'text-red-600' : 'text-slate-500',
        bgClass: outOfStockCount > 0 ? 'bg-red-50' : 'bg-slate-50',
        badge: outOfStockCount > 0 ? outOfStockCount : undefined,
        requireWrite: false,
        requireAdmin: false,
      },
      {
        to: '/m/low-stock',
        label: '低库存预警',
        desc: lowStockCount > 0 ? `${lowStockCount} 个预警` : '库存充足',
        icon: Gauge,
        iconClass: lowStockCount > 0 ? 'text-orange-600' : 'text-slate-500',
        bgClass: lowStockCount > 0 ? 'bg-orange-50' : 'bg-slate-50',
        badge: lowStockCount > 0 ? lowStockCount : undefined,
        requireWrite: false,
        requireAdmin: false,
      },
    ]
    return list.filter((e) => {
      if (e.requireWrite && !canWrite()) return false
      if (e.requireAdmin && !canManageUsers()) return false
      return true
    })
  }, [canWrite, canManageUsers, outOfStockCount, lowStockCount])

  return (
    <div className="p-4 space-y-4">
      <AlertBanner type="out" count={outOfStockCount} />
      <AlertBanner type="low" count={lowStockCount} />

      <section>
        <h2 className="text-sm font-semibold mb-2">快速操作</h2>
        <QuickActionsGrid actions={quickActions} />
      </section>

      <section>
        <h2 className="text-sm font-semibold mb-2">库存概况</h2>
        <StatsGrid
          canWrite={canWrite()}
          productCount={productCount}
          totalQty={totalQty}
          weekIn={weekIn}
          weekOut={weekOut}
        />
      </section>

      <section>
        <h2 className="text-sm font-semibold mb-2">管理</h2>
        <ManageEntriesList entries={manageEntries} />
      </section>
    </div>
  )
}

export default memo(MobileHomeInner)
