import { useState, useCallback, useEffect, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  ArrowDownToLine,
  Package,
  MapPin,
  ImagePlus,
  ScanLine,
  Camera,
  X,
  AlertCircle,
} from 'lucide-react'
import { supabase, getProductImageUrl } from '@/lib/supabase'
import { useAuthStore } from '@/store/auth'
import { useBarcodeGun } from '@/hooks/useBarcodeGun'
import { useDevice } from '@/hooks/useDevice'
import type { Product, Location } from '@/types'
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

export default function StockInPage() {
  const queryClient = useQueryClient()
  const { user } = useAuthStore()
  const { isMobile } = useDevice()

  const [pickerOpen, setPickerOpen] = useState(false)
  const [scannerOpen, setScannerOpen] = useState(false)
  const [product, setProduct] = useState<Product | null>(null)
  const [warehouseId, setWarehouseId] = useState('')
  const [locationId, setLocationId] = useState('')
  const [quantity, setQuantity] = useState('')
  const [batchNo, setBatchNo] = useState('')
  const [remark, setRemark] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [scanMode, setScanMode] = useState(false)
  const [searchingBarcode, setSearchingBarcode] = useState(false)
  const [locSearch, setLocSearch] = useState('')

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

  const { data: warehouses } = useQuery({
    queryKey: ['warehouses'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('warehouses')
        .select('*')
        .order('name')
      if (error) throw error
      return data
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

  // 查询该产品在所有库位的现有库存（用于标注哪些库位已有该产品）
  const { data: productStocks } = useQuery({
    queryKey: ['product-stock-locs', product?.id],
    enabled: !!product,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('inventory')
        .select('location_id, quantity')
        .eq('product_id', product!.id)
        .gt('quantity', 0)
      if (error) throw error
      return data as { location_id: string; quantity: number }[]
    },
  })

  // 库位列表按搜索词过滤
  const filteredLocations = useMemo(() => {
    if (!locations) return []
    const kwl = locSearch.trim().toLowerCase()
    if (!kwl) return locations
    return locations.filter(
      (l) =>
        l.code.toLowerCase().includes(kwl) ||
        (l.description && l.description.toLowerCase().includes(kwl)),
    )
  }, [locations, locSearch])

  // 当前选中的库位对象
  const selectedLocation = useMemo(
    () => locations?.find((l) => l.id === locationId) || null,
    [locations, locationId],
  )

  const stockInMutation = useMutation({
    mutationFn: async () => {
      const qty = parseFloat(quantity)
      if (!product) throw new Error('请选择产品')
      if (!locationId) throw new Error('请选择库位')
      if (!qty || qty <= 0) throw new Error('数量必须大于 0')

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
      toast.success('入库成功')
      queryClient.invalidateQueries({ queryKey: ['inventory'] })
      queryClient.invalidateQueries({ queryKey: ['stock-moves'] })
      queryClient.invalidateQueries({ queryKey: ['product-inventory'] })
      setQuantity('')
      setBatchNo('')
      setRemark('')
      // 扫码模式下保留产品，方便连续扫码入库
      if (scanMode) {
        setQuantity('')
      }
    },
    onError: (err: any) => toast.error(err.message || '入库失败'),
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    try {
      await stockInMutation.mutateAsync()
    } finally {
      setSubmitting(false)
    }
  }

  const handleManualSelect = (p: Product) => {
    setProduct(p)
    setScanMode(false)
  }

  const handleScannerResult = (code: string) => {
    setScannerOpen(false)
    findProductByBarcode(code)
  }

  // 产品变化时：查询该产品最近一次 inventory 记录，保存目标库位到状态
  const [pendingLocationId, setPendingLocationId] = useState<string>('')

  useEffect(() => {
    let cancelled = false
    if (!product) {
      setPendingLocationId('')
      return
    }
    ;(async () => {
      try {
        const { data, error } = await supabase
          .from('inventory')
          .select(`location_id, locations ( warehouse_id )`)
          .eq('product_id', product.id)
          .order('updated_at', { ascending: false })
          .limit(1)
          .maybeSingle()
        if (error) throw error
        if (!data || cancelled) return
        const loc: any = (data as any)?.locations
        const targetLocId = (data as any)?.location_id as string | undefined
        if (loc?.warehouse_id) {
          setWarehouseId(loc.warehouse_id)
        }
        setPendingLocationId(targetLocId || '')
      } catch {
        // 忽略预设失败
      }
    })()
    return () => {
      cancelled = true
    }
  }, [product?.id])

  // 仓库变化、locations 拉取完成后，选中保存的库位（只在匹配的仓库里）
  useEffect(() => {
    if (!pendingLocationId || !locations) return
    if (locations.some((l) => l.id === pendingLocationId)) {
      setLocationId(pendingLocationId)
      setPendingLocationId('')
    }
  }, [pendingLocationId, locations])

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">入库</h2>
          <p className="text-sm text-muted-foreground">
            手动入库或扫码入库
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
                  <ArrowDownToLine className="h-5 w-5 text-green-600" />
                  入库信息
                  {scanMode && (
                    <span className="inline-flex items-center gap-1 text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">
                      <ScanLine className="h-3 w-3" />
                      扫码模式
                    </span>
                  )}
                </CardTitle>
                <CardDescription>选择产品（手动或扫码），填写入库数量</CardDescription>
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
                          {product.spec && ` · ${product.spec}`}
                        </div>
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

                {/* 仓库 + 库位 */}
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="warehouse">仓库 *</Label>
                    <select
                      id="warehouse"
                      value={warehouseId}
                      onChange={(e) => {
                        setWarehouseId(e.target.value)
                        setLocationId('')
                      }}
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    >
                      <option value="">请选择仓库</option>
                      {warehouses?.map((w) => (
                        <option key={w.id} value={w.id}>
                          {w.name || w.code}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="location">库位 *</Label>
                    {selectedLocation && (
                      <div className="flex items-center gap-2 px-3 py-2 rounded-md border border-green-300 bg-green-50 text-sm">
                        <MapPin className="h-4 w-4 text-green-600 flex-shrink-0" />
                        <span className="font-medium text-green-800">{selectedLocation.code}</span>
                        {selectedLocation.description && (
                          <span className="text-green-600 text-xs">· {selectedLocation.description}</span>
                        )}
                        <button
                          type="button"
                          onClick={() => setLocationId('')}
                          className="ml-auto text-green-600 hover:text-green-800"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    )}
                    {!selectedLocation && (
                      <>
                        <Input
                          id="location"
                          placeholder="搜索库位编码或描述..."
                          value={locSearch}
                          onChange={(e) => setLocSearch(e.target.value)}
                          disabled={!warehouseId}
                          className="disabled:opacity-50"
                        />
                        {filteredLocations.length > 0 && (
                          <div className="max-h-48 overflow-y-auto rounded-md border border-input divide-y">
                            {filteredLocations.map((l) => {
                              const stock = productStocks?.find((s) => s.location_id === l.id)
                              return (
                                <button
                                  key={l.id}
                                  type="button"
                                  onClick={() => {
                                    setLocationId(l.id)
                                    setLocSearch('')
                                  }}
                                  className={`flex w-full items-center justify-between px-3 py-2 text-sm hover:bg-accent transition-colors ${
                                    stock ? 'bg-blue-50/50' : ''
                                  }`}
                                >
                                  <div className="flex items-center gap-2">
                                    <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
                                    <span className="font-medium">{l.code}</span>
                                    {l.description && (
                                      <span className="text-xs text-muted-foreground truncate max-w-32">
                                        {l.description}
                                      </span>
                                    )}
                                  </div>
                                  {stock && (
                                    <span className="text-xs text-blue-600 bg-blue-100 px-1.5 py-0.5 rounded flex-shrink-0">
                                      现有 {stock.quantity}
                                    </span>
                                  )}
                                </button>
                              )
                            })}
                          </div>
                        )}
                        {warehouseId && filteredLocations.length === 0 && (
                          <p className="text-xs text-muted-foreground text-center py-2">
                            {locSearch ? '无匹配库位' : '该仓库暂无库位'}
                          </p>
                        )}
                      </>
                    )}
                  </div>
                </div>

                {/* 数量 + 批次 */}
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="qty">数量 *</Label>
                    <div className="flex items-center gap-2">
                      <Input
                        id="qty"
                        type="number"
                        min="0"
                        step="0.01"
                        value={quantity}
                        onChange={(e) => setQuantity(e.target.value)}
                        required
                        placeholder="入库数量"
                        autoFocus={scanMode}
                      />
                      <span className="text-sm text-muted-foreground w-12">
                        {product?.unit || '个'}
                      </span>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="batch">批次号</Label>
                    <Input
                      id="batch"
                      value={batchNo}
                      onChange={(e) => setBatchNo(e.target.value)}
                      placeholder="可选"
                    />
                  </div>
                </div>

                {/* 备注 */}
                <div className="space-y-2">
                  <Label htmlFor="remark">备注</Label>
                  <Textarea
                    id="remark"
                    value={remark}
                    onChange={(e) => setRemark(e.target.value)}
                    rows={2}
                    placeholder="入库备注信息"
                  />
                </div>

                <Button
                  type="submit"
                  className="w-full"
                  size="lg"
                  disabled={!product || !locationId || !quantity || submitting}
                >
                  <ArrowDownToLine className="mr-2 h-4 w-4" />
                  {submitting ? '提交中...' : '确认入库'}
                </Button>
              </CardContent>
            </Card>
          </form>
        </div>

        {/* 右侧：操作提示 */}
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <MapPin className="h-4 w-4" />
                操作提示
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground space-y-3">
              <p>1. 选择要入库的产品（手动或扫码）</p>
              <p>2. 选择仓库和具体库位</p>
              <p>3. 输入入库数量和批次（可选）</p>
              <p>4. 点击确认入库完成操作</p>
              <div className="pt-3 border-t">
                <p className="text-xs">
                  系统将自动更新库存并记录操作日志
                </p>
              </div>
            </CardContent>
          </Card>

          {/* 扫码枪提示（仅电脑端） */}
          {!isMobile && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <ScanLine className="h-4 w-4" />
                  扫码枪已就绪
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground space-y-2">
                <p>本页面已自动监听扫码枪输入</p>
                <p>直接使用扫码枪扫描产品条形码即可</p>
                <div className="flex items-start gap-2 pt-2 text-xs text-amber-600 bg-amber-50 p-2 rounded">
                  <AlertCircle className="h-3 w-3 mt-0.5 flex-shrink-0" />
                  <span>请保持光标不在输入框内，否则扫码内容会输入到框中</span>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
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
