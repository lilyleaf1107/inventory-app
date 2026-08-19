import { useState, useMemo } from 'react'
import { View, Text, Input, ScrollView, Picker } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/auth'
import type { Warehouse } from '@/types'

const THRESHOLD_WARNING = 30
const THRESHOLD_DANGER = 15
const THRESHOLD_CRITICAL = 5

function getLevel(qty: number): 'critical' | 'danger' | 'warning' | 'ok' {
  if (qty === 0) return 'critical'
  if (qty <= THRESHOLD_CRITICAL) return 'critical'
  if (qty <= THRESHOLD_DANGER) return 'danger'
  if (qty <= THRESHOLD_WARNING) return 'warning'
  return 'ok'
}

function levelStyle(level: string) {
  switch (level) {
    case 'critical':
      return { bg: '#fef2f2', border: '#fecaca', text: '#dc2626', label: '缺货' }
    case 'danger':
      return { bg: '#fff7ed', border: '#fed7aa', text: '#ea580c', label: '橙色预警' }
    case 'warning':
      return { bg: '#fefce8', border: '#fef08a', text: '#ca8a04', label: '黄色预警' }
    default:
      return { bg: '#ffffff', border: '#c8e1d0', text: '#489358', label: '正常' }
  }
}

export default function InventoryPage() {
  const profile = useAuthStore(s => s.profile)
  const checkAuth = useAuthStore(s => s.checkAuth)
  const [kw, setKw] = useState('')
  const [whFilter, setWhFilter] = useState<string>('') // '' 表示全部

  useDidShow(() => {
    checkAuth()
    if (!useAuthStore.getState().user) {
      Taro.redirectTo({ url: '/pages/login/index' })
    }
  })

  // 仓库列表（用于筛选下拉）
  const { data: warehouses } = useQuery({
    queryKey: ['warehouses'],
    enabled: !!profile,
    queryFn: async () => {
      const { data, error } = await supabase.from('warehouses').select('*').order('name')
      if (error) throw error
      return data as Warehouse[]
    },
  })
  const whRange = useMemo(() => {
    const list = [{ id: '', name: '全部仓库' }]
    ;(warehouses || []).forEach((w: any) => list.push({ id: w.id, name: w.name || w.code }))
    return list
  }, [warehouses])
  const whIdx = useMemo(() => {
    const i = whRange.findIndex(w => w.id === whFilter)
    return i < 0 ? 0 : i
  }, [whRange, whFilter])

  // 库存数据
  const { data, isLoading } = useQuery({
    queryKey: ['inventory', 'mini-v2'],
    enabled: !!profile,
    queryFn: async () => {
      const { data: inv, error } = await supabase
        .from('inventory')
        .select(`
          id, quantity,
          product: products(id, name, sku, barcode, image_path, is_material_area, category),
          location: locations(id, code, warehouse: warehouses(id, code, name))
        `)
        .order('updated_at', { ascending: false })
        .limit(500)
      if (error) throw error
      return inv || []
    },
  })

  const allRows = (data as any[]) || []

  // 筛选：关键词 + 仓库
  const rows = useMemo(() => {
    return allRows.filter((r: any) => {
      // 仓库筛选
      if (whFilter && r.location?.warehouse?.id !== whFilter) return false
      // 关键词筛选
      if (!kw) return true
      const q = kw.toLowerCase()
      return (
        r.product?.name?.toLowerCase()?.includes(q) ||
        r.product?.sku?.toLowerCase()?.includes(q) ||
        r.product?.barcode?.toLowerCase()?.includes(q) ||
        r.location?.code?.toLowerCase()?.includes(q)
      )
    })
  }, [allRows, kw, whFilter])

  // 统计（仅基于已筛选结果）
  const stats = useMemo(() => {
    const skuSet = new Set<string>()
    let totalQty = 0
    let low = 0
    let mid = 0
    let outOfStock = 0
    rows.forEach((r: any) => {
      const q = r.quantity || 0
      if (r.product?.id) skuSet.add(r.product.id)
      // 物料区不计入可见统计数量（保持神秘）
      if (!r.product?.is_material_area) totalQty += q
      if (q === 0) outOfStock++
      else if (q <= 5) low++
      else if (q <= 30) mid++
    })
    return { skuCnt: skuSet.size, totalQty, low, mid, outOfStock }
  }, [rows])

  return (
    <ScrollView scrollY style={{ height: '100vh' }}>
      <View className="page-wrap">
      {/* 顶部：标题 + 返回 */}
      <View className="flex items-center gap-2 mb-3">
        <Text
          onClick={() => Taro.navigateBack()}
          style={{ fontSize: '40rpx', color: '#64748b', lineHeight: 1 }}
        >
          ←
        </Text>
        <Text style={{ fontSize: '36rpx', fontWeight: '700', color: '#1f2a23' }}>📦 库存查询</Text>
      </View>

      {/* 统计卡片 */}
      <View className="grid grid-cols-2 grid-gap-2 mb-3">
        <View className="card">
          <View className="card-content" style={{ padding: '20rpx 24rpx' }}>
            <Text className="text-xs text-muted-foreground">SKU 种类</Text>
            <View className="text-xl font-bold mt-2" style={{ color: '#16a34a' }}>
              {stats.skuCnt}
            </View>
          </View>
        </View>
        <View className="card">
          <View className="card-content" style={{ padding: '20rpx 24rpx' }}>
            <Text className="text-xs text-muted-foreground">总库存</Text>
            <View className="text-xl font-bold mt-2" style={{ color: '#2563eb' }}>
              {stats.totalQty}
            </View>
          </View>
        </View>
        <View className="card">
          <View className="card-content" style={{ padding: '20rpx 24rpx' }}>
            <Text className="text-xs text-muted-foreground">低库存</Text>
            <View className="text-xl font-bold mt-2" style={{ color: '#ea580c' }}>
              {stats.low + stats.mid}
            </View>
          </View>
        </View>
        <View className="card">
          <View className="card-content" style={{ padding: '20rpx 24rpx' }}>
            <Text className="text-xs text-muted-foreground">缺货</Text>
            <View className="text-xl font-bold mt-2" style={{ color: '#dc2626' }}>
              {stats.outOfStock}
            </View>
          </View>
        </View>
      </View>

      {/* 筛选区：仓库 + 搜索 */}
      <View className="card mb-3">
        <View className="card-content" style={{ padding: '20rpx 24rpx' }}>
          {/* 仓库筛选 */}
          <Picker
            mode="selector"
            range={whRange.map(w => w.name)}
            value={whIdx}
            onChange={(e: any) => {
              const idx = Number(e.detail.value)
              setWhFilter(whRange[idx]?.id || '')
            }}
          >
            <View
              className="field-input flex items-center justify-between"
              style={{ marginBottom: '16rpx' }}
            >
              <Text className={whFilter ? '' : 'text-muted-foreground'}>
                {whRange[whIdx]?.name || '选择仓库'}
              </Text>
              <Text style={{ color: '#94a3b8', fontSize: '24rpx' }}>▼</Text>
            </View>
          </Picker>

          {/* 关键词搜索 */}
          <Input
            className="field-input"
            placeholder="搜索 产品名 / SKU / 条码 / 库位"
            placeholderClass="text-muted-foreground"
            value={kw}
            onInput={e => setKw(e.detail.value)}
          />
        </View>
      </View>

      {/* 列表标题 */}
      <View className="flex items-center justify-between mb-2">
        <Text className="text-base font-semibold">库存明细</Text>
        <Text className="text-xs text-muted-foreground">共 {rows.length} 条</Text>
      </View>

      {/* 列表区 */}
      {isLoading ? (
        <View style={{ padding: '80rpx 0', textAlign: 'center' }}>
          <Text className="text-muted-foreground">加载中...</Text>
        </View>
      ) : rows.length === 0 ? (
        <View className="empty">
          <View className="empty-icon">📦</View>
          <View className="empty-title">暂无库存数据</View>
          <View className="empty-desc">试试调整筛选条件或新增库存</View>
        </View>
      ) : (
        rows.map((r: any) => {
          const qty = r.quantity || 0
          const isMaterial = r.product?.is_material_area
          const level = getLevel(qty)
          const c = levelStyle(level)
          const whName = r.location?.warehouse?.name || ''
          const locCode = r.location?.code || ''

          return (
            <View
              key={r.id}
              className="card mb-2"
              style={{
                padding: '20rpx 24rpx',
                background: isMaterial ? '#f8fafc' : c.bg,
                borderColor: isMaterial ? '#e2e8f0' : c.border,
              }}
            >
              {/* 产品名 + 库存状态 */}
              <View className="flex items-start justify-between gap-2">
                <View className="flex items-center gap-2 flex-1 min-w-0">
                  <Text
                    style={{ fontSize: '30rpx', fontWeight: '600' }}
                    className="truncate flex-1 min-w-0"
                  >
                    {r.product?.name || '未命名'}
                  </Text>
                  {isMaterial && (
                    <Text
                      style={{
                        fontSize: '20rpx',
                        padding: '2rpx 12rpx',
                        borderRadius: '999rpx',
                        background: '#e2e8f0',
                        color: '#475569',
                        flexShrink: 0,
                      }}
                    >
                      物料
                    </Text>
                  )}
                </View>

                {/* 库存状态标签 / 物料区 *** */}
                {isMaterial ? (
                  <Text
                    style={{
                      fontSize: '28rpx',
                      fontWeight: '700',
                      color: '#64748b',
                      flexShrink: 0,
                      letterSpacing: '2rpx',
                    }}
                  >
                    ***
                  </Text>
                ) : (
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
                    {level === 'ok' ? `库存 ${qty}` : `${c.label} ${qty}`}
                  </Text>
                )}
              </View>

              {/* SKU / 分类 */}
              <View className="flex items-center gap-2 mt-2 flex-wrap">
                {r.product?.sku ? (
                  <Text className="text-xs text-muted-foreground">SKU: {r.product.sku}</Text>
                ) : null}
                {r.product?.category ? (
                  <Text className="text-xs text-muted-foreground">🏷️ {r.product.category}</Text>
                ) : null}
              </View>

              {/* 库位 */}
              <View className="flex items-center gap-2 mt-2">
                <Text className="text-xs text-muted-foreground">
                  📍 {whName}
                  {whName && locCode ? ' · ' : ''}
                  {locCode}
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
