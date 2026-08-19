import { useMemo } from 'react'
import { View, Text, ScrollView } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import { useQuery } from '@tanstack/react-query'
import { useAuthStore } from '@/store/auth'
import { isWarehouseManagerAbove, isAdminAbove } from '@/lib/permissions'
import { supabase } from '@/lib/supabase'

type QuickAction = {
  url: string
  label: string
  icon: string
  qaClass: string
  requireWrite?: boolean
  isTab?: boolean
}

type ManageEntry = {
  url: string
  label: string
  desc: string | number
  icon: string
  iconBox: string
  badge?: number
  requireWrite?: boolean
  requireAdmin?: boolean
  isTab?: boolean
}

const quickActions: QuickAction[] = [
  { url: '/pages/stock-in/index', label: '扫码入库', icon: '📥', qaClass: 'qa-emerald', requireWrite: true },
  { url: '/pages/stock-out/index', label: '扫码出库', icon: '📤', qaClass: 'qa-amber', requireWrite: true },
  { url: '/pages/products/index', label: '产品管理', icon: '📦', qaClass: 'qa-blue' },
  { url: '/pages/inventory/index', label: '库存查询', icon: '🔍', qaClass: 'qa-purple', isTab: true },
]

function Nav({ url, isTab, children }: { url: string; isTab?: boolean; children: any }) {
  const go = () => {
    if (isTab) Taro.switchTab({ url })
    else Taro.navigateTo({ url }).catch(() => {})
  }
  return <View onClick={go}>{children}</View>
}

