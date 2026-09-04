import { useState, useCallback, useMemo, useEffect, useRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  ArrowUpFromLine,
  MapPin,
  ArrowLeft,
  Package,
  ImagePlus,
  ScanLine,
  Camera,
  X,
  Zap,
  Truck,
  Store,
  Check,
  Plus,
  Minus,
  Trash2,
  ShoppingCart,
  ClipboardList,
  RefreshCcw,
  Tag,
  Send,
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

type ShipMode = 'online' | 'offline'
interface OutboundLineItem {
  lineId: string
  product: Product
  locationId: string
  locationLabel: string
  locationAvailable: number
  quantity: number
  unit: string
  scanMode: boolean
}
const uid = () => Math.random().toString(36).slice(2, 9)

export default function MobileStockOut() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { user } = useAuthStore()

  const [searchParams] = useSearchParams()
  const [pickerOpen, setPickerOpen] = useState(false)
  const [scannerOpen, setScannerOpen] = useState(false)
  const [scannerMode, setScannerMode] = useState<'product' | 'tracking'>('product')

  // 首页扫码出库入口：?scan=1 → 开扫码器（扫产品）
  useEffect(() => {
    if (searchParams.get('scan') === '1') {
      setScannerMode('product')
      setScannerOpen(true)
    }
  }, [searchParams])

  // ==== 订单级 ====
  const [shipMode, setShipMode] = useState<ShipMode>('online')
  const [trackingNo, setTrackingNo] = useState('')
  const [trackingBound, setTrackingBound] = useState(false)
  const [offlineNote, setOfflineNote] = useState('')
  const [remark, setRemark] = useState('')
  const [operatorName, setOperatorName] = useState('')
  const { data: profileList = [] } = useQuery({
    queryKey: ['profiles-drop-stockout'],
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase.from('profiles').select('id, name')
      if (error) throw error
      return (data || []).filter((x: any) => !!x?.name) as { id: string; name: string }[]
    },
  })
  const operatorListOptions = useMemo(() => {
    const base = profileList.map((p) => p.name)
    if (operatorName && !base.includes(operatorName)) base.unshift(operatorName)
    return Array.from(new Set(base)).filter(Boolean)
  }, [profileList, operatorName])

  // ==== 当前加产品阶段 ====
  const [activeProduct, setActiveProduct] = useState<Product | null>(null)
  const [activeLocationId, setActiveLocationId] = useState('')
  const [activeLocSearch, setActiveLocSearch] = useState('')
  const [activeQuantity, setActiveQuantity] = useState('1')
  const [quickMode, setQuickMode] = useState(false)

  // ==== 清单 ====
  const [lines, setLines] = useState<OutboundLineItem[]>([])
  const [submitting, setSubmitting] = useState(false)

  // ============================================================
  // 查产品（barcode/sku 双匹配）
  // ============================================================
  const resolveProductByCode = useCallback(async (code: string): Promise<Product | null> => {
    const clean = code.trim()
    if (!clean) return null
    const cached = queryClient.getQueryData<Product[]>(['products', ''])
    const localMatch = cached?.find((p) => p.barcode === clean || p.sku === clean)
    if (localMatch) return localMatch
    const { data, error } = await supabase
      .from('products')
      .select('*')
      .or(`barcode.eq.${clean},sku.eq.${clean}`)
      .maybeSingle()
    if (error) { console.error('[resolveProductByCode]', error); throw error }
    return (data as Product) || null
  }, [queryClient])

  // ============================================================
  // 当前产品库存分布
  // ============================================================
  const { data: inventoryList, isLoading: invLoading } = useQuery({
    queryKey: ['product-inventory', activeProduct?.id],
    enabled: !!activeProduct,
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
        .eq('product_id', activeProduct!.id)
        .order('updated_at', { ascending: false })
      if (error) throw error
      return data as (Inventory & {
        location: Location & { warehouse: { id: string; name: string; code: string } }
      })[]
    },
  })

  const activeTotalStock = useMemo(
    () => inventoryList?.reduce((s, i) => s + Number(i.quantity), 0) || 0,
    [inventoryList],
  )
  const activeLocationQty = useMemo(
    () => inventoryList?.find((i) => i.location_id === activeLocationId) ? Number((inventoryList?.find((i) => i.location_id === activeLocationId) as any)?.quantity || 0) : 0,
    [inventoryList, activeLocationId],
  )
  useEffect(() => {
    if (inventoryList && inventoryList.length > 0 && !activeLocationId) setActiveLocationId(inventoryList[0].location_id)
    if (inventoryList && inventoryList.length === 0) setActiveLocationId('')
  }, [inventoryList, activeLocationId])

  // ============================================================
  // 加入清单
  // ============================================================
  const addProductToLines = useCallback(async (
    product: Product,
    opts?: { qty?: number; scanMode?: boolean; preferFirstLocation?: boolean; locationId?: string },
  ) => {
    const qty = opts?.qty ?? 1
    const scanMode = opts?.scanMode ?? true
    const preferFirst = opts?.preferFirstLocation ?? true

    let invList = inventoryList
    if (activeProduct?.id !== product.id || !invList) {
      const { data, error } = await supabase
        .from('inventory')
        .select(`*, location:locations ( id, code, warehouse:warehouses (id, name, code) )`)
        .eq('product_id', product.id)
        .gt('quantity', 0)
        .order('updated_at', { ascending: false })
      if (error) throw error
      invList = data as any[]
    }
    if (!invList || invList.length === 0) {
      toast.warning(`「${product.name}」无可用库存`)
      return
    }
    let target: any
    if (!preferFirst && opts?.locationId) target = invList.find((i: any) => i.location_id === opts.locationId)
    if (!target) target = invList[0]
    const loc = target.location
    const locLabel = `${loc?.warehouse?.code || ''} / ${loc?.code || '库位'}`

    setLines((prev) => {
      const trackQty = (product as any).track_qty !== false
      const found = prev.find((l) => l.product.id === product.id && l.locationId === target.location_id)
      if (found) {
        const newQty = found.quantity + qty
        if (trackQty && newQty > Number(target.quantity)) {
          toast.warning(`「${product.name}」在 ${locLabel} 仅 ${target.quantity} 件，已取最大`)
        }
        return prev.map((l) =>
          l.lineId === found.lineId ? { ...l, quantity: trackQty ? Math.min(newQty, Number(target.quantity)) : newQty } : l,
        )
      }
      const realQty = trackQty ? Math.min(qty, Number(target.quantity)) : qty
      if (trackQty && realQty < qty) toast.warning(`「${product.name}」在 ${locLabel} 仅 ${target.quantity} 件，已自动限制`)
      return [
        ...prev,
        {
          lineId: uid(),
          product,
          locationId: target.location_id,
          locationLabel: locLabel,
          locationAvailable: Number(target.quantity),
          quantity: realQty,
          unit: product.unit || '件',
          scanMode,
        },
      ]
    })
    toast.success(`已加入：${product.name} × ${qty}`, { duration: 1500 })
  }, [inventoryList, activeProduct?.id])

  // ============================================================
  // 扫产品码 → 加入清单
  // ============================================================
  const findProductByBarcode = useCallback(async (barcode: string) => {
    try {
      const p = await resolveProductByCode(barcode)
      if (!p) { toast.warning(`未找到「${barcode.trim()}」`); return }
      setActiveProduct(p)
      setActiveQuantity('1')
      await addProductToLines(p, { scanMode: true, preferFirstLocation: true })
    } catch (err: any) {
      toast.error(err.message || '识别失败')
    }
  }, [resolveProductByCode, addProductToLines])

  // 相机扫码回调（产品或单号）
  const handleScannerResult = useCallback(async (code: string) => {
    setScannerOpen(false)
    if (scannerMode === 'tracking') {
      setTrackingNo(code.trim())
      setTrackingBound(true)
      toast.success(`✅ 已绑定单号：${code.trim()}`)
      return
    }
    // product
    await findProductByBarcode(code.trim())
    // quick mode：连续扫
    if (quickMode) setTimeout(() => setScannerOpen(true), 300)
  }, [scannerMode, quickMode, findProductByBarcode])

  // 清单操作
  const updateLineQty = (lineId: string, newQty: number) => {
    setLines((prev) =>
      prev.map((l) => {
        if (l.lineId !== lineId) return l
        const v = Math.max(1, Math.floor(newQty || 1))
        if (v > l.locationAvailable) {
          toast.warning(`「${l.product.name}」库位仅 ${l.locationAvailable}`)
          return { ...l, quantity: l.locationAvailable }
        }
        return { ...l, quantity: v }
      }),
    )
  }
  const removeLine = (lineId: string) => setLines((prev) => prev.filter((l) => l.lineId !== lineId))
  const clearLines = () => {
    if (lines.length === 0) return
    if (!confirm('清空出库清单？')) return
    setLines([])
  }
  const linesSummary = useMemo(() => ({
    totalQty: lines.reduce((s, l) => s + l.quantity, 0),
    skuCount: new Set(lines.map((l) => l.product.id)).size,
  }), [lines])

  const shipModeValid = shipMode === 'offline' ? true : (trackingBound ? !!trackingNo.trim() : true)

  // ============================================================
  // 提交批量出库
  // ============================================================
  const submitOutbound = useCallback(async () => {
    if (lines.length === 0) { toast.warning('清单为空'); return }
    if (!shipModeValid) { toast.warning('单号校验失败'); return }
    for (const l of lines) {
      if (l.quantity > l.locationAvailable) {
        toast.error(`「${l.product.name}」在 ${l.locationLabel} 库存仅剩 ${l.locationAvailable}`)
        return
      }
    }
    const finalRemark = [
      shipMode === 'offline' ? `线下交易${offlineNote.trim() ? ' · ' + offlineNote.trim() : ''}` : '',
      quickMode ? '快速出库模式' : '',
      remark.trim(),
    ].filter(Boolean).join(' · ')
    const finalTrackingNo = shipMode === 'online' && trackingBound ? trackingNo.trim() || null : null
    const finalIsOffline = shipMode === 'offline'
    const finalOperatorName = operatorName.trim() || null

    setSubmitting(true)
    let successCount = 0
    let failReason = ''
    try {
      for (let i = 0; i < lines.length; i++) {
        const l = lines[i]
        const trackQty = (l.product as any).track_qty !== false
        if (trackQty && l.quantity > l.locationAvailable) {
          failReason = `「${l.product.name}」在 ${l.locationLabel} 库存仅剩 ${l.locationAvailable}`
          return toast.error(failReason)
        }
        const { error } = await supabase.rpc('stock_out', {
          p_product_id: l.product.id,
          p_location_id: trackQty ? l.locationId : (l.locationId || null),
          p_quantity: l.quantity,
          p_batch_no: null,
          p_scan_mode: l.scanMode ? 'scan' : 'manual',
          p_remark: finalRemark || null,
          p_operator_id: user?.id || null,
          p_tracking_no: finalTrackingNo,
          p_is_offline: finalIsOffline,
          p_operator_name: finalOperatorName,
        })
        if (error) { failReason = `第${i + 1}项「${l.product.name}」失败：${error.message}`; throw error }
        successCount++
      }
      const tag = shipMode === 'offline' ? '线下交易' : `单号 ${finalTrackingNo || '（无）'}`
      toast.success(`✅ 批量出库成功：${linesSummary.skuCount}种/${linesSummary.totalQty}件（${tag}）`, { duration: 3000 })
      queryClient.invalidateQueries({ queryKey: ['inventory'] })
      queryClient.invalidateQueries({ queryKey: ['product-inventory'] })
      queryClient.invalidateQueries({ queryKey: ['stock-moves'] })
      // 需求3：提交成功后清空所有状态
      setLines([])
      setActiveProduct(null)
      setActiveLocationId('')
      setActiveQuantity('1')
      setShipMode('online')
      setTrackingNo('')
      setTrackingBound(false)
      setOfflineNote('')
      setRemark('')
      setOperatorName('')
      setQuickMode(false)
    } catch (err: any) {
      console.error('[批量出库]', err)
      toast.error(failReason || `失败（已成功${successCount}/${lines.length}）`)
    } finally {
      setSubmitting(false)
    }
  }, [
    lines, linesSummary, shipModeValid, shipMode, offlineNote, quickMode, remark,
    trackingBound, trackingNo, user, queryClient, operatorName,
  ])

  // ============================================================
  // 手动选产品 → 加清单
  // ============================================================
  const handleAddActive = async () => {
    if (!activeProduct) return toast.warning('请先选产品')
    if (!activeLocationId) return toast.warning('请选库位')
    const qty = parseInt(activeQuantity, 10)
    if (!qty || qty <= 0) return toast.warning('数量必须>0')
    const inv = inventoryList?.find((i) => i.location_id === activeLocationId)
    if (!inv) return toast.warning('库位无效')
    if (qty > Number(inv.quantity)) return toast.error(`库存仅 ${inv.quantity}`)
    await addProductToLines(activeProduct, { qty, scanMode: false, preferFirstLocation: false, locationId: activeLocationId })
    setActiveProduct(null)
    setActiveLocationId('')
    setActiveQuantity('1')
    setActiveLocSearch('')
  }

  const handleManualSelect = (p: Product) => {
    setActiveProduct(p)
    setActiveLocationId('')
    setActiveQuantity('1')
  }

  const activeQtyNum = parseInt(activeQuantity, 10) || 0
  const isOverActive = activeLocationId && activeQtyNum > activeLocationQty

  return (
    <div className="flex flex-col h-full">
      {/* 顶部栏 */}
      <div className="flex items-center gap-2 px-3 py-2 border-b bg-background flex-shrink-0">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)} className="h-9 w-9 -ml-1.5">
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1 min-w-0">
          <h1 className="font-bold text-base flex items-center gap-1.5">
            <ArrowUpFromLine className="h-4 w-4 text-orange-600" />
            批量出库
          </h1>
          <p className="text-[11px] text-muted-foreground truncate">先填订单信息 → 加多个产品 → 一键提交</p>
        </div>
        <Button
          type="button"
          variant={quickMode ? 'default' : 'outline'}
          size="sm"
          onClick={() => {
            const v = !quickMode
            setQuickMode(v)
            if (v) {
              setScannerMode('product')
              setScannerOpen(true)
              toast.info('⚡ 连续扫产品码即加 1 件到清单')
            } else {
              setScannerOpen(false)
            }
          }}
          className="text-xs"
        >
          <Zap className="h-3.5 w-3.5 mr-1" />
          {quickMode ? '连续扫' : '快速扫码'}
        </Button>
      </div>

      {/* 滚动区 */}
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3 pb-32">
        {/* ============== 1. 订单信息 ============== */}
        <Card className="border-indigo-100">
          <CardContent className="p-3 space-y-3">
            <div className="flex items-center gap-1.5 text-sm font-semibold text-indigo-700">
              <ClipboardList className="h-4 w-4" /> 订单信息（整单共用）
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setShipMode('online')}
                className={`flex flex-col items-center gap-1 p-3 rounded-xl border-2 transition ${
                  shipMode === 'online'
                    ? 'bg-gradient-to-br from-blue-50 to-blue-100 border-blue-500 text-blue-800 shadow-sm'
                    : 'bg-background border-border text-muted-foreground'
                }`}
              >
                <Truck className="h-5 w-5" />
                <span className="text-xs font-bold">线上快递</span>
              </button>
              <button
                type="button"
                onClick={() => setShipMode('offline')}
                className={`flex flex-col items-center gap-1 p-3 rounded-xl border-2 transition ${
                  shipMode === 'offline'
                    ? 'bg-gradient-to-br from-emerald-50 to-emerald-100 border-emerald-500 text-emerald-800 shadow-sm'
                    : 'bg-background border-border text-muted-foreground'
                }`}
              >
                <Store className="h-5 w-5" />
                <span className="text-xs font-bold">线下交易</span>
              </button>
            </div>
            {shipMode === 'online' ? (
              <div className="space-y-2">
                <Label className="text-xs font-medium">快递单号</Label>
                <div className="flex gap-2">
                  <Input
                    value={trackingNo}
                    onChange={(e) => { setTrackingNo(e.target.value); setTrackingBound(false) }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        if (trackingNo.trim()) { setTrackingBound(true); toast.success(`✅ 已绑定：${trackingNo.trim()}`) }
                      }
                    }}
                    placeholder="输入或扫快递单号"
                    className={`h-10 ${trackingBound ? 'border-green-500 bg-green-50' : ''}`}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="h-10 w-10 flex-shrink-0"
                    onClick={() => { setScannerMode('tracking'); setScannerOpen(true) }}
                    title="相机扫单号"
                  >
                    <Camera className="h-4 w-4" />
                  </Button>
                </div>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="flex-1"
                    disabled={!trackingNo.trim()}
                    onClick={() => {
                      if (!trackingNo.trim()) return
                      setTrackingBound(true)
                      toast.success(`✅ 已绑定：${trackingNo.trim()}`)
                    }}
                  >
                    <Check className="h-3.5 w-3.5 mr-1" /> 绑定单号
                  </Button>
                  {trackingBound && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => { setTrackingBound(false); setTrackingNo('') }}
                    >
                      <X className="h-3.5 w-3.5 mr-1" /> 清除
                    </Button>
                  )}
                </div>
                {trackingBound ? (
                  <div className="text-[11px] text-green-700 bg-green-50 rounded-md px-2 py-1.5 flex items-center gap-1">
                    <Check className="h-3 w-3" />
                    已绑定：<span className="font-mono font-bold">{trackingNo.trim()}</span>
                  </div>
                ) : (
                  <div className="text-[11px] text-muted-foreground">💡 不绑定单号会记录为空（不影响出库）</div>
                )}
              </div>
            ) : (
              <div className="space-y-2">
                <Label className="text-xs font-medium">客户 / 用途（可选）</Label>
                <Input
                  value={offlineNote}
                  onChange={(e) => setOfflineNote(e.target.value)}
                  placeholder="如：张老板、某某公司、自提"
                  className="h-10"
                />
                <div className="text-[11px] text-emerald-700 bg-emerald-50 rounded-md px-2 py-1.5 flex items-center gap-1">
                  <Check className="h-3 w-3" /> 线下模式：不写入单号
                </div>
              </div>
            )}

            <div className="space-y-2 pt-2 border-t mt-1">
              <Label className="text-xs font-medium">出库人 <span className="text-muted-foreground font-normal">（可选，多人共用账号时区分）</span></Label>
              <Input
                list="mobile_operator_name_list"
                value={operatorName}
                onChange={(e) => setOperatorName(e.target.value)}
                placeholder="下拉选或手填，例：张三"
                className="h-10"
              />
              <datalist id="mobile_operator_name_list">
                {operatorListOptions.map((name) => <option key={name} value={name}>{name}</option>)}
              </datalist>
            </div>
          </CardContent>
        </Card>

        {/* ============== 2. 加产品 ============== */}
        <Card>
          <CardContent className="p-3 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-sm font-semibold text-orange-700">
                <Tag className="h-4 w-4" /> 添加出库产品
              </div>
              <div className="flex gap-1">
                <Button type="button" variant="outline" size="sm" className="text-xs h-8" onClick={() => setPickerOpen(true)}>
                  <Package className="h-3.5 w-3.5 mr-1" /> 手动选
                </Button>
                <Button type="button" variant="outline" size="sm" className="text-xs h-8" onClick={() => { setScannerMode('product'); setScannerOpen(true) }}>
                  <Camera className="h-3.5 w-3.5 mr-1" /> 扫码
                </Button>
              </div>
            </div>

            {activeProduct ? (
              <div className="flex items-center gap-2 p-2.5 rounded-lg border bg-orange-50/60 border-orange-200">
                {activeProduct.image_path ? (
                  <img src={getProductImageUrl(activeProduct.image_path)} alt="" className="h-11 w-11 rounded-md object-cover" />
                ) : (
                  <div className="h-11 w-11 rounded-md bg-muted flex items-center justify-center"><ImagePlus className="h-5 w-5 text-muted-foreground/50" /></div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold truncate">{activeProduct.name}</div>
                  <div className="text-[11px] text-muted-foreground font-mono truncate">
                    SKU {activeProduct.sku || '-'} · 总库存 {activeTotalStock}
                  </div>
                </div>
                <button type="button" onClick={() => { setActiveProduct(null); setActiveLocationId('') }} className="p-1.5 rounded-md text-muted-foreground hover:bg-orange-100">
                  <X className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                <div className="h-14 border-2 border-dashed border-muted rounded-lg flex items-center justify-center text-[11px] text-muted-foreground bg-muted/30">
                  <ScanLine className="h-3.5 w-3.5 mr-1.5 text-orange-500" /> 相机扫
                </div>
                <div className="h-14 border-2 border-dashed border-muted rounded-lg flex items-center justify-center text-[11px] text-muted-foreground bg-muted/30">
                  <Package className="h-3.5 w-3.5 mr-1.5 text-orange-500" /> 手动选
                </div>
              </div>
            )}

            {activeProduct && (
              <>
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium">选择库位 *</Label>
                  {invLoading ? (
                    <div className="h-9 border rounded-md text-xs text-muted-foreground px-3 flex items-center">加载中...</div>
                  ) : inventoryList?.length === 0 ? (
                    <div className="p-2 rounded-md bg-amber-50 text-amber-800 text-xs flex items-center gap-1.5">
                      <X className="h-3.5 w-3.5" /> 暂无库存
                    </div>
                  ) : (
                    <div className="space-y-1">
                      <div className="relative">
                        <MapPin className="absolute left-2 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                        <Input
                          placeholder="搜索库位..."
                          value={activeLocSearch}
                          onChange={(e) => setActiveLocSearch(e.target.value)}
                          className="pl-7 h-9 text-sm"
                        />
                      </div>
                      <div className="space-y-1.5 max-h-52 overflow-y-auto">
                        {inventoryList?.filter((inv) => {
                          if (!activeLocSearch.trim()) return true
                          const kw = activeLocSearch.trim().toLowerCase()
                          const a = `${inv.location.warehouse.code}/${inv.location.code}`.toLowerCase()
                          const b = (inv.location.warehouse.name || '').toLowerCase()
                          const c = (inv.location.description || '').toLowerCase()
                          return a.includes(kw) || b.includes(kw) || c.includes(kw)
                        }).map((inv) => {
                          const selected = activeLocationId === inv.location_id
                          return (
                            <button
                              key={inv.id}
                              type="button"
                              onClick={() => setActiveLocationId(inv.location_id)}
                              className={`w-full flex items-center justify-between px-2.5 py-2 rounded-lg border text-left ${
                                selected ? 'bg-blue-100 border-blue-500 ring-2 ring-blue-300' : 'bg-blue-50/60 border-blue-200'
                              }`}
                            >
                              <div>
                                <div className="font-mono text-xs font-semibold text-blue-900">
                                  {inv.location.warehouse.code}/{inv.location.code}
                                </div>
                                <div className="text-[10px] text-muted-foreground truncate">
                                  {inv.location.warehouse.name}
                                </div>
                              </div>
                              <div className="text-right">
                                <div className="text-sm font-bold text-blue-900">{inv.quantity}</div>
                                <div className="text-[10px] text-muted-foreground">{activeProduct.unit}</div>
                              </div>
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <div className="flex-1">
                    <Label className="text-xs font-medium">数量 * （可用：{activeLocationQty}）</Label>
                    <div className="flex items-center gap-1.5 mt-1 bg-white border rounded-lg p-0.5">
                      <button
                        type="button"
                        onClick={() => setActiveQuantity(String(Math.max(1, activeQtyNum - 1)))}
                        className="h-8 w-8 rounded-md hover:bg-orange-100 text-orange-700 font-bold"
                      ><Minus className="h-3 w-3 mx-auto" /></button>
                      <Input
                        type="number"
                        value={activeQuantity}
                        onChange={(e) => {
                          const n = parseInt(e.target.value, 10)
                          setActiveQuantity(isNaN(n) || n < 1 ? '' : String(n))
                        }}
                        className={`h-8 border-none shadow-none p-0 text-center text-sm font-bold ${isOverActive ? '!text-red-600' : ''}`}
                      />
                      <button
                        type="button"
                        onClick={() => setActiveQuantity(String(activeQtyNum + 1))}
                        disabled={!!activeLocationId && activeQtyNum >= activeLocationQty}
                        className="h-8 w-8 rounded-md hover:bg-orange-100 disabled:opacity-40 text-orange-700 font-bold"
                      ><Plus className="h-3 w-3 mx-auto" /></button>
                    </div>
                  </div>
                  <div className="pt-5">
                    <Button
                      type="button"
                      onClick={handleAddActive}
                      disabled={!activeLocationId || !activeQtyNum || !!isOverActive}
                      className="bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700"
                    >
                      <Plus className="h-4 w-4 mr-1" /> 加清单
                    </Button>
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* ============== 3. 出库清单 ============== */}
        <Card className="border-orange-100">
          <div className="px-3 py-2.5 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ShoppingCart className="h-4 w-4 text-orange-600" />
              <div className="text-sm font-bold">出库清单</div>
              {lines.length > 0 && (
                <span className="text-[10px] bg-orange-500 text-white rounded-full px-1.5 py-0.5 font-bold">
                  {lines.length}
                </span>
              )}
            </div>
            <button
              type="button"
              onClick={clearLines}
              disabled={lines.length === 0}
              className="text-xs text-muted-foreground hover:text-red-500 disabled:opacity-40 flex items-center gap-1"
            >
              <RefreshCcw className="h-3.5 w-3.5" /> 清空
            </button>
          </div>
          <CardContent className="p-3 pt-0">
            {lines.length === 0 ? (
              <div className="py-10 text-center text-muted-foreground border-2 border-dashed rounded-xl bg-muted/30">
                <ShoppingCart className="h-10 w-10 mx-auto mb-2 opacity-40 text-orange-500" />
                <div className="text-sm font-medium">清单为空</div>
                <div className="text-[11px] mt-0.5 opacity-80">扫产品或点"加清单"按钮</div>
              </div>
            ) : (
              <div className="space-y-2">
                {lines.map((l, idx) => (
                  <div key={l.lineId} className="p-2.5 rounded-xl border bg-gradient-to-br from-white to-orange-50/40 shadow-sm">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="h-6 w-6 flex-shrink-0 rounded-full bg-orange-500 text-white text-xs font-bold flex items-center justify-center">
                        {idx + 1}
                      </div>
                      {l.product.image_path ? (
                        <img src={getProductImageUrl(l.product.image_path)} alt="" className="h-9 w-9 rounded-md object-cover" />
                      ) : (
                        <div className="h-9 w-9 rounded-md bg-orange-100 flex items-center justify-center flex-shrink-0">
                          <Package className="h-4 w-4 text-orange-600" />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-semibold truncate">{l.product.name}</div>
                        <div className="text-[10px] text-muted-foreground font-mono truncate">
                          {l.locationLabel}
                          {l.scanMode && (
                            <span className="ml-1.5 text-indigo-600 bg-indigo-50 px-1 rounded">扫码</span>
                          )}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => removeLine(l.lineId)}
                        className="h-7 w-7 rounded-md text-red-500 hover:bg-red-50 flex-shrink-0"
                      ><Trash2 className="h-4 w-4" /></button>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1 bg-white border rounded-lg p-0.5">
                        <button
                          type="button"
                          onClick={() => updateLineQty(l.lineId, l.quantity - 1)}
                          disabled={l.quantity <= 1}
                          className="h-7 w-7 rounded-md hover:bg-orange-100 disabled:opacity-40 text-orange-700"
                        ><Minus className="h-3 w-3 mx-auto" /></button>
                        <Input
                          type="number"
                          value={l.quantity}
                          onChange={(e) => updateLineQty(l.lineId, parseInt(e.target.value, 10))}
                          className="h-7 w-14 border-none shadow-none p-0 text-center text-sm font-bold"
                        />
                        <button
                          type="button"
                          onClick={() => updateLineQty(l.lineId, l.quantity + 1)}
                          disabled={l.quantity >= l.locationAvailable}
                          className="h-7 w-7 rounded-md hover:bg-orange-100 disabled:opacity-40 text-orange-700"
                        ><Plus className="h-3 w-3 mx-auto" /></button>
                      </div>
                      <div className="text-right">
                        <div className="text-xs text-muted-foreground">
                          可用 {l.locationAvailable}
                        </div>
                        <div className="text-base font-bold text-orange-700">
                          × {l.unit}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
                {/* 汇总条 */}
                <div className="mt-3 p-3 rounded-xl bg-gradient-to-r from-orange-500 via-orange-600 to-rose-500 text-white shadow">
                  <div className="text-[11px] opacity-90 mb-0.5">
                    {shipMode === 'offline' ? '📍 线下交易' : `📦 ${trackingBound ? trackingNo.trim() : '单号未绑定'}`}
                  </div>
                  <div className="font-bold mb-2">
                    {linesSummary.skuCount} 种 · 共 {linesSummary.totalQty} 件
                  </div>
                  <Button
                    type="button"
                    onClick={submitOutbound}
                    disabled={submitting || !shipModeValid}
                    size="sm"
                    className="w-full bg-white text-orange-700 hover:bg-orange-50 font-bold shadow"
                  >
                    {submitting ? (
                      <><RefreshCcw className="h-4 w-4 mr-1.5 animate-spin" /> 出库中...</>
                    ) : (
                      <><Send className="h-4 w-4 mr-1.5" /> 确认批量出库</>
                    )}
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* 备注 */}
        <Card>
          <CardContent className="p-3 space-y-1.5">
            <Label className="text-xs font-medium">整单备注（可选）</Label>
            <Textarea
              value={remark}
              onChange={(e) => setRemark(e.target.value)}
              rows={2}
              placeholder="整单备注（赠品/原因等）"
            />
          </CardContent>
        </Card>
      </div>

      {/* 底部浮动提交（便于快速按到） */}
      {lines.length > 0 && (
        <div className="sticky bottom-0 border-t bg-background/95 backdrop-blur-sm px-3 py-2 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="flex-1 min-w-0">
              <div className="text-xs text-muted-foreground">
                {shipMode === 'offline' ? '线下交易' : `单号 ${trackingBound ? trackingNo.trim() : '（空）'}`}
              </div>
              <div className="text-sm font-bold">
                {linesSummary.skuCount} 种 / {linesSummary.totalQty} 件
              </div>
            </div>
            <Button
              type="button"
              onClick={submitOutbound}
              disabled={submitting || !shipModeValid}
              size="sm"
              className="bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 text-white font-bold shadow"
            >
              {submitting ? (
                <><RefreshCcw className="h-4 w-4 mr-1 animate-spin" /> 出库中</>
              ) : (
                <><ArrowUpFromLine className="h-4 w-4 mr-1" /> 批量出库</>
              )}
            </Button>
          </div>
        </div>
      )}

      {/* 弹窗：选产品 */}
      <ProductPicker
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        onSelect={handleManualSelect}
      />
      {/* 弹窗：扫码 */}
      {scannerOpen && (
        <Scanner
          open
          onScan={handleScannerResult}
          onClose={() => setScannerOpen(false)}
        />
      )}
    </div>
  )
}
