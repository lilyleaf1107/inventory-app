import { useState, useMemo } from 'react'
import { View, Text, Input, ScrollView, Picker } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/auth'
import { isWarehouseManagerAbove } from '@/lib/permissions'
import { scanBarcode } from '@/lib/scanner'
import type { Product, Warehouse, Location } from '@/types'

export default function StockIn() {
  const profile = useAuthStore(s => s.profile)
  const user = useAuthStore(s => s.user)
  const checkAuth = useAuthStore(s => s.checkAuth)
  const queryClient = useQueryClient()
  const canWrite = isWarehouseManagerAbove(profile)

  const [product, setProduct] = useState<Product | null>(null)
  const [productSearch, setProductSearch] = useState('')
  const [showProductPicker, setShowProductPicker] = useState(false)
  const [warehouseId, setWarehouseId] = useState('')
  const [locationId, setLocationId] = useState('')
  const [quantity, setQuantity] = useState('')
  const [batchNo, setBatchNo] = useState('')
  const [remark, setRemark] = useState('')
  const [scanMode, setScanMode] = useState(false)

  useDidShow(() => {
    checkAuth()
    if (!useAuthStore.getState().user) Taro.redirectTo({ url: '/pages/login/index' })
  })

  const { data: warehouses } = useQuery({
    queryKey: ['warehouses'],
    queryFn: async () => {
      const { data, error } = await supabase.from('warehouses').select('*').order('name')
      if (error) throw error
      return data as Warehouse[]
    },
  })

  const { data: locations } = useQuery({
    queryKey: ['locations', warehouseId],
    enabled: !!warehouseId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('locations')
        .select('*')
        .eq('warehouse_id', warehouseId)
        .order('code')
      if (error) throw error
      return data as Location[]
    },
  })

  const { data: allProducts } = useQuery({
    queryKey: ['products-stock-in'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('products')
        .select('id, name, sku, barcode, unit, on_shelf')
        .eq('on_shelf', true)
        .order('name')
      if (error) throw error
      return data as Product[]
    },
  })

  // 现有产品的库位：入库时默认优先选已有库位
  const { data: productLocations } = useQuery({
    queryKey: ['product-existing-locs', product?.id],
    enabled: !!product,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('inventory')
        .select('location_id, location:locations(id, code, warehouse_id, warehouse:warehouses(id, code, name))')
        .eq('product_id', product!.id)
        .gt('quantity', 0)
        .order('updated_at', { ascending: false })
      if (error) throw error
      return (data as any[]) || []
    },
  })

  // 自动选择：如果该产品之前放某仓库/库位，默认沿用
  useMemo(() => {
    if (!product || !productLocations || productLocations.length === 0) return
    const first = productLocations[0]
    if (first?.location?.warehouse_id && !warehouseId) setWarehouseId(first.location.warehouse_id)
    if (first?.location_id && !locationId) setLocationId(first.location_id)
  }, [product, productLocations, warehouseId, locationId])

  const filteredProducts = useMemo(() => {
    if (!allProducts) return []
    if (!productSearch.trim()) return allProducts.slice(0, 50)
    const q = productSearch.trim().toLowerCase()
    return allProducts.filter(p =>
      p.name.toLowerCase().includes(q) ||
      (p.sku && p.sku.toLowerCase().includes(q)) ||
      (p.barcode && p.barcode.toLowerCase().includes(q))
    ).slice(0, 50)
  }, [allProducts, productSearch])

  const stockInMutation = useMutation({
    mutationFn: async () => {
      if (!canWrite) throw new Error('无操作权限')
      const qty = parseFloat(quantity)
      if (!product) throw new Error('请选择产品')
      if (!warehouseId) throw new Error('请选择仓库')
      if (!locationId) throw new Error('请选择库位')
      if (!qty || qty <= 0) throw new Error('数量必须大于0')
      const { error } = await supabase.rpc('stock_in', {
        p_product_id: product.id,
        p_location_id: locationId,
        p_quantity: qty,
        p_batch_no: batchNo || null,
        p_scan_mode: scanMode ? 'scan' : 'manual',
        p_remark: remark || null,
        p_operator_id: user?.id || null,
      })
      if (error) throw error
    },
    onSuccess: () => {
      Taro.showToast({ title: '入库成功', icon: 'success' })
      queryClient.invalidateQueries({ queryKey: ['inventory'] })
      queryClient.invalidateQueries({ queryKey: ['product-existing-locs'] })
      queryClient.invalidateQueries({ queryKey: ['low-stock'] })
      queryClient.invalidateQueries({ queryKey: ['out-of-stock'] })
      setProduct(null); setQuantity(''); setBatchNo(''); setRemark('')
      setWarehouseId(''); setLocationId('')
    },
    onError: (e: any) => Taro.showToast({ title: e.message || '入库失败', icon: 'none' }),
  })

  const onScanProduct = async () => {
    try {
      const code = await scanBarcode()
      if (!code) return
      // 先按条码直接查产品
      const { data, error } = await supabase
        .from('products')
        .select('*')
        .eq('barcode', code)
        .limit(1)
      if (error) throw error
      if (data && data[0]) {
        setProduct(data[0] as Product)
        Taro.showToast({ title: '已识别产品', icon: 'success' })
      } else {
        // 没找到就打开搜索框并填入
        setProductSearch(code)
        setShowProductPicker(true)
        Taro.showToast({ title: '未找到对应产品，请手动选择', icon: 'none' })
      }
    } catch (e: any) {
      Taro.showToast({ title: e.message || '扫码失败', icon: 'none' })
    }
  }

  const selectProduct = (p: Product) => {
    setProduct(p)
    setShowProductPicker(false)
    setProductSearch('')
  }

  const resetForm = () => {
    setProduct(null); setQuantity(''); setBatchNo(''); setRemark('')
    setWarehouseId(''); setLocationId(''); setProductSearch('')
  }

  const whIndex = useMemo(() => warehouses?.findIndex(w => w.id === warehouseId) ?? -1, [warehouses, warehouseId])
  const locIndex = useMemo(() => locations?.findIndex(l => l.id === locationId) ?? -1, [locations, locationId])
  const whRange = warehouses?.map(w => w.name || w.code) || []
  const locRange = locations?.map(l => l.code) || []

  return (
    <ScrollView scrollY style={{ minHeight: '100vh' }}>
      <View className="page-wrap">
      <Text className="text-lg font-semibold mb-3 block">📥 入库</Text>

      {!canWrite ? (
        <View className="card"><View className="card-content text-center text-muted-foreground">您没有入库权限，请联系管理员</View></View>
      ) : (
        <View className="card">
          <View className="card-content">
            {/* 产品选择 */}
            <View className="field-wrap">
              <Text className="field-label">产品 *</Text>
              <View className="flex gap-2">
                <View className="btn btn-outline flex-1 btn-sm"
                  onClick={() => setShowProductPicker(true)}
                  style={{ justifyContent: 'flex-start', paddingLeft: '20rpx' }}>
                  {product ? (
                    <Text className="truncate">{product.name}{product.sku ? ` (${product.sku})` : ''}</Text>
                  ) : <Text className="text-muted-foreground">点击选择产品</Text>}
                </View>
                <View className="btn btn-secondary btn-sm" onClick={onScanProduct}>📷 扫码</View>
              </View>
            </View>

            {/* 仓库选择 */}
            <View className="field-wrap">
              <Text className="field-label">仓库 *</Text>
              <Picker mode="selector" range={whRange} value={whIndex >= 0 ? whIndex : 0}
                onChange={(e) => {
                  const idx = Number(e.detail.value)
                  setWarehouseId(warehouses?.[idx]?.id || '')
                  setLocationId('')
                }}>
                <View className="btn btn-outline btn-block btn-sm" style={{ justifyContent: 'flex-start', paddingLeft: '20rpx' }}>
                  {warehouseId
                    ? <Text>{warehouses?.find(w => w.id === warehouseId)?.name || warehouses?.find(w => w.id === warehouseId)?.code}</Text>
                    : <Text className="text-muted-foreground">请选择仓库</Text>}
                </View>
              </Picker>
            </View>

            {/* 库位选择 */}
            <View className="field-wrap">
              <Text className="field-label">库位 *</Text>
              <Picker mode="selector" range={locRange} value={locIndex >= 0 ? locIndex : 0}
                disabled={!warehouseId}
                onChange={(e) => setLocationId(locations?.[Number(e.detail.value)]?.id || '')}>
                <View className={`btn btn-block btn-sm ${warehouseId ? 'btn-outline' : 'btn-outline'}`}
                  style={{ justifyContent: 'flex-start', paddingLeft: '20rpx', opacity: warehouseId ? 1 : 0.5 }}>
                  {locationId
                    ? <Text className="font-mono">{locations?.find(l => l.id === locationId)?.code}</Text>
                    : <Text className="text-muted-foreground">{warehouseId ? '请选择库位' : '先选仓库'}</Text>}
                </View>
              </Picker>
            </View>

            {/* 数量 */}
            <View className="field-wrap">
              <Text className="field-label">数量 * {product?.unit ? `（${product.unit}）` : ''}</Text>
              <Input className="field-input" type="digit" placeholder="请输入入库数量"
                value={quantity} onInput={(e) => setQuantity(e.detail.value)} />
            </View>

            {/* 批次号 */}
            <View className="field-wrap">
              <Text className="field-label">批次号</Text>
              <Input className="field-input" placeholder="选填，如 20260801"
                value={batchNo} onInput={(e) => setBatchNo(e.detail.value)} />
            </View>

            {/* 备注 */}
            <View className="field-wrap">
              <Text className="field-label">备注</Text>
              <Input className="field-input" placeholder="选填"
                value={remark} onInput={(e) => setRemark(e.detail.value)} />
            </View>
          </View>
          <View className="card-footer flex gap-2">
            <View className="btn btn-outline flex-1" onClick={resetForm}>重置</View>
            <View className="btn btn-primary flex-1"
              onClick={() => stockInMutation.mutate()}
              disabled={stockInMutation.isLoading}>
              {stockInMutation.isLoading ? '提交中...' : '确认入库'}
            </View>
          </View>
        </View>
      )}

      {/* 产品选择弹层 */}
      {showProductPicker && (
        <View style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 999, display: 'flex', flexDirection: 'column' }}
          onClick={() => setShowProductPicker(false)}>
          <View className="card" style={{ position: 'absolute', left: 0, right: 0, bottom: 0, maxHeight: '75vh', display: 'flex', flexDirection: 'column', borderBottomLeftRadius: 0, borderBottomRightRadius: 0 }}
            onClick={(e) => e.stopPropagation()}>
            <View className="card-header flex items-center justify-between">
              <Text className="card-title">选择产品</Text>
              <Text className="chevron" onClick={() => setShowProductPicker(false)}>✕</Text>
            </View>
            <View className="card-content" style={{ paddingTop: 0 }}>
              <Input className="field-input" placeholder="搜索产品名 / SKU / 条码"
                value={productSearch} onInput={(e) => setProductSearch(e.detail.value)} />
            </View>
            <ScrollView scrollY style={{ maxHeight: '55vh', padding: '0 24rpx 24rpx' }}>
              {filteredProducts.length === 0 ? (
                <View className="empty" style={{ padding: '80rpx 24rpx' }}>
                  <View className="empty-title">无匹配产品</View>
                </View>
              ) : filteredProducts.map(p => (
                <View key={p.id} className="card mb-2" onClick={() => selectProduct(p)}>
                  <View className="card-content" style={{ padding: '20rpx 24rpx' }}>
                    <Text className="font-medium text-sm truncate">{p.name}</Text>
                    <View className="text-xs text-muted-foreground mt-1">
                      {p.sku && `SKU: ${p.sku}  `}
                      {p.barcode && `条码: ${p.barcode}`}
                    </View>
                  </View>
                </View>
              ))}
            </ScrollView>
          </View>
        </View>
      )}
      <View style={{ height: '60rpx' }} />
      </View>
    </ScrollView>
  )
}
