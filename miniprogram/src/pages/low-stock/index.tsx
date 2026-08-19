import { View, Text, ScrollView } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/auth'

const THRESHOLD_WARNING = 30
const THRESHOLD_DANGER = 15
const THRESHOLD_CRITICAL = 5

function getLevel(qty: number): 'warning' | 'danger' | 'critical' {
  if (qty <= THRESHOLD_CRITICAL) return 'critical'
  if (qty <= THRESHOLD_DANGER) return 'danger'
  return 'warning'
}

function levelColor(level: string) {
  switch (level) {
    case 'critical': return { bg: '#fef2f2', border: '#fecaca', text: '#dc2626', label: '红色预警' }
    case 'danger': return { bg: '#fff7ed', border: '#fed7aa', text: '#ea580c', label: '橙色预警' }
    default: return { bg: '#fefce8', border: '#fef08a', text: '#ca8a04', label: '黄色预警' }
  }
}

export default function LowStockPage() {
  const profile = useAuthStore(s => s.profile)
  const checkAuth = useAuthStore(s => s.checkAuth)

  useDidShow(() => {
    checkAuth()
    if (!useAuthStore.getState().user) {
      Taro.redirectTo({ url: '/pages/login/index' })
    }
  })

  const { data, isLoading } = useQuery({
    queryKey: ['low-stock'],
    enabled: !!profile,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('inventory')
        .select(`
          id, quantity,
          product:products(id, name, sku, barcode, image_path, unit, category, is_material_area),
          location:locations(id, code, warehouse:warehouses(id, code, name))
        `)
        .gt('quantity', 0)
        .lte('quantity', 30)
        .order('quantity', { ascending: true })
      if (error) throw error
      return data || []
    },
  })

  const rows = (data as any[]) || []
  const total = rows.length
  const cntWarning = rows.filter(r => getLevel(r.quantity || 0) === 'warning').length
  const cntDanger = rows.filter(r => getLevel(r.quantity || 0) === 'danger').length
  const cntCritical = rows.filter(r => getLevel(r.quantity || 0) === 'critical').length

  return (
    <ScrollView scrollY style={{ height: '100vh' }}>
      <View className="page-wrap">
      {/* 顶部：标题 + 返回 */}
      <View className="flex items-center gap-2 mb-3">
        <Text onClick={() => Taro.navigateBack()} style={{ fontSize: '40rpx', color: '#64748b', lineHeight: 1 }}>←</Text>
        <Text style={{ fontSize: '36rpx', fontWeight: '700', color: '#ea580c' }}>⚠️ 低库存预警</Text>
      </View>

      {/* 统计区：4 个卡片 */}
      <View className="grid grid-cols-2 grid-gap-2 mb-3">
        <View className="card">
          <View className="card-content" style={{ padding: '20rpx 24rpx' }}>
            <Text className="text-xs text-muted-foreground">预警总数</Text>
            <View className="text-xl font-bold mt-2">{total}</View>
          </View>
        </View>
        <View className="card">
          <View className="card-content" style={{ padding: '20rpx 24rpx' }}>
            <Text className="text-xs text-muted-foreground">≤30 黄色</Text>
            <View className="text-xl font-bold mt-2" style={{ color: '#ca8a04' }}>{cntWarning}</View>
          </View>
        </View>
        <View className="card">
          <View className="card-content" style={{ padding: '20rpx 24rpx' }}>
            <Text className="text-xs text-muted-foreground">≤15 橙色</Text>
            <View className="text-xl font-bold mt-2" style={{ color: '#ea580c' }}>{cntDanger}</View>
          </View>
        </View>
        <View className="card">
          <View className="card-content" style={{ padding: '20rpx 24rpx' }}>
            <Text className="text-xs text-muted-foreground">≤5 红色</Text>
            <View className="text-xl font-bold mt-2" style={{ color: '#dc2626' }}>{cntCritical}</View>
          </View>
        </View>
      </View>

      {/* 列表区 */}
      <View className="text-base font-semibold mb-2">库存明细（按库存量升序）</View>
      {isLoading ? (
        <View style={{ padding: '80rpx 0', textAlign: 'center' }}>
          <Text className="text-muted-foreground">加载中...</Text>
        </View>
      ) : rows.length === 0 ? (
        <View style={{ padding: '120rpx 0', textAlign: 'center' }}>
          <View style={{ fontSize: '96rpx', marginBottom: '24rpx' }}>✅</View>
          <Text style={{ fontSize: '30rpx', fontWeight: '500' }}>暂无低库存预警</Text>
          <View style={{ marginTop: '10rpx' }}>
            <Text className="text-sm text-muted-foreground">所有商品库存充足</Text>
          </View>
        </View>
      ) : (
        rows.map(r => {
          const qty = r.quantity || 0
          const level = getLevel(qty)
          const c = levelColor(level)
          const isMaterial = r.product?.is_material_area
          const pct = Math.max(4, Math.min(100, Math.round((qty / THRESHOLD_WARNING) * 100)))
          const whName = r.location?.warehouse?.name || ''
          const locCode = r.location?.code || ''
          return (
            <View
              key={r.id}
              className="card mb-2"
              style={{ padding: '20rpx 24rpx', background: c.bg, borderColor: c.border }}
            >
              {/* 产品名 + 预警等级标签 */}
              <View className="flex items-center justify-between gap-2">
                <View className="flex items-center gap-2 flex-1 min-w-0">
                  <Text style={{ fontSize: '30rpx', fontWeight: '600' }} className="truncate">
                    {r.product?.name || '未命名'}
                  </Text>
                  {isMaterial && (
                    <Text style={{ fontSize: '20rpx', padding: '2rpx 12rpx', borderRadius: '999rpx', background: '#e2e8f0', color: '#475569' }}>物料</Text>
                  )}
                </View>
                <Text
                  style={{
                    fontSize: '22rpx',
                    padding: '4rpx 16rpx',
                    borderRadius: '999rpx',
                    background: '#fff',
                    color: c.text,
                    border: `1rpx solid ${c.border}`,
                    fontWeight: '600',
                    flexShrink: 0,
                  }}
                >
                  {c.label}
                </Text>
              </View>

              {/* 库位信息 */}
              <View className="flex items-center gap-2 mt-2">
                <Text className="text-xs text-muted-foreground">
                  📍 {whName}{whName && locCode ? ' · ' : ''}{locCode}
                </Text>
              </View>

              {/* 进度条（当前库存 / 30） */}
              <View className="mt-3">
                <View style={{ height: '12rpx', background: '#fff', borderRadius: '999rpx', overflow: 'hidden' }}>
                  <View style={{ width: pct + '%', height: '100%', background: c.text, borderRadius: '999rpx' }} />
                </View>
              </View>

              {/* 库存数量 */}
              <View className="flex items-center justify-between mt-2">
                <Text className="text-xs text-muted-foreground">当前库存 / 预警阈值 30</Text>
                <Text style={{ fontSize: '32rpx', fontWeight: '700', color: c.text }}>
                  {isMaterial ? '***' : qty}
                </Text>
              </View>
            </View>
          )
        })
      )}

      <View style={{ height: '60rpx' }} />
      </View>
    </ScrollView>
  )
}
