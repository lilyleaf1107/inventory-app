import { useState, useMemo, useCallback, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  ArrowUpFromLine,
  MapPin,
  Package,
  AlertTriangle,
  ImagePlus,
  ScanLine,
  Camera,
  X,
} from 'lucide-react'
import { supabase, getProductImageUrl } from '@/lib/supabase'
import { useAuthStore } from '@/store/auth'
import { useBarcodeGun } from '@/hooks/useBarcodeGun'
import { useDevice } from '@/hooks/useDevice'
import type { Product, Inventory, Location } from '@/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import ProductPicker from '@/components/ProductPicker'
import Scanner from '@/components/Scanner'

export default function StockOutPage() {
  const queryClient = useQueryClient()
  const { user } = useAuthStore()
  const { isMobile } = useDevice()

  const [pickerOpen, setPickerOpen] = useState(false)
  const [scannerOpen, setScannerOpen] = useState(false)
  const [product, setProduct] = useState<Product | null>(null)
  const [locationId, setLocationId] = useState('')
  const [locSearch, setLocSearch] = useState('')
  const [quantity, setQuantity] = useState('')
  const [batchNo, setBatchNo] = useState('')
  const [remark, setRemark] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [scanMode, setScanMode] = useState(false)
  const [searchingBarcode, setSearchingBarcode] = useState(false)

  // 通过条形码查找产品：优先从本地缓存匹配（无网络往返），未命中再走网络查询
  const findProductByBarcode = useCallback(async (barcode: string) => {
    setSearchingBarcode(true)
    try {
      // 1. 优先用本地缓存匹配，无网络往返直接定位
      const cached = queryClient.getQueryData<Product[]>(['products', ''])
      const localMatch = cached?.find((p) => p.barcode === barcode)
      if (localMatch) {
        setProduct(localMatch)
        setScanMode(true)
        setLocationId('')
        setQuantity('')
        toast.success(`已识别产品：${localMatch.name}`)
        return
      }
      // 2. 本地未命中，走网络精确查询
      const { data, error } = await supabase
        .from('products')
        .select('*')
        .eq('barcode', barcode)
        .maybeSingle()
      if (error) throw error
      if (data) {
        setProduct(data as Product)
        setScanMode(true)
        setLocationId('')
        setQuantity('')
        toast.success(`已识别产品：${(data as Product).name}`)
      } else {
        toast.warning(`未找到条形码为「${barcode}」的产品，请手动选择`)
      }
    } catch (err: any) {
      toast.error(err.message || '查询产品失败')
    } finally {
      setSearchingBarcode(false)
    }
  }, [queryClient])

  // 扫码枪监听（电脑端自动启用）
  useBarcodeGun({
    onScan: (code) => {
      findProductByBarcode(code)
    },
    enabled: !isMobile,
  })

  // 查询产品的库存分布
  const { data: inventoryList, isLoading: invLoading } = useQuery({
    queryKey: ['product-inventory', product?.id],
    enabled: !!product,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('inventory')
        .select(`
          *,
          location:locations (
            id,
            code,
            description,
            warehouse:warehouses (id, name, code)
          )
        `)
        .eq('product_id', product!.id)
        .gt('quantity', 0)
        .order('updated_at', { ascending: false })
      if (error) throw error
      return data as (Inventory & {
        location: Location & { warehouse: { id: string; name: string; code: string } }
      })[]
    },
  })

  const totalStock = useMemo(
    () => inventoryList?.reduce((sum, inv) => sum + Number(inv.quantity), 0) || 0,
    [inventoryList],
  )

  const selectedLocationQty = useMemo(() => {
    const inv = inventoryList?.find((i) => i.location_id === locationId)
    return inv ? Number(inv.quantity) : 0
  }, [inventoryList, locationId])

  // 扫码/选择产品后，自动选中最近入库库位（inventoryList 已按 updated_at 降序）
  useEffect(() => {
    if (inventoryList && inventoryList.length > 0 && !locationId) {
      setLocationId(inventoryList[0].location_id)
    }
    if (inventoryList && inventoryList.length === 0) {
      setLocationId('')
    }
  }, [inventoryList, locationId])

  const stockOutMutation = useMutation({
    mutationFn: async () => {
      const qty = parseFloat(quantity)
      if (!product) throw new Error('请选择产品')
      if (!locationId) throw new Error('请选择库位')
      if (!qty || qty <= 0) throw new Error('数量必须大于 0')
      if (qty > selectedLocationQty) {
        throw new Error(`库存不足，该库位仅有 ${selectedLocationQty} ${product.unit}`)
      }

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
      toast.success('出库成功')
      queryClient.invalidateQueries({ queryKey: ['inventory'] })
      queryClient.invalidateQueries({ queryKey: ['product-inventory'] })
      queryClient.invalidateQueries({ queryKey: ['stock-moves'] })
      setQuantity('')
      setBatchNo('')
      setRemark('')
    },
    onError: (err: any) => toast.error(err.message || '出库失败'),
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    try {
      await stockOutMutation.mutateAsync()
    } finally {
      setSubmitting(false)
    }
  }

  const handleManualSelect = (p: Product) => {
    setProduct(p)
    setScanMode(false)
    setLocationId('')
    setQuantity('')
  }

  const handleScannerResult = (code: string) => {
    setScannerOpen(false)
    findProductByBarcode(code)
  }

  const qtyNum = parseFloat(quantity) || 0
  const isOverStock = locationId && qtyNum > selectedLocationQty

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">出库</h2>
          <p className="text-sm text-muted-foreground">
            手动出库或扫码出库
            {!isMobile && '（支持扫码枪）'}
          </p>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <form onSubmit={handleSubmit}>
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <ArrowUpFromLine className="h-5 w-5 text-orange-600" />
                  出库信息
                  {scanMode && (
                    <span className="inline-flex items-center gap-1 text-xs bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full">
                      <ScanLine className="h-3 w-3" />
                      扫码模式
                    </span>
                  )}
                </CardTitle>
                <CardDescription>选择产品和库位，填写出库数量</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* 产品选择 */}
                <div className="space-y-2">
                  <Label>选择产品 *</Label>
                  {product ? (
                    <div className="flex items-center gap-3 p-3 border rounded-md">
                      {product.image_path ? (
                        <img
                          src={getProductImageUrl(product.image_path)}
                          alt={product.name}
                          className="h-12 w-12 rounded object-cover"
                        />
                      ) : (
                        <div className="h-12 w-12 rounded bg-muted flex items-center justify-center">
                          <ImagePlus className="h-6 w-6 text-muted-foreground/50" />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="font-medium">{product.name}</div>
                        <div className="text-xs text-muted-foreground">
                          SKU: {product.sku || '-'}
                          {product.barcode && ` · 条码: ${product.barcode}`}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-lg font-bold">
                          {totalStock}
                          <span className="text-sm font-normal text-muted-foreground ml-1">
                            {product.unit}
                          </span>
                        </div>
                        <div className="text-xs text-muted-foreground">总库存</div>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => setPickerOpen(true)}
                        >
                          更换
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setProduct(null)
                            setScanMode(false)
                            setLocationId('')
                          }}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        className="flex-1 h-20 border-dashed"
                        onClick={() => setPickerOpen(true)}
                      >
                        <Package className="mr-2 h-4 w-4" />
                        手动选择
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        className="flex-1 h-20 border-dashed"
                        onClick={() => setScannerOpen(true)}
                      >
                        <Camera className="mr-2 h-4 w-4" />
                        扫码选择
                      </Button>
                    </div>
                  )}
                  {searchingBarcode && (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <div className="animate-spin rounded-full h-3 w-3 border-b border-primary" />
                      正在查询产品...
                    </div>
                  )}
                </div>

                {/* 库位选择（从库存里选） */}
                <div className="space-y-2">
                  <Label>选择库位 *</Label>
                  {!product ? (
                    <div className="h-10 flex items-center text-sm text-muted-foreground px-3 border rounded-md">
                      请先选择产品
                    </div>
                  ) : invLoading ? (
                    <div className="h-10 flex items-center text-sm text-muted-foreground px-3 border rounded-md">
                      加载库存中...
                    </div>
                  ) : inventoryList?.length === 0 ? (
                    <div className="p-4 border rounded-md bg-amber-50 text-amber-800 text-sm flex items-center gap-2">
                      <AlertTriangle className="h-4 w-4" />
                      该产品暂无库存，请先入库
                    </div>
                  ) : (
                    <>
                      <div className="relative">
                        <MapPin className="absolute left-2.5 top-3 h-4 w-4 text-muted-foreground flex-shrink-0" />
                        <Input
                          placeholder="搜索库位编码或仓库..."
                          value={locSearch}
                          onChange={(e) => setLocSearch(e.target.value)}
                          className="pl-8 h-11 border-primary/30 focus:border-primary"
                        />
                      </div>
                      <div className="space-y-2 max-h-72 overflow-y-auto">
                        {inventoryList?.filter((inv) => {
                          if (!locSearch.trim()) return true
                          const kwl = locSearch.trim().toLowerCase()
                          const code = `${inv.location.warehouse.code} / ${inv.location.code}`.toLowerCase()
                          const desc = (inv.location.description || '').toLowerCase()
                          const wname = (inv.location.warehouse.name || '').toLowerCase()
                          return code.includes(kwl) || desc.includes(kwl) || wname.includes(kwl)
                        }).map((inv) => {
                          const selected = locationId === inv.location_id
                          return (
                        <button
                          key={inv.id}
                          type="button"
                          onClick={() => setLocationId(inv.location_id)}
                          className={`w-full flex items-center justify-between p-3 rounded-md border text-left transition-colors ${
                            selected
                              ? 'bg-blue-100 border-blue-500 ring-2 ring-blue-400'
                              : 'bg-blue-50 border-blue-300 hover:bg-blue-100'
                          }`}
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5">
                              <Package className="h-3.5 w-3.5 text-blue-600 flex-shrink-0" />
                              <span className="font-mono text-sm font-bold text-blue-900">
                                {inv.location.warehouse.code} / {inv.location.code}
                              </span>
                              {selected && (
                                <span className="text-xs font-medium text-blue-700 bg-blue-200 px-1.5 py-0.5 rounded-full">
                                  ✓ 已选中
                                </span>
                              )}
                            </div>
                            <div className="text-xs text-muted-foreground truncate mt-0.5">
                              {inv.location.warehouse.name || inv.location.warehouse.code}
                              {inv.location.description && ` · ${inv.location.description}`}
                              {inv.batch_no && ` · 批次: ${inv.batch_no}`}
                            </div>
                          </div>
                          <div className="text-right flex-shrink-0 ml-2">
                            <div className="font-bold text-blue-900">{inv.quantity}</div>
                            <div className="text-xs text-muted-foreground">{product.unit}</div>
                          </div>
                        </button>
                          )
                        })}
                      </div>
                    </>
                  )}
                </div>

                {/* 数量 */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="qty">数量 *</Label>
                    {locationId && (
                      <span className="text-xs text-muted-foreground">
                        当前库位可用：{selectedLocationQty} {product?.unit}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <Input
                      id="qty"
                      type="number"
                      min="0"
                      step="0.01"
                      value={quantity}
                      onChange={(e) => setQuantity(e.target.value)}
                      required
                      placeholder="出库数量"
                      className={isOverStock ? 'border-red-500' : ''}
                      autoFocus={scanMode}
                    />
                    <span className="text-sm text-muted-foreground w-12">
                      {product?.unit || '个'}
                    </span>
                  </div>
                  {isOverStock && (
                    <p className="text-xs text-red-500 flex items-center gap-1">
                      <AlertTriangle className="h-3 w-3" />
                      出库数量超过当前库位库存
                    </p>
                  )}
                </div>

                {/* 批次 + 备注 */}
                <div className="space-y-2">
                  <Label htmlFor="batch">批次号</Label>
                  <Input
                    id="batch"
                    value={batchNo}
                    onChange={(e) => setBatchNo(e.target.value)}
                    placeholder="可选"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="remark">备注</Label>
                  <Textarea
                    id="remark"
                    value={remark}
                    onChange={(e) => setRemark(e.target.value)}
                    rows={2}
                    placeholder="出库备注信息"
                  />
                </div>

                <Button
                  type="submit"
                  className="w-full"
                  size="lg"
                  variant="destructive"
                  disabled={
                    !product || !locationId || !quantity || isOverStock || submitting
                  }
                >
                  <ArrowUpFromLine className="mr-2 h-4 w-4" />
                  {submitting ? '提交中...' : '确认出库'}
                </Button>
              </CardContent>
            </Card>
          </form>
        </div>

        {/* 右侧：库存分布 */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">库存分布</CardTitle>
          </CardHeader>
          <CardContent>
            {!product ? (
              <div className="text-sm text-muted-foreground text-center py-8">
                选择产品后查看分布
              </div>
            ) : invLoading ? (
              <div className="text-sm text-muted-foreground text-center py-8">
                加载中...
              </div>
            ) : inventoryList?.length === 0 ? (
              <div className="text-sm text-muted-foreground text-center py-8">
                暂无库存
              </div>
            ) : (
              <div className="space-y-2">
                {inventoryList?.map((inv) => {
                  const selected = locationId === inv.location_id
                  return (
                  <div
                    key={inv.id}
                    className={`p-2.5 rounded border text-sm ${
                      selected
                        ? 'bg-blue-100 border-blue-500'
                        : 'bg-blue-50/50 border-blue-200'
                    }`}
                  >
                    <div className="flex justify-between items-center">
                      <span className="font-mono font-bold text-blue-900">{inv.location.code}</span>
                      <span className="font-bold text-blue-900">{inv.quantity} {product.unit}</span>
                    </div>
                    <div className="text-xs text-muted-foreground truncate">
                      {inv.location.warehouse.name || inv.location.warehouse.code}
                    </div>
                  </div>
                  )
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <ProductPicker
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        onSelect={handleManualSelect}
      />

      <Scanner
        open={scannerOpen}
        onClose={() => setScannerOpen(false)}
        onScan={handleScannerResult}
      />
    </div>
  )
}
