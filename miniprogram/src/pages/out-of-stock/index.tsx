import { View, Text, ScrollView } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/auth'

function getStockoutLevel(lastOutAt: string | null): 'recent' | 'warning' | 'danger' | 'critical' {
  if (!lastOutAt) return 'critical'
  const days = (Date.now() - new Date(lastOutAt).getTime()) / (1000 * 60 * 60 * 24)
  if (days < 3) return 'recent'
  if (days < 7) return 'warning'
  if (days < 30) return 'danger'
  return 'critical'
}

function formatDuration(lastOutAt: string | null): string {
  if (!lastOutAt) return '未知'
  const diff = Date.now() - new Date(lastOutAt).getTime()
  const days = Math.floor(diff / (1000 * 60 * 60 * 24))
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60))
  if (days > 0) return `${days}天${hours > 0 ? hours + '小时' : ''}`
  if (hours > 0) return `${hours}小时`
  return `${Math.floor(diff / (1000 * 60))}分钟`
}

function formatTime(iso: string | null): string {
  if (!iso) return '未知'
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function levelColor(level: string) {
  switch (level) {
    case 'critical': return { bg: '#fef2f2', border: '#fecaca', text: '#dc2626', label: '超30天' }
    case 'danger': return { bg: '#fff7ed', border: '#fed7aa', text: '#ea580c', label: '7-30天' }
    case 'warning': return { bg: '#fefce8', border: '#fef08a', text: '#ca8a04', label: '3-7天' }
    default: return { bg: '#f8fafc', border: '#e2e8f0', text: '#64748b', label: '刚断货' }
  }
}

export default function OutOfStockPage() {
  const profile = useAuthStore(s => s.profile)
  const checkAuth = useAuthStore(s => s.checkAuth)

  useDidShow(() => {
    checkAuth()
    if (!useAuthStore.getState().user) {
      Taro.redirectTo({ url: '/pages/login/index' })
    }
  })

  const { data, isLoading } = useQuery({
    queryKey: ['out-of-stock'],
    enabled: !!profile,
    queryFn: async () => {
      // 第 1 步：查库存为 0 的记录
      const { data: zeroInv, error } = await supabase
        .from('inventory')
        .select(`
          id, quantity,
          product:products(id, name, sku, barcode, image_path, unit, category),
          location:locations(id, code, description, warehouse:warehouses(id, code, name))
        `)
        .eq('quantity', 0)
        .order('updated_at', { ascending: false })
      if (error) throw error
      const items = zeroInv || []

      // 第 2 步：查这些产品的最后出库时间
      const productIds = [...new Set(items.map((i: any) => i.product?.id).filter(Boolean))]
      const locationIds = [...new Set(items.map((i: any) => i.location?.id).filter(Boolean))]
      const lastOutMap = new Map<string, string>()
      if (productIds.length && locationIds.length) {
        const { data: lastOutMoves } = await supabase
          .from('stock_moves')
          .select('product_id, location_id, created_at')
          .eq('move_type', 'out')
          .in('product_id', productIds)
          .in('location_id', locationIds)
          .order('created_at', { ascending: false })
        for (const move of lastOutMoves || []) {
          const key = `${move.product_id}:${move.location_id}`
          if (!lastOutMap.has(key)) lastOutMap.set(key, move.created_at)
        }
      }

      // 组装结果并按断货时间从长到短排序（越久越靠前）
      const result = items.map((i: any) => {
        const key = `${i.product?.id}:${i.location?.id}`
        return { ...i, lastOutAt: lastOutMap.get(key) || null }
      })
      result.sort((a: any, b: any) => {
        if (!a.lastOutAt) return -1
        if (!b.lastOutAt) return 1
        return new Date(a.lastOutAt).getTime() - new Date(b.lastOutAt).getTime()
      })
      return result
    },
  })

  const rows = (data as any[]) || []
  const total = rows.length
  const cntRecent = rows.filter(r => getStockoutLevel(r.lastOutAt) === 'recent').length
  const cntWarning = rows.filter(r => getStockoutLevel(r.lastOutAt) === 'warning').length
  const cntDanger = rows.filter(r => getStockoutLevel(r.lastOutAt) === 'danger').length
  const cntCritical = rows.filter(r => getStockoutLevel(r.lastOutAt) === 'critical').length

  return (
    <ScrollView scrollY style={{ height: '100vh' }}>
      <View className="page-wrap">
      {/* 顶部：标题 + 返回 */}
      <View className="flex items-center gap-2 mb-3">
        <Text onClick={() => Taro.navigateBack()} style={{ fontSize: '40rpx', color: '#64748b', lineHeight: 1 }}>←</Text>
        <Text style={{ fontSize: '36rpx', fontWeight: '700', color: '#dc2626' }}>❗ 缺货提醒</Text>
      </View>

      {/* 统计区：总数 + 4 个分级卡片 */}
      <View className="card mb-2">
        <View className="card-content flex items-center justify-between" style={{ padding: '20rpx 24rpx' }}>
          <Text className="text-xs text-muted-foreground">缺货商品总数</Text>
          <Text className="text-xl font-bold" style={{ color: '#dc2626' }}>{total}</Text>
        </View>
      </View>
      <View className="grid grid-cols-2 grid-gap-2 mb-3">
        <View className="card">
          <View className="card-content" style={{ padding: '20rpx 24rpx' }}>
            <Text className="text-xs text-muted-foreground">3 天内</Text>
            <View className="text-xl font-bold mt-2" style={{ color: '#64748b' }}>{cntRecent}</View>
          </View>
        </View>
        <View className="card">
          <View className="card-content" style={{ padding: '20rpx 24rpx' }}>
            <Text className="text-xs text-muted-foreground">3-7 天</Text>
            <View className="text-xl font-bold mt-2" style={{ color: '#ca8a04' }}>{cntWarning}</View>
          </View>
        </View>
        <View className="card">
          <View className="card-content" style={{ padding: '20rpx 24rpx' }}>
            <Text className="text-xs text-muted-foreground">7-30 天</Text>
            <View className="text-xl font-bold mt-2" style={{ color: '#ea580c' }}>{cntDanger}</View>
          </View>
        </View>
        <View className="card">
          <View className="card-content" style={{ padding: '20rpx 24rpx' }}>
            <Text className="text-xs text-muted-foreground">超 30 天</Text>
            <View className="text-xl font-bold mt-2" style={{ color: '#dc2626' }}>{cntCritical}</View>
          </View>
        </View>
      </View>

      {/* 列表区 */}
      <View className="text-base font-semibold mb-2">缺货明细（按断货时长降序）</View>
      {isLoading ? (
        <View style={{ padding: '80rpx 0', textAlign: 'center' }}>
          <Text className="text-muted-foreground">加载中...</Text>
        </View>
      ) : rows.length === 0 ? (
        <View style={{ padding: '120rpx 0', textAlign: 'center' }}>
          <View style={{ fontSize: '96rpx', marginBottom: '24rpx' }}>✅</View>
          <Text style={{ fontSize: '30rpx', fontWeight: '500' }}>暂无缺货商品</Text>
          <View style={{ marginTop: '10rpx' }}>
            <Text className="text-sm text-muted-foreground">所有商品库存正常</Text>
          </View>
        </View>
      ) : (
        rows.map(r => {
          const level = getStockoutLevel(r.lastOutAt)
          const c = levelColor(level)
          const whName = r.location?.warehouse?.name || ''
          const locCode = r.location?.code || ''
          return (
            <View
              key={r.id}
              className="card mb-2"
              style={{ padding: '20rpx 24rpx', background: c.bg, borderColor: c.border }}
            >
              {/* 产品名 + 时长等级标签 */}
              <View className="flex items-center justify-between gap-2">
                <Text style={{ fontSize: '30rpx', fontWeight: '600' }} className="truncate flex-1 min-w-0">
                  {r.product?.name || '未命名'}
                </Text>
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

              {/* SKU 和分类 */}
              <View className="flex items-center gap-2 mt-2 flex-wrap">
                {r.product?.sku ? (
                  <Text className="text-xs text-muted-foreground">SKU: {r.product.sku}</Text>
                ) : null}
                {r.product?.category ? (
                  <Text className="text-xs text-muted-foreground">🏷️ {r.product.category}</Text>
                ) : null}
              </View>

              {/* 库位信息 */}
              <View className="flex items-center gap-2 mt-2">
                <Text className="text-xs text-muted-foreground">
                  📍 {whName}{whName && locCode ? ' · ' : ''}{locCode}
                </Text>
              </View>

              {/* 最后出库时间 */}
              <View className="flex items-center justify-between mt-2">
                <Text className="text-xs text-muted-foreground">🕐 最后出库</Text>
                <Text className="text-xs text-muted-foreground">{formatTime(r.lastOutAt)}</Text>
              </View>

              {/* 已缺货时长（红色加粗） */}
              <View className="flex items-center justify-between mt-2">
                <Text className="text-sm text-muted-foreground">已缺货时长</Text>
                <Text style={{ fontSize: '32rpx', fontWeight: '700', color: '#dc2626' }}>
                  {formatDuration(r.lastOutAt)}
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