export default function HomePage() {
  const profile = useAuthStore(s => s.profile)
  const checkAuth = useAuthStore(s => s.checkAuth)
  const canWrite = isWarehouseManagerAbove(profile)
  const canManageUsers = isAdminAbove(profile)
  useDidShow(() => { checkAuth() })

  const { data: productCount = 0 } = useQuery({
    queryKey: ['home-product-count'],
    queryFn: async () => {
      const { count, error } = await supabase.from('products').select('*', { count: 'exact', head: true })
      if (error) throw error
      return count ?? 0
    },
  })

  const { data: totalQty = 0 } = useQuery({
    queryKey: ['home-total-qty'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_total_stock_qty')
      if (error) throw error
      return Number(data ?? 0)
    },
  })

  const { data: weekIn = 0 } = useQuery({
    queryKey: ['home-week-in'],
    queryFn: async () => {
      const since = new Date(Date.now() - 7 * 86400000).toISOString()
      const { count, error } = await supabase
        .from('stock_moves')
        .select('*', { count: 'exact', head: true })
        .eq('type', 'in')
        .gte('created_at', since)
      if (error) throw error
      return count ?? 0
    },
  })

  const { data: weekOut = 0 } = useQuery({
    queryKey: ['home-week-out'],
    queryFn: async () => {
      const since = new Date(Date.now() - 7 * 86400000).toISOString()
      const { count, error } = await supabase
        .from('stock_moves')
        .select('*', { count: 'exact', head: true })
        .eq('type', 'out')
        .gte('created_at', since)
      if (error) throw error
      return count ?? 0
    },
  })

  const { data: lowCount = 0 } = useQuery({
    queryKey: ['home-low-count'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('low_stock_products')
      if (error) throw error
      return (data || []).length
    },
  })

  const { data: outCount = 0 } = useQuery({
    queryKey: ['home-out-count'],
    queryFn: async () => {
      const { count, error } = await supabase
        .from('products_with_stock')
        .select('*', { count: 'exact', head: true })
        .lte('total_qty', 0)
      if (error) throw error
      return count ?? 0
    },
  })

  const manageEntries: ManageEntry[] = useMemo(() => [
    {
      url: '/pages/out-of-stock/index',
      label: '缺货商品',
      desc: outCount > 0 ? `${outCount} 个商品缺货 · 点击查看断货详情` : '暂无缺货商品',
      icon: '⚠️',
      iconBox: 'icon-circle icon-box-red',
      badge: outCount > 0 ? outCount : undefined,
    },
    {
      url: '/pages/low-stock/index',
      label: '低库存预警',
      desc: lowCount > 0 ? `${lowCount} 个商品低于安全库存` : '暂无低库存商品',
      icon: '📊',
      iconBox: 'icon-circle icon-box-orange',
      badge: lowCount > 0 ? lowCount : undefined,
    },
    { url: '/pages/warehouses/index', label: '仓库管理', desc: '管理仓库及仓位位置', icon: '🏭', iconBox: 'icon-box icon-box-blue' },
    { url: '/pages/categories/index', label: '分类管理', desc: '产品分类树结构维护', icon: '📁', iconBox: 'icon-box icon-box-purple' },
    { url: '/pages/materials/index', label: '物料/辅助件', desc: '辅助物料清单与属性', icon: '🧰', iconBox: 'icon-box icon-box-amber' },
    { url: '/pages/profile/index', label: '我的 / 设置', desc: '账号信息、退出登录', icon: '👤', iconBox: 'icon-box icon-box-muted', isTab: true },
  ], [lowCount, outCount])

  return (
    <ScrollView scrollY style={{ height: '100vh' }}>
      <View className="page-wrap">
      {/* === 统计卡片（对齐网页版 2x2 网格） === */}
      <View className="grid grid-cols-2 grid-gap-2 mb-3">
        <View className="card">
          <View className="card-content" style={{ padding: '24rpx' }}>
            <View className="flex items-center gap-2 text-xs text-muted-foreground">
              <Text>📦</Text><Text>产品总数</Text>
            </View>
            <View className="text-xl font-bold mt-2">{productCount}</View>
          </View>
        </View>
        <View className="card">
          <View className="card-content" style={{ padding: '24rpx' }}>
            <View className="flex items-center gap-2 text-xs text-muted-foreground">
              <Text>🗃️</Text><Text>库存数量</Text>
            </View>
            <View className="text-xl font-bold mt-2">{totalQty.toLocaleString()}</View>
          </View>
        </View>
        {canWrite && (
          <View className="card">
            <View className="card-content" style={{ padding: '24rpx' }}>
              <View className="flex items-center gap-2 text-xs text-muted-foreground">
                <Text className="text-emerald-500">📈</Text><Text>本周入库</Text>
              </View>
              <View className="text-xl font-bold mt-2 text-emerald-600">+{weekIn}</View>
            </View>
          </View>
        )}
        {canWrite && (
          <View className="card">
            <View className="card-content" style={{ padding: '24rpx' }}>
              <View className="flex items-center gap-2 text-xs text-muted-foreground">
                <Text className="text-amber-500">📉</Text><Text>本周出库</Text>
              </View>
              <View className="text-xl font-bold mt-2 text-amber-600">-{weekOut}</View>
            </View>
          </View>
        )}
      </View>

      {/* === 快捷入口（对齐网页版 4 列网格） === */}
      <View className="mb-4">
        <View className="text-base font-semibold mb-3">快捷操作</View>
        <View className="grid grid-cols-4 grid-gap-3">
          {quickActions.filter(a => !a.requireWrite || canWrite).map(a => (
            <Nav key={a.url} url={a.url} isTab={a.isTab}>
              <View className={`quick-action ${a.qaClass}`}>
                <View className="qa-icon">{a.icon}</View>
                <Text className="qa-label">{a.label}</Text>
              </View>
            </Nav>
          ))}
        </View>
      </View>

      {/* === 管理入口列表（带 chevron 行） === */}
      <View>
        <View className="text-base font-semibold mb-3">管理</View>
        <View className="grid grid-cols-1 grid-gap-2">
          {manageEntries.filter(e =>
            (!e.requireWrite || canWrite) && (!e.requireAdmin || canManageUsers)
          ).map(e => {
            const cardClass =
              e.url === '/pages/out-of-stock/index' ? 'alert-card-out' :
              e.url === '/pages/low-stock/index' ? 'alert-card-low' : ''
            return (
              <Nav key={e.url} url={e.url} isTab={e.isTab}>
                <View className={`card ${cardClass}`}>
                  <View className="list-row">
                    <View className={e.iconBox}>{e.icon}</View>
                    <View className="flex-1 min-w-0">
                      <View className="flex items-center gap-2">
                        <Text className="list-row-title">{e.label}</Text>
                        {typeof e.badge === 'number' && e.badge > 0 && (
                          <Text className={`badge ${
                            e.url === '/pages/out-of-stock/index' ? 'badge-red' :
                            e.url === '/pages/low-stock/index' ? 'badge-amber' : 'badge-muted'
                          }`}>{e.badge}</Text>
                        )}
                      </View>
                      <View className="list-row-desc truncate">{e.desc}</View>
                    </View>
                    <Text className="chevron">›</Text>
                  </View>
                </View>
              </Nav>
            )
          })}
        </View>
      </View>

      <View style={{ height: '60rpx' }} />
      </View>
    </ScrollView>
  )
}
