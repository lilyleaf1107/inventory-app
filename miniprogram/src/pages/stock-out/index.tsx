import { useState, useMemo } from 'react'
import { View, Text, Input, ScrollView, Picker } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/auth'
import { isWarehouseManagerAbove } from '@/lib/permissions'
import { scanBarcode } from '@/lib/scanner'
import type { Product } from '@/types'

interface InvItem {
  id: string
  quantity: number
  location: { id: string; code: string; warehouse: { id: string; code: string; name: string | null } }
}

export default function StockOut() {
  const profile = useAuthStore(s => s.profile)
  const user = useAuthStore(s => s.user)
  const checkAuth = useAuthStore(s => s.checkAuth)
  const queryClient = useQueryClient()
  const canWrite = isWarehouseManagerAbove(profile)

  const [product, setProduct] = useState<Product | null>(null)
  const [productSearch, setProductSearch] = useState('')
  const [showProductPicker, setShowProductPicker] = useState(false)
  const [locationId, setLocationId] = useState('')
  const [quantity, setQuantity] = useState('')
  const [batchNo, setBatchNo] = useState('')
  const [remark, setRemark] = useState('')
  const [scanMode, setScanMode] = useState(false)

  useDidShow(() => {
    checkAuth()
    if (!useAuthStore.getState().user) Taro.redirectTo({ url: '/pages/login/index' })
  })

  const { data: allProducts } = useQuery({
    queryKey: ['products-stock-out'],
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

  const { data: inventoryList } = useQuery({
    queryKey: ['product-inventory-out', product?.id],
    enabled: !!product,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('inventory')
        .select(`
          *,
          location:locations (
            id, code,
            warehouse:warehouses (id, name, code)
          )
        `)
        .eq('product_id', product!.id)
        .gt('quantity', 0)
        .order('updated_at', { ascending: false })
      if (error) throw error
      return (data as InvItem[]) || []
    },
  })

  const totalStock = useMemo(
    () => inventoryList?.reduce((s, inv) => s + Number(inv.quantity), 0) || 0,
    [inventoryList]
  )
  const selectedLocationQty = useMemo(() => {
    const inv = inventoryList?.find((i) => i.location.id === locationId)
    return inv ? Number(inv.quantity) : 0
  }, [inventoryList, locationId])

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

  const stockOutMutation = useMutation({
    mutationFn: async () => {
      if (!canWrite) throw new Error('无操作权限')
      const qty = parseFloat(quantity)
      if (!product) throw new Error('请选择产品')
      if (!locationId) throw new Error('请选择库位')
      if (!qty || qty <= 0) throw new Error('数量必须大于0')
      if (qty > selectedLocationQty) throw new Error(`该库位仅 ${selectedLocationQty}，库存不足`)
      const { error } = await supabase.rpc('stock_out', {
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
      Taro.showToast({ title: '出库成功', icon: 'success' })
      queryClient.invalidateQueries({ queryKey: ['inventory'] })
      queryClient.invalidateQueries({ queryKey: ['product-inventory-out'] })
      queryClient.invalidateQueries({ queryKey: ['low-stock'] })
      queryClient.invalidateQueries({ queryKey: ['out-of-stock'] })
      setProduct(null); setQuantity(''); setBatchNo(''); setRemark(''); setLocationId('')
    },
    onError: (e: any) => Taro.showToast({ title: e.message || '出库失败', icon: 'none' }),
  })

  const onScanProduct = async () => {
    try {
      const code = await scanBarcode()
      if (!code) return
      const { data, error } = await supabase.from('products').select('*').eq('barcode', code).limit(1)
      if (error) throw error
      if (data && data[0]) {
        setProduct(data[0] as Product)
        setLocationId('')
        Taro.showToast({ title: '已识别产品', icon: 'success' })
      } else {
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
    setLocationId('')
    setShowProductPicker(false)
    setProductSearch('')
  }

  const resetForm = () => {
    setProduct(null); setQuantity(''); setBatchNo(''); setRemark(''); setLocationId(''); setProductSearch('')
  }

  const locRange = inventoryList?.map(i => `${i.location.code} · ${i.location.warehouse?.name || i.location.warehouse?.code}（剩${i.quantity}）`) || []
  const locIndex = useMemo(() => inventoryList?.findIndex(i => i.location.id === locationId) ?? -1, [inventoryList, locationId])

  return (
    <ScrollView scrollY style={{ minHeight: '100vh' }}>
      <View className="page-wrap">
      <Text className="text-lg font-semibold mb-3 block">📤 出库</Text>

      {!canWrite ? (
        <View className="card"><View className="card-content text-center text-muted-foreground">您没有出库权限，请联系管理员</View></View>
      ) : (
        <View className="card">
          <View className="card-content">
            <View className="field-wrap">
              <Text className="field-label">产品 *</Text>
              <View className="flex gap-2">
                <View className="btn btn-outline flex-1 btn-sm" onClick={() => setShowProductPicker(true)}
                  style={{ justifyContent: 'flex-start', paddingLeft: '20rpx' }}>
                  {product ? (
                    <Text className="truncate">{product.name}{product.sku ? ` (${product.sku})` : ''}</Text>
                  ) : <Text className="text-muted-foreground">点击选择产品</Text>}
                </View>
                <View className="btn btn-secondary btn-sm" onClick={onScanProduct}>📷 扫码</View>
              </View>
            </View>

            {product && (
              <View className="mb-3 p-3 rounded-lg" style={{ background: 'var(--secondary)' }}>
                <View className="flex items-center justify-between">
                  <Text className="text-sm">当前总库存</Text>
                  <Text className="font-semibold text-lg">{totalStock} {product.unit}</Text>
                </View>
                {totalStock === 0 && (
                  <Text className="text-red-600 text-xs mt-1">⚠️ 该产品无可用库存</Text>
                )}
              </View>
            )}

            <View className="field-wrap">
              <Text className="field-label">库位（仅显示有库存的库位）*</Text>
              {inventoryList && inventoryList.length > 0 ? (
                <Picker mode="selector" range={locRange} value={locIndex >= 0 ? locIndex : 0}
                  onChange={(e) => setLocationId(inventoryList?.[Number(e.detail.value)]?.location.id || '')}>
                  <View className="btn btn-outline btn-block btn-sm" style={{ justifyContent: 'flex-start', paddingLeft: '20rpx' }}>
                    {locationId ? (
                      <Text>
                        <Text className="font-mono">{inventoryList?.find(i => i.location.id === locationId)?.location.code}</Text>
                        <Text className="text-muted-foreground">  · 可出 {selectedLocationQty}</Text>
                      </Text>
                    ) : <Text className="text-muted-foreground">请选择库位</Text>}
                  </View>
                </Picker>
              ) : (
                <View className="btn btn-outline btn-block btn-sm" style={{ justifyContent: 'flex-start', paddingLeft: '20rpx', opacity: 0.5 }}>
                  <Text className="text-muted-foreground">{product ? '暂无可用库位' : '先选择产品'}</Text>
                </View>
              )}
            </View>

            <View className="field-wrap">
              <Text className="field-label">出库数量 *{locationId && selectedLocationQty > 0 ? `（最多 ${selectedLocationQty}）` : ''}</Text>
              <Input className="field-input" type="digit" placeholder={`请输入数量${product?.unit ? `，单位：${product.unit}` : ''}`}
                value={quantity} onInput={(e) => setQuantity(e.detail.value)} />
              {locationId && selectedLocationQty > 0 && (
                <View className="flex gap-2 mt-2">
                  {[0.5, 1].map(frac => {
                    const n = Math.floor(selectedLocationQty * frac)
                    return n > 0 && (
                      <View key={frac} className="btn btn-outline btn-xs" onClick={() => setQuantity(String(n))}>{frac === 1 ? '全部' : `一半(${n})`}</View>
                    )
                  })}
                </View>
              )}
            </View>

            <View className="field-wrap">
              <Text className="field-label">批次号</Text>
              <Input className="field-input" placeholder="选填" value={batchNo} onInput={(e) => setBatchNo(e.detail.value)} />
            </View>
            <View className="field-wrap">
              <Text className="field-label">备注</Text>
              <Input className="field-input" placeholder="选填" value={remark} onInput={(e) => setRemark(e.detail.value)} />
            </View>
          </View>
          <View className="card-footer flex gap-2">
            <View className="btn btn-outline flex-1" onClick={resetForm}>重置</View>
            <View className="btn btn-primary flex-1" onClick={() => stockOutMutation.mutate()}
              disabled={stockOutMutation.isLoading}>
              {stockOutMutation.isLoading ? '提交中...' : '确认出库'}
            </View>
          </View>
        </View>
      )}

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
