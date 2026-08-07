import { useState, useCallback, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  ArrowDownToLine,
  ArrowLeft,
  Package,
  ImagePlus,
  ScanLine,
  Camera,
  X,
} from 'lucide-react'
import { supabase, getProductImageUrl } from '@/lib/supabase'
import { useAuthStore } from '@/store/auth'
import type { Product, Location } from '@/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent } from '@/components/ui/card'
import ProductPicker from '@/components/ProductPicker'
import Scanner from '@/components/Scanner'

export default function MobileStockIn() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { user } = useAuthStore()

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

  const findProductByBarcode = useCallback(async (barcode: string) => {
    try {
      const { data, error } = await supabase
        .from('products')
        .select('*')
        .or(`barcode.eq.${barcode},sku.eq.${barcode}`)
        .maybeSingle()
      if (error) throw error
      if (data) {
        setProduct(data as Product)
        setScanMode(true)
        toast.success(`已识别：${(data as Product).name}`)
      } else {
        toast.warning(`未找到「${barcode}」对应的产品`)
      }
    } catch (err: any) {
      toast.error(err.message || '查询失败')
    }
  }, [])

  const { data: warehouses } = useQuery({
    queryKey: ['warehouses'],
    queryFn: async () => {
      const { data, error } = await supabase.from('warehouses').select('*').order('name')
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

  // 预填：默认选中置顶/第一个仓库
  useEffect(() => {
    if (warehouses && warehouses.length > 0 && !warehouseId) {
      setWarehouseId(warehouses[0].id)
    }
  }, [warehouses, warehouseId])

  // 预设最近一次库位
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
        if (loc?.warehouse_id) setWarehouseId(loc.warehouse_id)
        setPendingLocationId(targetLocId || '')
      } catch {
        /* ignore */
      }
    })()
    return () => {
      cancelled = true
    }
  }, [product?.id])

  useEffect(() => {
    if (!pendingLocationId || !locations) return
    if (locations.some((l) => l.id === pendingLocationId)) {
      setLocationId(pendingLocationId)
      setPendingLocationId('')
    }
  }, [pendingLocationId, locations])

  const stockInMutation = useMutation({
    mutationFn: async () => {
      const qty = parseFloat(quantity)
      if (!product) throw new Error('请选择产品')
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
      toast.success('入库成功')
      queryClient.invalidateQueries({ queryKey: ['inventory'] })
      queryClient.invalidateQueries({ queryKey: ['stock-moves'] })
      queryClient.invalidateQueries({ queryKey: ['product-inventory'] })
      setQuantity('')
      setBatchNo('')
      setRemark('')
      if (!scanMode) setProduct(null)
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

  return (
    <div className="p-4 space-y-4">
      {/* 顶部栏 */}
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)} className="h-9 w-9">
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1">
          <h1 className="font-bold text-base flex items-center gap-1.5">
            <ArrowDownToLine className="h-4 w-4 text-emerald-600" />
            入库
          </h1>
          <p className="text-xs text-muted-foreground">扫码或手动选择产品入库</p>
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
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {product.sku && `SKU: ${product.sku}`}
                      {product.barcode && ` · 条码: ${product.barcode}`}
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

            {/* 仓库 */}
            <div className="space-y-2">
              <Label htmlFor="m-wh">仓库 *</Label>
              <select
                id="m-wh"
                value={warehouseId}
                onChange={(e) => {
                  setWarehouseId(e.target.value)
                  setLocationId('')
                }}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                required
              >
                <option value="">请选择仓库</option>
                {warehouses?.map((w: any) => (
                  <option key={w.id} value={w.id}>
                    {w.name || w.code}
                  </option>
                ))}
              </select>
            </div>

            {/* 库位 */}
            <div className="space-y-2">
              <Label htmlFor="m-loc">库位 *</Label>
              <select
                id="m-loc"
                value={locationId}
                onChange={(e) => setLocationId(e.target.value)}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                disabled={!warehouseId}
                required
              >
                <option value="">请选择库位</option>
                {locations?.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.code}
                    {l.description && ` · ${l.description}`}
                  </option>
                ))}
              </select>
            </div>

            {/* 数量 */}
            <div className="space-y-2">
              <Label htmlFor="m-qty">数量 *</Label>
              <Input
                id="m-qty"
                type="number"
                min="0"
                step="1"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                placeholder="请输入入库数量"
                required
              />
            </div>

            {/* 批次 */}
            <div className="space-y-2">
              <Label htmlFor="m-batch">批次号（选填）</Label>
              <Input
                id="m-batch"
                value={batchNo}
                onChange={(e) => setBatchNo(e.target.value)}
                placeholder="如 20260801"
              />
            </div>

            {/* 备注 */}
            <div className="space-y-2">
              <Label htmlFor="m-rmk">备注（选填）</Label>
              <Textarea
                id="m-rmk"
                rows={2}
                value={remark}
                onChange={(e) => setRemark(e.target.value)}
                placeholder="其他信息..."
              />
            </div>
          </CardContent>
        </Card>

        <Button type="submit" className="w-full h-11" disabled={submitting}>
          <ArrowDownToLine className="mr-2 h-4 w-4" />
          {submitting ? '提交中...' : '确认入库'}
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
        }}
      />
      <Scanner open={scannerOpen} onClose={() => setScannerOpen(false)} onScan={findProductByBarcode} />
    </div>
  )
}
