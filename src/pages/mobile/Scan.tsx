import React, { useState, useCallback, useEffect } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { ArrowDownToLine, ArrowUpFromLine, ScanLine, X, ImagePlus, Keyboard } from 'lucide-react'
import { supabase, getProductImageUrl } from '@/lib/supabase'
import { useAuthStore } from '@/store/auth'
import { useScanner } from '@/hooks/useScanner'
import type { Product, Inventory, Location } from '@/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent } from '@/components/ui/card'

export default function MobileScan() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { user } = useAuthStore()

  const initialMode = (searchParams.get('type') as 'in' | 'out') || 'in'
  const [mode, setMode] = useState<'in' | 'out'>(initialMode)
  const [product, setProduct] = useState<Product | null>(null)
  const [locationId, setLocationId] = useState('')
  const [quantity, setQuantity] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [showManualInput, setShowManualInput] = useState(false)
  const [manualBarcode, setManualBarcode] = useState('')

  // 查询库存（出库模式用）
  const { data: inventoryList } = useQuery({
    queryKey: ['product-inventory', product?.id],
    enabled: !!product && mode === 'out',
    queryFn: async () => {
      const { data, error } = await supabase
        .from('inventory')
        .select(`
          *,
          location:locations (
            id, code, description,
            warehouse:warehouses (id, name, code)
          )
        `)
        .eq('product_id', product!.id)
        .gt('quantity', 0)
        .order('updated_at', { ascending: false })
      if (error) throw error
      return data as unknown as (Inventory & {
        location: Location & { warehouse: { id: string; name: string; code: string } }
      })[]
    },
  })

  // 查询所有仓库和库位（入库模式用）
  const { data: allLocations } = useQuery({
    queryKey: ['all-locations'],
    enabled: !!product && mode === 'in',
    queryFn: async () => {
      const { data, error } = await supabase
        .from('locations')
        .select(`
          id, code, description,
          warehouse:warehouses (id, name, code)
        `)
        .order('code')
      if (error) throw error
      return data as unknown as (Location & { warehouse: { id: string; name: string; code: string } })[]
    },
  })

  // 通过条形码或SKU查找产品
  const findProductByBarcode = useCallback(async (barcode: string) => {
    try {
      // 先按条形码查，没查到再按 SKU 查
      let { data, error } = await supabase
        .from('products')
        .select('*')
        .eq('barcode', barcode)
        .maybeSingle()
      if (error) throw error

      if (!data) {
        const res = await supabase
          .from('products')
          .select('*')
          .eq('sku', barcode)
          .maybeSingle()
        if (res.error) throw res.error
        data = res.data
      }

      if (data) {
        setProduct(data as Product)
        setLocationId('')
        setQuantity('')
        toast.success(`已识别：${(data as Product).name}`)
        if (navigator.vibrate) navigator.vibrate(200)
      } else {
        toast.warning(`未找到条形码或编号「${barcode}」`)
      }
    } catch (err: any) {
      toast.error(err.message || '查询失败')
    }
  }, [])

  // 摄像头扫码
  const { videoRef, scanning, error, start, stop } = useScanner({
    onResult: (code) => {
      findProductByBarcode(code)
    },
  })

  // 默认启动扫码
  useEffect(() => {
    start()
    return () => stop()
  }, [])

  // 入库模式：选中产品后，预设其最近使用的库位
  useEffect(() => {
    let cancelled = false
    if (!product || mode !== 'in') return
    ;(async () => {
      try {
        const { data, error } = await supabase
          .from('inventory')
          .select('location_id')
          .eq('product_id', product.id)
          .order('updated_at', { ascending: false })
          .limit(1)
          .maybeSingle()
        if (error) throw error
        if (!data || cancelled) return
        const locId = (data as any)?.location_id as string | undefined
        if (locId) {
          // 先直接设值，等 allLocations 拉取好后再在下一个 effect 校验匹配
          setLocationId(locId)
        }
      } catch {
        // 忽略预设失败
      }
    })()
    return () => {
      cancelled = true
    }
  }, [product?.id, mode])

  // 入库模式：allLocations 拉取完成后，如果已存的 locationId 不在列表里则清掉
  useEffect(() => {
    if (mode !== 'in' || !allLocations) return
    if (!locationId) return
    const exists = allLocations.some((l: any) => l.id === locationId)
    if (!exists) setLocationId('')
  }, [allLocations, locationId, mode])

  const stockMoveMutation = useMutation({
    mutationFn: async () => {
      const qty = parseFloat(quantity)
      if (!product) throw new Error('请先扫码选择产品')
      if (!locationId) throw new Error('请选择库位')
      if (!qty || qty <= 0) throw new Error('数量必须大于 0')

      const rpcName = mode === 'in' ? 'stock_in' : 'stock_out'
      const { error } = await supabase.rpc(rpcName, {
        p_product_id: product.id,
        p_location_id: locationId,
        p_quantity: qty,
        p_batch_no: null,
        p_scan_mode: 'scan',
        p_remark: null,
        p_operator_id: user?.id || null,
      })
      if (error) throw error
    },
    onSuccess: () => {
      toast.success(mode === 'in' ? '入库成功' : '出库成功')
      queryClient.invalidateQueries({ queryKey: ['inventory'] })
      queryClient.invalidateQueries({ queryKey: ['stock-moves'] })
      queryClient.invalidateQueries({ queryKey: ['product-inventory'] })
      queryClient.invalidateQueries({ queryKey: ['mobile-stats'] })
      // 清空状态，准备下一次扫码
      setProduct(null)
      setLocationId('')
      setQuantity('')
      // 重新启动扫码
      setTimeout(() => start(), 500)
    },
    onError: (err: any) => toast.error(err.message || '操作失败'),
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    try {
      await stockMoveMutation.mutateAsync()
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="p-4 space-y-4">
      {/* 模式切换 */}
      <div className="flex items-center gap-1 p-1 bg-muted rounded-lg">
        <button
          onClick={() => {
            setMode('in')
            setProduct(null)
            setLocationId('')
          }}
          className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-md text-sm font-medium transition-colors ${
            mode === 'in' ? 'bg-background shadow-sm text-green-600' : 'text-muted-foreground'
          }`}
        >
          <ArrowDownToLine className="h-4 w-4" />
          入库
        </button>
        <button
          onClick={() => {
            setMode('out')
            setProduct(null)
            setLocationId('')
          }}
          className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-md text-sm font-medium transition-colors ${
            mode === 'out' ? 'bg-background shadow-sm text-orange-600' : 'text-muted-foreground'
          }`}
        >
          <ArrowUpFromLine className="h-4 w-4" />
          出库
        </button>
      </div>

      {/* 扫码区域 */}
      {!product && (
        <div className="space-y-3">
          <div className="relative aspect-square w-full overflow-hidden rounded-lg bg-black">
            <video
              ref={videoRef}
              className="h-full w-full object-cover"
              playsInline
              muted
            />
            {/* 扫描框 */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="relative w-3/4 h-2/5 border-2 border-white/80 rounded-lg">
                <div className="absolute -top-1 -left-1 w-6 h-6 border-t-4 border-l-4 border-green-400 rounded-tl-lg" />
                <div className="absolute -top-1 -right-1 w-6 h-6 border-t-4 border-r-4 border-green-400 rounded-tr-lg" />
                <div className="absolute -bottom-1 -left-1 w-6 h-6 border-b-4 border-l-4 border-green-400 rounded-bl-lg" />
                <div className="absolute -bottom-1 -right-1 w-6 h-6 border-b-4 border-r-4 border-green-400 rounded-br-lg" />
                {scanning && (
                  <div
                    className="absolute left-0 right-0 h-0.5 bg-green-400"
                    style={{ animation: 'scanner-line 2s ease-in-out infinite' }}
                  />
                )}
              </div>
            </div>
            {error && (
              <div className="absolute inset-0 flex items-center justify-center p-6 bg-black/85">
                <div className="text-center text-white space-y-3">
                  <p className="text-sm whitespace-pre-line leading-relaxed">{error}</p>
                  <div className="flex flex-col gap-2 items-center">
                    <Button size="sm" onClick={start} variant="secondary">
                      重试扫码
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setShowManualInput(true)}
                      className="bg-white/10 text-white border-white/30 hover:bg-white/20"
                    >
                      <Keyboard className="h-3.5 w-3.5 mr-1" />
                      手动输入条形码
                    </Button>
                  </div>
                </div>
              </div>
            )}
            <div className="absolute top-3 left-3 flex items-center gap-1.5 text-white/90 text-xs bg-black/50 px-2 py-1 rounded">
              <ScanLine className={`h-3 w-3 ${scanning ? 'animate-pulse text-green-400' : ''}`} />
              {scanning ? '扫描中...' : '准备中...'}
            </div>
          </div>

          {/* 手动输入入口 */}
          {!showManualInput ? (
            <button
              type="button"
              onClick={() => setShowManualInput(true)}
              className="w-full flex items-center justify-center gap-2 p-3 rounded-lg border border-dashed border-muted-foreground/30 text-muted-foreground hover:bg-muted/40 hover:text-foreground transition-colors text-sm"
            >
              <Keyboard className="h-4 w-4" />
              扫不出来？手动输入条形码
            </button>
          ) : (
            <Card>
              <CardContent className="p-3 space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-medium">输入条形码 / 编号</Label>
                  <button
                    type="button"
                    onClick={() => setShowManualInput(false)}
                    className="text-xs text-muted-foreground hover:text-foreground"
                  >
                    返回扫码
                  </button>
                </div>
                <div className="flex gap-2">
                  <Input
                    autoFocus
                    value={manualBarcode}
                    onChange={(e) => setManualBarcode(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && manualBarcode.trim()) {
                        findProductByBarcode(manualBarcode.trim())
                        setManualBarcode('')
                      }
                    }}
                    placeholder="条形码或产品编号"
                    className="flex-1"
                  />
                  <Button
                    type="button"
                    onClick={() => {
                      if (manualBarcode.trim()) {
                        findProductByBarcode(manualBarcode.trim())
                        setManualBarcode('')
                      }
                    }}
                    disabled={!manualBarcode.trim()}
                  >
                    查找
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  提示：可以输入产品的条形码，或产品编号（SKU）进行查找
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* 产品信息 + 操作表单 */}
      {product && (
        <form onSubmit={handleSubmit} className="space-y-4">
          <Card>
            <CardContent className="p-3">
              <div className="flex items-center gap-3">
                {product.image_path ? (
                  <img
                    src={getProductImageUrl(product.image_path)}
                    alt={product.name}
                    className="h-14 w-14 rounded-lg object-cover"
                  />
                ) : (
                  <div className="h-14 w-14 rounded-lg bg-muted flex items-center justify-center">
                    <ImagePlus className="h-6 w-6 text-muted-foreground/50" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="font-medium">{product.name}</div>
                  <div className="text-xs text-muted-foreground">
                    SKU: {product.sku || '-'}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {product.barcode}
                  </div>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => {
                    setProduct(null)
                    setLocationId('')
                    setQuantity('')
                    setTimeout(() => start(), 300)
                  }}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* 库位选择 */}
          <div className="space-y-2">
            <Label>选择库位 *</Label>
            {mode === 'out' && inventoryList?.length === 0 ? (
              <div className="p-3 border rounded-md bg-amber-50 text-amber-800 text-sm">
                该产品暂无库存
              </div>
            ) : (
              <div className="space-y-1.5 max-h-48 overflow-y-auto">
                {(mode === 'out' ? inventoryList : allLocations)?.map((row: any) => {
                  // 入库：allLocations = { id, code, description, warehouse }
                  // 出库：inventoryList = { quantity, location: { id, code, ..., warehouse } }
                  const isOut = mode === 'out'
                  const loc: any = isOut ? row.location : row
                  const wh: any = loc?.warehouse || {}
                  const locId: string = loc?.id
                  const qty = isOut ? row.quantity : null
                  return (
                    <button
                      key={locId}
                      type="button"
                      onClick={() => setLocationId(locId)}
                      className={`w-full flex items-center justify-between p-2.5 rounded-md border text-left transition-colors ${
                        locationId === locId
                          ? 'bg-primary/10 ring-1 ring-primary border-primary/30'
                          : 'hover:bg-muted'
                      }`}
                    >
                      <div>
                        <div className="font-mono text-sm font-medium">
                          {wh.code || wh.name || '仓库'} / {loc.code}
                        </div>
                        {wh.name && wh.name !== wh.code && (
                          <div className="text-xs text-muted-foreground">{wh.name}</div>
                        )}
                        {loc.description && (
                          <div className="text-xs text-muted-foreground">{loc.description}</div>
                        )}
                      </div>
                      {isOut && (
                        <div className="text-right">
                          <div className="font-bold text-sm">{qty}</div>
                          <div className="text-xs text-muted-foreground">{product.unit}</div>
                        </div>
                      )}
                    </button>
                  )
                })}
              </div>
            )}
          </div>

          {/* 数量 */}
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
                placeholder="输入数量"
                autoFocus
                className="text-lg"
              />
              <span className="text-sm text-muted-foreground whitespace-nowrap">
                {product.unit}
              </span>
            </div>
          </div>

          <Button
            type="submit"
            className="w-full"
            size="lg"
            variant={mode === 'in' ? 'default' : 'destructive'}
            disabled={!product || !locationId || !quantity || submitting}
          >
            {submitting ? '提交中...' : mode === 'in' ? '确认入库' : '确认出库'}
          </Button>
        </form>
      )}

      <style>{`
        @keyframes scanner-line {
          0% { top: 0; }
          50% { top: calc(100% - 2px); }
          100% { top: 0; }
        }
      `}</style>
    </div>
  )
}
