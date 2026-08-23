import { useState, useCallback, useMemo, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  ArrowUpFromLine,
  ArrowLeft,
  Package,
  ImagePlus,
  ScanLine,
  Camera,
  X,
  Boxes,
} from 'lucide-react'
import { supabase, getProductImageUrl } from '@/lib/supabase'
import { useAuthStore } from '@/store/auth'
import type { Product, Location, Inventory } from '@/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent } from '@/components/ui/card'
import ProductPicker from '@/components/ProductPicker'
import Scanner from '@/components/Scanner'

export default function MobileStockOut() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { user } = useAuthStore()

  const [pickerOpen, setPickerOpen] = useState(false)
  const [scannerOpen, setScannerOpen] = useState(false)
  const [product, setProduct] = useState<Product | null>(null)
  const [locationId, setLocationId] = useState('')
  const [quantity, setQuantity] = useState('')
  const [batchNo, setBatchNo] = useState('')
  const [remark, setRemark] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [scanMode, setScanMode] = useState(false)

  const findProductByBarcode = useCallback(async (barcode: string) => {
    try {
      // 1. 优先用本地缓存匹配，无网络往返直接定位
      const cached = queryClient.getQueryData<Product[]>(['products', ''])
      const localMatch = cached?.find((p) => p.barcode === barcode || p.sku === barcode)
      if (localMatch) {
        setProduct(localMatch)
        setScanMode(true)
        setLocationId('')
        setQuantity('')
        toast.success(`已识别：${localMatch.name}`)
        return
      }
      // 2. 本地未命中，走网络精确查询
      const { data, error } = await supabase
        .from('products')
        .select('*')
        .or(`barcode.eq.${barcode},sku.eq.${barcode}`)
        .maybeSingle()
      if (error) throw error
      if (data) {
        setProduct(data as Product)
        setScanMode(true)
        setLocationId('')
        setQuantity('')
        toast.success(`已识别：${(data as Product).name}`)
      } else {
        toast.warning(`未找到「${barcode}」对应的产品`)
      }
    } catch (err: any) {
      toast.error(err.message || '查询失败')
    }
  }, [queryClient])

  const { data: inventoryList, isLoading: invLoading } = useQuery({
    queryKey: ['product-inventory', product?.id],
    enabled: !!product,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('inventory')
        .select(
          `
          *,
          location:locations (
            id, code, description,
            warehouse:warehouses (id, name, code)
          )
        `,
        )
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
    () => inventoryList?.reduce((s, inv) => s + Number(inv.quantity), 0) || 0,
    [inventoryList],
  )

  const selectedLocationQty = useMemo(() => {
    const inv = inventoryList?.find((i) => i.location_id === locationId)
    return inv ? Number(inv.quantity) : 0
  }, [inventoryList, locationId])

  // 库存 > 0 时默认第一个库位
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
      if (!qty || qty <= 0) throw new Error('数量必须大于0')
      if (qty > selectedLocationQty) {
        throw new Error(`该库位仅 ${selectedLocationQty}，库存不足`)
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
      queryClient.invalidateQueries({ queryKey: ['stock-moves'] })
      queryClient.invalidateQueries({ queryKey: ['product-inventory'] })
      setQuantity('')
      setBatchNo('')
      setRemark('')
      if (!scanMode) setProduct(null)
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

  const qtyNum = parseFloat(quantity) || 0
  const isOver = !!locationId && qtyNum > selectedLocationQty

  return (
    <div className="p-4 space-y-4">
      {/* 顶部栏 */}
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)} className="h-9 w-9">
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1">
          <h1 className="font-bold text-base flex items-center gap-1.5">
            <ArrowUpFromLine className="h-4 w-4 text-amber-600" />
            出库
          </h1>
          <p className="text-xs text-muted-foreground">扫码或手动选择产品出库</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-3">
        <Card>
          <CardContent className="p-4 space-y-3">
            {/* 选产品 */}
            <div className="space-y-2">
              <Label>产品 *</Label>
              {product ? (
                <div className="flex items-center gap-3 p-3 border rounded-md">
                  {product.image_path ? (
                    <img
                      src={getProductImageUrl(product.image_path)}
                      alt={product.name}
                      className="h-12 w-12 rounded object-cover flex-shrink-0"
                    />
                  ) : (
                    <div className="h-12 w-12 rounded bg-muted flex items-center justify-center flex-shrink-0">
                      <ImagePlus className="h-5 w-5 text-muted-foreground/50" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm truncate">{product.name}</div>
                    <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
                      <Boxes className="h-3 w-3" />
                      总库存 {totalStock}
                      {product.unit && ` ${product.unit}`}
                    </div>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => {
                      setProduct(null)
                      setScanMode(false)
                      setLocationId('')
                    }}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    className="h-16 border-dashed flex-col gap-1"
                    onClick={() => setPickerOpen(true)}
                  >
                    <Package className="h-4 w-4" />
                    <span className="text-xs">手动选择</span>
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="h-16 border-dashed flex-col gap-1"
                    onClick={() => setScannerOpen(true)}
                  >
                    <Camera className="h-4 w-4" />
                    <span className="text-xs">扫码识别</span>
                  </Button>
                </div>
              )}
            </div>

            {/* 库位（带库存显示） */}
            <div className="space-y-2">
              <Label>出库库位 *</Label>
              {invLoading && product ? (
                <div className="h-10 border border-input rounded-md flex items-center px-3 text-sm text-muted-foreground">
                  加载库存中...
                </div>
              ) : inventoryList && inventoryList.length === 0 ? (
                <div className="h-10 border border-destructive/50 bg-destructive/5 rounded-md flex items-center px-3 text-sm text-destructive">
                  该产品当前无库存，无法出库
                </div>
              ) : (
                <select
                  value={locationId}
                  onChange={(e) => setLocationId(e.target.value)}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  disabled={!product || inventoryList?.length === 0}
                  required
                >
                  <option value="">请选择库位</option>
                  {inventoryList?.map((inv) => (
                    <option key={inv.location_id} value={inv.location_id}>
                      {inv.location?.warehouse?.name || ''} / {inv.location?.code} — {inv.quantity}
                      {product?.unit && ` ${product.unit}`}
                      {inv.location?.description && ` · ${inv.location.description}`}
                    </option>
                  ))}
                </select>
              )}
              {locationId && !isOver && selectedLocationQty > 0 && (
                <div className="text-xs text-muted-foreground -mt-1">
                  选中库位可用：{selectedLocationQty}
                  {product?.unit && ` ${product.unit}`}
                </div>
              )}
            </div>

            {/* 数量 */}
            <div className="space-y-2">
              <Label htmlFor="o-qty">出库数量 *</Label>
              <Input
                id="o-qty"
                type="number"
                min="0"
                step="1"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                placeholder={`请输入数量（最多 ${selectedLocationQty || 0}）`}
                className={isOver ? 'border-destructive' : ''}
                required
              />
              {isOver && (
                <div className="text-xs text-destructive -mt-1">
                  数量超过库位可用库存（{selectedLocationQty}）
                </div>
              )}
            </div>

            {/* 批次 */}
            <div className="space-y-2">
              <Label htmlFor="o-batch">批次号（选填）</Label>
              <Input
                id="o-batch"
                value={batchNo}
                onChange={(e) => setBatchNo(e.target.value)}
                placeholder="如 20260801"
              />
            </div>

            {/* 备注 */}
            <div className="space-y-2">
              <Label htmlFor="o-rmk">备注（选填）</Label>
              <Textarea
                id="o-rmk"
                rows={2}
                value={remark}
                onChange={(e) => setRemark(e.target.value)}
                placeholder="其他信息..."
              />
            </div>
          </CardContent>
        </Card>

        <Button
          type="submit"
          className="w-full h-11"
          disabled={submitting || isOver || totalStock === 0}
        >
          <ArrowUpFromLine className="mr-2 h-4 w-4" />
          {submitting ? '提交中...' : '确认出库'}
          {scanMode && (
            <span className="ml-1.5 inline-flex items-center gap-0.5 text-xs bg-white/20 px-1.5 py-0.5 rounded">
              <ScanLine className="h-3 w-3" />
              扫码
            </span>
          )}
        </Button>
      </form>

      <ProductPicker
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        onSelect={(p) => {
          setProduct(p)
          setScanMode(false)
          setLocationId('')
          setQuantity('')
        }}
      />
      <Scanner open={scannerOpen} onClose={() => setScannerOpen(false)} onScan={findProductByBarcode} />
    </div>
  )
}
