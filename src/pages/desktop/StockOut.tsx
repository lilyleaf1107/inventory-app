import { useState, useMemo, useCallback, useEffect, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  ArrowUpFromLine,
  MapPin,
  Package,
  AlertTriangle,
  ImagePlus,
  ScanLine,
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

type ShipMode = 'online' | 'offline'

interface OutboundLineItem {
  /** 清单行 id（本地生成，防重复产品） */
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

export default function StockOutPage() {
  const queryClient = useQueryClient()
  const { user } = useAuthStore()
  const { isMobile } = useDevice()

  // ========== 出库方式：一次性填，绑定到整张订单 ==========
  const [shipMode, setShipMode] = useState<ShipMode>('online')
  const [trackingNo, setTrackingNo] = useState('')
  const [trackingBound, setTrackingBound] = useState(false)
  const [offlineNote, setOfflineNote] = useState('')
  const [remark, setRemark] = useState('')
  const trackingInputRef = useRef<HTMLInputElement>(null)

  // ========== 出库人（同一账号可能对应多出库人） ==========
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

  // ========== 产品清单（多产品） ==========
  const [lines, setLines] = useState<OutboundLineItem[]>([])

  // ========== 当前正在编辑/选择的产品（用于右侧预览 & 加清单） ==========
  const [pickerOpen, setPickerOpen] = useState(false)
  const [activeProduct, setActiveProduct] = useState<Product | null>(null)
  const [activeLocationId, setActiveLocationId] = useState('')
  const [activeLocSearch, setActiveLocSearch] = useState('')
  const [activeQuantity, setActiveQuantity] = useState('1')
  const [activeBatchNo, setActiveBatchNo] = useState('')
  const [quickMode, setQuickMode] = useState(false)
  const [searchingBarcode, setSearchingBarcode] = useState(false)
  const processingRef = useRef(false)

  // ========== 提交状态 ==========
  const [submitting, setSubmitting] = useState(false)

  // ============================================================
  // 公共：根据 barcode 或 sku 查询产品
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
    if (error) {
      console.error('[resolveProductByCode] 查询失败:', error)
      throw error
    }
    return (data as Product) || null
  }, [queryClient])

  // ============================================================
  // 右侧：当前选中产品的库存分布
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
            id,
            code,
            description,
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

  const activeLocationQty = useMemo(() => {
    const inv = inventoryList?.find((i) => i.location_id === activeLocationId)
    return inv ? Number(inv.quantity) : 0
  }, [inventoryList, activeLocationId])

  // 选产品后自动选最近入库库位
  useEffect(() => {
    if (inventoryList && inventoryList.length > 0 && !activeLocationId) {
      setActiveLocationId(inventoryList[0].location_id)
    }
    if (inventoryList && inventoryList.length === 0) {
      setActiveLocationId('')
    }
  }, [inventoryList, activeLocationId])

  // ============================================================
  // 扫码枪：定位产品后，加入清单（或数量 +1，如果同一产品+库位已在清单）
  // ============================================================
  const addProductToLines = useCallback(async (
    product: Product,
    opts?: { qty?: number; scanMode?: boolean; preferFirstLocation?: boolean },
  ) => {
    const qty = opts?.qty ?? 1
    const scanMode = opts?.scanMode ?? true
    const preferFirst = opts?.preferFirstLocation ?? true

    // 1) 加载该产品库存分布
    let invList = inventoryList
    if (activeProduct?.id !== product.id || !invList) {
      const { data, error } = await supabase
        .from('inventory')
        .select(`
          *, location:locations ( id, code, warehouse:warehouses (id, name, code) )
        `)
        .eq('product_id', product.id)
        .order('updated_at', { ascending: false })
      if (error) {
        console.error('[addProductToLines] 查库存失败', error)
        throw error
      }
      invList = data as any[]
    }

    if (!invList || invList.length === 0) {
      toast.warning(`「${product.name}」无可用库存`)
      return
    }

    const target = preferFirst ? invList[0] : (invList.find((i: any) => i.location_id === activeLocationId) || invList[0])
    const loc = (target as any).location
    const locLabel = `${loc?.warehouse?.code || ''} / ${loc?.code || '库位'}`

    // 2) 合并：同 product + location 累加数量（提示超量）
    setLines((prev) => {
      const trackQty = (product as any).track_qty !== false
      const found = prev.find(
        (l) => l.product.id === product.id && l.locationId === target.location_id,
      )
      if (found) {
        const newQty = found.quantity + qty
        if (trackQty && newQty > Number(target.quantity)) {
          toast.warning(`「${product.name}」在 ${locLabel} 仅有 ${target.quantity} 件，清单已取最大可用`)
        }
        return prev.map((l) =>
          l.lineId === found.lineId
            ? { ...l, quantity: trackQty ? Math.min(newQty, Number(target.quantity)) : newQty }
            : l,
        )
      }
      const realQty = trackQty ? Math.min(qty, Number(target.quantity)) : qty
      if (trackQty && realQty < qty) {
        toast.warning(`「${product.name}」在 ${locLabel} 仅有 ${target.quantity} 件，已自动限制`)
      }
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
    toast.success(`已加入清单：${product.name} × ${qty}（${locLabel}）`, { duration: 1800 })
  }, [inventoryList, activeProduct?.id, activeLocationId])

  // 通过条形码查找产品 → 加入清单；若完全匹配不到产品/库位 → 兜底填快递单号（扫单号不用先点输入框）
  const findProductByBarcode = useCallback(async (barcode: string) => {
    setSearchingBarcode(true)
    try {
      const p = await resolveProductByCode(barcode)
      if (!p) {
        // 兜底：扫不到产品 → 视为快递单号，自动绑定
        const code = barcode.trim()
        setTrackingNo(code)
        setTrackingBound(true)
        setShipMode('online')
        toast.success(`📦 已填入单号：${code}`)
        return
      }
      setActiveProduct(p)
      setActiveBatchNo('')
      setActiveQuantity('1')
      await addProductToLines(p, { scanMode: true, preferFirstLocation: true })
    } catch (err: any) {
      toast.error(err.message || '查询产品失败')
    } finally {
      setSearchingBarcode(false)
    }
  }, [resolveProductByCode, addProductToLines])

  // 快速出库：连续扫即加入清单 1 个
  const quickStockOut = useCallback(async (barcode: string) => {
    if (processingRef.current) return
    processingRef.current = true
    try {
      await findProductByBarcode(barcode)
    } finally {
      processingRef.current = false
    }
  }, [findProductByBarcode])

  // 快速模式：让扫码枪字符不落 input
  useEffect(() => {
    if (!quickMode) return
    const handler = (e: FocusEvent) => {
      const t = e.target as HTMLElement | null
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT')) {
        ;(t as HTMLInputElement).blur?.()
      }
    }
    document.addEventListener('focusin', handler)
    document.body.setAttribute('tabindex', '-1')
    document.body.focus()
    return () => document.removeEventListener('focusin', handler)
  }, [quickMode])

  useBarcodeGun({
    onScan: (code) => {
      // 如果单号输入框有焦点，就让扫码枪先填单号（回车绑定），否则按产品条码处理
      if (
        document.activeElement &&
        (document.activeElement as HTMLElement).id === 'tracking_no'
      ) return
      quickStockOut(code)
    },
    enabled: !isMobile,
  })

  // ============================================================
  // 清单操作：加减、删除、清空
  // ============================================================
  const updateLineQty = (lineId: string, newQty: number) => {
    setLines((prev) =>
      prev
        .map((l) => {
          if (l.lineId !== lineId) return l
          const v = Math.max(1, Math.floor(newQty || 1))
          if (v > l.locationAvailable) {
            toast.warning(`「${l.product.name}」超出库位可用 ${l.locationAvailable}`)
            return { ...l, quantity: l.locationAvailable }
          }
          return { ...l, quantity: v }
        })
        .filter((l) => l.quantity > 0),
    )
  }

  const removeLine = (lineId: string) => {
    setLines((prev) => prev.filter((l) => l.lineId !== lineId))
  }

  const clearLines = () => {
    if (lines.length === 0) return
    if (!confirm('确认清空当前出库清单？')) return
    setLines([])
  }

  const linesSummary = useMemo(() => {
    const totalQty = lines.reduce((s, l) => s + l.quantity, 0)
    const skuCount = new Set(lines.map((l) => l.product.id)).size
    return { totalQty, skuCount }
  }, [lines])

  // ============================================================
  // 提交：一次性批量出库（顺序调用 RPC，全部成功才清空）
  // ============================================================
  const shipModeValid = useMemo(() => {
    if (shipMode === 'offline') return true
    // online 模式：允许未绑定单号（普通线上出库），但绑定了就要有值
    if (trackingBound && !trackingNo.trim()) return false
    return true
  }, [shipMode, trackingBound, trackingNo])

  const submitOutbound = useCallback(async () => {
    if (lines.length === 0) {
      toast.warning('清单为空，请先添加出库产品')
      return
    }
    if (!shipModeValid) {
      toast.warning('单号校验失败，请检查')
      return
    }
    // 再次按库位校验数量
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
        // track_qty=false 的产品，不强制校验库位数量 >= 出库量（RPC 会处理）
        const trackQty = (l.product as any).track_qty !== false
        if (trackQty && l.quantity > l.locationAvailable) {
          failReason = `「${l.product.name}」在 ${l.locationLabel} 库存仅剩 ${l.locationAvailable}`
          throw new Error(failReason)
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
        if (error) {
          failReason = `第 ${i + 1} 项「${l.product.name}」失败：${error.message}`
          throw error
        }
        successCount++
      }

      const modeTag = shipMode === 'offline' ? '线下交易' : `快递单号 ${finalTrackingNo || '（无）'}`
      toast.success(
        `✅ 批量出库成功：${linesSummary.skuCount} 种产品，共 ${linesSummary.totalQty} 件（${modeTag}）`,
        { duration: 3500 },
      )
      queryClient.invalidateQueries({ queryKey: ['inventory'] })
      queryClient.invalidateQueries({ queryKey: ['product-inventory'] })
      queryClient.invalidateQueries({ queryKey: ['stock-moves'] })

      // 需求3：整单提交成功后，清空【单号、清单、出库方式、出库人、备注、线下备注】所有状态
      setLines([])
      setActiveProduct(null)
      setActiveLocationId('')
      setActiveQuantity('1')
      setActiveBatchNo('')
      setActiveLocSearch('')
      setShipMode('online')
      setTrackingNo('')
      setTrackingBound(false)
      setOfflineNote('')
      setRemark('')
      setOperatorName('')
    } catch (err: any) {
      console.error('[批量出库] 失败', err)
      toast.error(
        failReason ||
        `批量出库失败（已成功 ${successCount}/${lines.length}）。请检查库存后重试。`,
      )
    } finally {
      setSubmitting(false)
    }
  }, [
    lines, linesSummary, shipModeValid, shipMode, offlineNote, quickMode, remark,
    trackingBound, trackingNo, user, queryClient, operatorName,
  ])

  // ============================================================
  // 手动选中产品 → 点「加入清单」按钮
  // ============================================================
  const handleAddActive = async () => {
    if (!activeProduct) {
      toast.warning('请先选择产品')
      return
    }
    if (!activeLocationId) {
      toast.warning('请选择出库库位')
      return
    }
    const qty = parseInt(activeQuantity, 10)
    if (!qty || qty <= 0) {
      toast.warning('数量必须大于 0')
      return
    }
    const inv = inventoryList?.find((i) => i.location_id === activeLocationId)
    if (!inv) {
      toast.warning('请选择有效库位')
      return
    }
    if (qty > Number(inv.quantity)) {
      toast.error(`库存不足，该库位仅有 ${inv.quantity} ${activeProduct.unit}`)
      return
    }
    await addProductToLines(activeProduct, {
      qty,
      scanMode: false,
      preferFirstLocation: false,
    })
    // 重置当前选择
    setActiveProduct(null)
    setActiveLocationId('')
    setActiveQuantity('1')
    setActiveBatchNo('')
    setActiveLocSearch('')
  }

  const handleManualSelect = (p: Product) => {
    setActiveProduct(p)
    setActiveLocationId('')
    setActiveQuantity('1')
  }

  const activeQtyNum = parseInt(activeQuantity, 10) || 0
  const isOverStockActive = activeLocationId && activeQtyNum > activeLocationQty

  // ============================================================
  // 渲染
  // ============================================================
  return (
    <div className="space-y-5">
      {/* 顶部标题 */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <ArrowUpFromLine className="h-6 w-6 text-orange-600" />
            批量出库（一单多产品）
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            先选择出库方式并填单号 → 再加入多个产品 → 一键提交出库
            {!isMobile && ' · 电脑端支持扫码枪连续扫产品'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant={quickMode ? 'default' : 'outline'}
            onClick={() => {
              const v = !quickMode
              setQuickMode(v)
              if (v) toast.info('⚡ 快速扫码模式已开启：直接扫产品码即加入清单 1 件')
            }}
          >
            <Zap className="h-4 w-4 mr-1" />
            快速扫码 {quickMode ? '已开启' : ''}
          </Button>
        </div>
      </div>

      {/* ===== 卡片 1：出库方式 + 单号/线下（一次性填写，所有产品共用） ===== */}
      <Card className="border-indigo-100 shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-lg">
            <ClipboardList className="h-5 w-5 text-indigo-600" />
            订单信息（整单共用）
          </CardTitle>
          <CardDescription>后续加入清单的所有产品，都将共享这些信息</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <button
              type="button"
              onClick={() => setShipMode('online')}
              className={`flex items-center justify-center gap-3 p-4 rounded-xl border-2 text-sm transition-all ${
                shipMode === 'online'
                  ? 'bg-gradient-to-br from-blue-50 to-blue-100 border-blue-500 text-blue-800 shadow-sm'
                  : 'bg-background border-border text-muted-foreground hover:bg-muted/40'
              }`}
            >
              <Truck className="h-6 w-6" />
              <div className="text-left">
                <div className="font-bold">线上快递</div>
                <div className="text-xs opacity-70">扫快递单号，关联每一件产品</div>
              </div>
              {shipMode === 'online' && <Check className="h-5 w-5 text-blue-600 ml-2" />}
            </button>
            <button
              type="button"
              onClick={() => setShipMode('offline')}
              className={`flex items-center justify-center gap-3 p-4 rounded-xl border-2 text-sm transition-all ${
                shipMode === 'offline'
                  ? 'bg-gradient-to-br from-emerald-50 to-emerald-100 border-emerald-500 text-emerald-800 shadow-sm'
                  : 'bg-background border-border text-muted-foreground hover:bg-muted/40'
              }`}
            >
              <Store className="h-6 w-6" />
              <div className="text-left">
                <div className="font-bold">线下交易</div>
                <div className="text-xs opacity-70">客户自提 / 现场销售，不填单号</div>
              </div>
              {shipMode === 'offline' && <Check className="h-5 w-5 text-emerald-600 ml-2" />}
            </button>
          </div>

          {shipMode === 'online' ? (
            <div className="space-y-2">
              <Label htmlFor="tracking_no" className="text-sm font-medium">
                快递单号（可扫码枪扫入，回车绑定）
              </Label>
              <div className="flex gap-2">
                <Input
                  id="tracking_no"
                  ref={trackingInputRef}
                  value={trackingNo}
                  onChange={(e) => {
                    setTrackingNo(e.target.value)
                    setTrackingBound(false)
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      if (trackingNo.trim()) {
                        setTrackingBound(true)
                        trackingInputRef.current?.blur()
                        document.body.focus()
                        toast.success(`✅ 已绑定单号：${trackingNo.trim()}`)
                      } else toast.warning('请输入单号')
                    }
                  }}
                  placeholder="例如：SF1234567890，输完按回车或点绑定"
                  className={`h-11 ${trackingBound ? 'border-green-500 bg-green-50 focus:border-green-500' : ''}`}
                />
                {trackingBound ? (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => { setTrackingBound(false); setTrackingNo('') }}
                  >
                    <X className="h-4 w-4 mr-1" /> 清除
                  </Button>
                ) : (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      if (!trackingNo.trim()) return toast.warning('请输入单号')
                      setTrackingBound(true)
                      trackingInputRef.current?.blur()
                      document.body.focus()
                      toast.success(`✅ 已绑定单号：${trackingNo.trim()}`)
                    }}
                  >
                    <Check className="h-4 w-4 mr-1" /> 绑定
                  </Button>
                )}
              </div>
              {trackingBound ? (
                <div className="flex items-center gap-2 text-sm text-green-800 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
                  <Check className="h-4 w-4 text-green-600 flex-shrink-0" />
                  <span>已绑定单号：</span>
                  <span className="font-mono font-bold tracking-wide">{trackingNo.trim()}</span>
                  <span className="text-green-600/80 text-xs ml-auto">本单所有产品将自动带上此单号</span>
                </div>
              ) : (
                <div className="text-xs text-muted-foreground">
                  💡 未绑定单号也可以出库（普通出库）；绑定后所有清单产品会关联该单号
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              <Label htmlFor="offline_note" className="text-sm font-medium">
                客户名 / 用途（可选，写入备注）
              </Label>
              <Input
                id="offline_note"
                value={offlineNote}
                onChange={(e) => setOfflineNote(e.target.value)}
                placeholder="例如：张老板、某某公司、自提、某某展会赠品等"
                className="h-11"
              />
              <div className="flex items-center gap-2 text-sm text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
                <Check className="h-4 w-4 text-emerald-600 flex-shrink-0" />
                <span>线下交易模式：所有清单产品会标记为「线下」，不写入快递单号</span>
              </div>
            </div>
          )}

          {/* 出库人选择：同一账号支持多个不同出库人 */}
          <div className="space-y-2 pt-2 border-t">
            <Label htmlFor="operator_name" className="text-sm font-medium">
              出库人 <span className="text-xs text-muted-foreground">（可选：下拉选择或手填新名字）</span>
            </Label>
            <div className="flex gap-2">
              <Input
                id="operator_name"
                list="operator_name_list"
                value={operatorName}
                onChange={(e) => setOperatorName(e.target.value)}
                placeholder="例：张三；多人共用一个账号时在此区分"
                className="h-11"
              />
              <datalist id="operator_name_list">
                {operatorListOptions.map((name) => (
                  <option key={name} value={name}>{name}</option>
                ))}
              </datalist>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ===== 主体：左 = 添加产品 + 清单；右 = 选中产品库存分布 ===== */}
      <div className="grid gap-4 lg:grid-cols-3">
        {/* 左：产品选择 + 清单 */}
        <div className="lg:col-span-2 space-y-4">
          {/* 加产品卡片 */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg flex items-center gap-2">
                <Tag className="h-5 w-5 text-orange-600" />
                添加出库产品
              </CardTitle>
              <CardDescription>
                电脑端直接扫码即可；也可以手动点"选择产品"。加入后会出现在下方清单里
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 md:grid-cols-2">
                {/* 产品 */}
                <div className="space-y-2 md:col-span-2">
                  <Label className="text-sm font-medium">产品 *</Label>
                  {activeProduct ? (
                    <div className="flex items-center gap-3 p-3 border rounded-xl bg-orange-50/50 border-orange-200">
                      {activeProduct.image_path ? (
                        <img
                          src={getProductImageUrl(activeProduct.image_path)}
                          alt={activeProduct.name}
                          className="h-14 w-14 rounded-lg object-cover shadow-sm"
                        />
                      ) : (
                        <div className="h-14 w-14 rounded-lg bg-muted flex items-center justify-center">
                          <ImagePlus className="h-7 w-7 text-muted-foreground/50" />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold text-base">{activeProduct.name}</div>
                        <div className="text-xs text-muted-foreground font-mono">
                          SKU: {activeProduct.sku || '-'}
                          {activeProduct.barcode && ` · 条码: ${activeProduct.barcode}`}
                        </div>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <div className="text-xl font-bold text-orange-700">
                          {activeTotalStock}
                          <span className="text-xs text-muted-foreground font-normal ml-1">
                            {activeProduct.unit}
                          </span>
                        </div>
                        <div className="text-xs text-muted-foreground">总库存</div>
                      </div>
                      <div className="flex gap-2">
                        <Button type="button" variant="outline" size="sm" onClick={() => setPickerOpen(true)}>
                          更换
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => { setActiveProduct(null); setActiveLocationId('') }}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        className="h-16 border-dashed hover:bg-orange-50 hover:border-orange-400"
                        onClick={() => setPickerOpen(true)}
                      >
                        <Package className="mr-2 h-4 w-4 text-orange-500" />
                        手动选择产品
                      </Button>
                      <div className="h-16 border-2 border-dashed border-muted rounded-lg flex items-center justify-center text-sm text-muted-foreground bg-muted/30">
                        <ScanLine className="mr-2 h-4 w-4 text-indigo-500" />
                        {searchingBarcode
                          ? '正在查询产品...'
                          : '扫码枪就绪，直接扫产品条码自动加入清单'}
                      </div>
                    </div>
                  )}
                </div>

                {/* 库位 + 数量 */}
                {activeProduct && (
                  <>
                    <div className="space-y-2">
                      <Label className="text-sm font-medium">选择库位 *</Label>
                      {invLoading ? (
                        <div className="h-11 flex items-center text-sm text-muted-foreground px-3 border rounded-md">加载中...</div>
                      ) : inventoryList?.length === 0 ? (
                        <div className="p-3 border rounded-md bg-amber-50 text-amber-800 text-sm flex items-center gap-2">
                          <AlertTriangle className="h-4 w-4" /> 暂无库存，请先入库
                        </div>
                      ) : (
                        <div className="space-y-2">
                          <div className="relative">
                            <MapPin className="absolute left-2.5 top-3 h-4 w-4 text-muted-foreground" />
                            <Input
                              placeholder="搜索库位 / 仓库..."
                              value={activeLocSearch}
                              onChange={(e) => setActiveLocSearch(e.target.value)}
                              className="pl-8 h-11"
                            />
                          </div>
                          <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
                            {inventoryList
                              ?.filter((inv) => {
                                if (!activeLocSearch.trim()) return true
                                const kw = activeLocSearch.trim().toLowerCase()
                                const a = `${inv.location.warehouse.code} / ${inv.location.code}`.toLowerCase()
                                const b = (inv.location.description || '').toLowerCase()
                                const c = (inv.location.warehouse.name || '').toLowerCase()
                                return a.includes(kw) || b.includes(kw) || c.includes(kw)
                              })
                              .map((inv) => {
                                const selected = activeLocationId === inv.location_id
                                return (
                                  <button
                                    key={inv.id}
                                    type="button"
                                    onClick={() => setActiveLocationId(inv.location_id)}
                                    className={`w-full flex items-center justify-between px-3 py-2 rounded-lg border text-left transition ${
                                      selected
                                        ? 'bg-blue-100 border-blue-500 ring-2 ring-blue-400'
                                        : 'bg-blue-50/60 border-blue-200 hover:bg-blue-100'
                                    }`}
                                  >
                                    <div className="min-w-0">
                                      <div className="flex items-center gap-1.5">
                                        <Package className="h-3.5 w-3.5 text-blue-600 flex-shrink-0" />
                                        <span className="font-mono text-sm font-semibold text-blue-900">
                                          {inv.location.warehouse.code} / {inv.location.code}
                                        </span>
                                        {selected && (
                                          <span className="text-[10px] font-bold text-white bg-blue-600 px-1.5 rounded-full">✓ 已选</span>
                                        )}
                                      </div>
                                      <div className="text-[11px] text-muted-foreground truncate">
                                        {inv.location.warehouse.name}
                                        {inv.location.description && ` · ${inv.location.description}`}
                                      </div>
                                    </div>
                                    <div className="text-right flex-shrink-0 ml-2">
                                      <div className="font-bold text-blue-900">{inv.quantity}</div>
                                      <div className="text-[10px] text-muted-foreground">{activeProduct.unit}</div>
                                    </div>
                                  </button>
                                )
                              })}
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label className="text-sm font-medium">数量 *</Label>
                        {activeLocationId && (
                          <span className="text-xs text-muted-foreground">
                            可用：{activeLocationQty} {activeProduct.unit}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <Input
                          type="number"
                          min="1"
                          value={activeQuantity}
                          onChange={(e) => {
                            const n = parseInt(e.target.value, 10)
                            setActiveQuantity(isNaN(n) || n < 1 ? '' : String(n))
                          }}
                          className={isOverStockActive ? 'border-red-500' : 'h-11'}
                          placeholder="数量"
                        />
                        <span className="text-sm text-muted-foreground w-12">{activeProduct.unit || '件'}</span>
                      </div>
                      {isOverStockActive && (
                        <p className="text-xs text-red-600 flex items-center gap-1">
                          <AlertTriangle className="h-3 w-3" /> 超过该库位可用数量
                        </p>
                      )}
                      <Button
                        type="button"
                        variant="default"
                        className="w-full mt-1 bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 text-white"
                        onClick={handleAddActive}
                        disabled={!activeProduct || !activeLocationId || !activeQtyNum || !!isOverStockActive}
                      >
                        <Plus className="h-4 w-4 mr-1.5" />
                        加入出库清单
                      </Button>
                    </div>
                  </>
                )}
              </div>
            </CardContent>
          </Card>

          {/* 出库清单 */}
          <Card className="border-orange-100 shadow-sm">
            <CardHeader className="pb-2 flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-lg flex items-center gap-2">
                  <ShoppingCart className="h-5 w-5 text-orange-600" />
                  出库清单
                  {lines.length > 0 && (
                    <span className="text-xs bg-orange-500 text-white px-2 py-0.5 rounded-full font-bold ml-1">
                      {lines.length}
                    </span>
                  )}
                </CardTitle>
                <CardDescription>
                  {lines.length === 0
                    ? '清单为空，扫码或手动选择产品加入'
                    : `${linesSummary.skuCount} 种产品 · 合计 ${linesSummary.totalQty} 件`}
                </CardDescription>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={clearLines}
                  disabled={lines.length === 0}
                >
                  <RefreshCcw className="h-4 w-4 mr-1" />
                  清空
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {lines.length === 0 ? (
                <div className="border-2 border-dashed rounded-xl py-14 text-center text-muted-foreground bg-muted/30">
                  <ShoppingCart className="h-12 w-12 mx-auto mb-3 opacity-40 text-orange-500" />
                  <div className="text-sm font-medium">还没有出库产品</div>
                  <div className="text-xs mt-1 opacity-80">
                    扫产品条码或点上方"加入出库清单"按钮
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  {/* 表头（≥md显示） */}
                  <div className="hidden md:grid md:grid-cols-12 gap-2 px-3 py-2 text-xs font-semibold text-muted-foreground bg-muted/50 rounded-lg">
                    <div className="col-span-1">#</div>
                    <div className="col-span-5">产品</div>
                    <div className="col-span-3">库位</div>
                    <div className="col-span-2 text-center">数量</div>
                    <div className="col-span-1 text-right">操作</div>
                  </div>
                  {lines.map((l, idx) => (
                    <div
                      key={l.lineId}
                      className="grid grid-cols-12 gap-2 items-center p-3 rounded-xl border bg-gradient-to-br from-white to-orange-50/30 hover:shadow-sm transition-shadow"
                    >
                      {/* # */}
                      <div className="col-span-12 md:col-span-1 flex md:block">
                        <div className="hidden md:flex items-center justify-center h-8 w-8 rounded-full bg-orange-500 text-white text-sm font-bold">
                          {idx + 1}
                        </div>
                        <div className="md:hidden text-xs text-muted-foreground mr-2">#{idx + 1}</div>
                      </div>

                      {/* 产品 */}
                      <div className="col-span-10 md:col-span-5 flex items-center gap-3 min-w-0">
                        {l.product.image_path ? (
                          <img
                            src={getProductImageUrl(l.product.image_path)}
                            alt={l.product.name}
                            className="h-10 w-10 rounded-md object-cover flex-shrink-0"
                          />
                        ) : (
                          <div className="h-10 w-10 rounded-md bg-orange-100 flex items-center justify-center flex-shrink-0">
                            <Package className="h-5 w-5 text-orange-600" />
                          </div>
                        )}
                        <div className="min-w-0">
                          <div className="text-sm font-semibold truncate">{l.product.name}</div>
                          <div className="text-[11px] text-muted-foreground font-mono truncate">
                            {l.product.sku || '-'}
                            {l.scanMode && (
                              <span className="ml-2 text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded">
                                扫码
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* 库位 */}
                      <div className="col-span-2 md:hidden text-right text-[11px] text-muted-foreground font-mono">
                        {l.locationLabel} · 可用 {l.locationAvailable}
                      </div>
                      <div className="hidden md:block md:col-span-3 text-sm">
                        <div className="font-mono font-medium text-blue-800">{l.locationLabel}</div>
                        <div className="text-[11px] text-muted-foreground">
                          可用 {l.locationAvailable} {l.unit}
                        </div>
                      </div>

                      {/* 数量 */}
                      <div className="col-span-12 md:col-span-2 flex items-center md:justify-center gap-2">
                        <div className="flex items-center gap-1.5 bg-white border rounded-lg p-0.5 shadow-sm">
                          <button
                            type="button"
                            onClick={() => updateLineQty(l.lineId, l.quantity - 1)}
                            disabled={l.quantity <= 1}
                            className="h-7 w-7 rounded-md hover:bg-orange-100 disabled:opacity-40 text-orange-700 font-bold"
                          >
                            <Minus className="h-3 w-3 mx-auto" />
                          </button>
                          <Input
                            type="number"
                            value={l.quantity}
                            onChange={(e) => updateLineQty(l.lineId, parseInt(e.target.value, 10))}
                            className="h-7 w-16 border-none text-center shadow-none p-0 text-sm font-bold"
                          />
                          <button
                            type="button"
                            onClick={() => updateLineQty(l.lineId, l.quantity + 1)}
                            disabled={l.quantity >= l.locationAvailable}
                            className="h-7 w-7 rounded-md hover:bg-orange-100 disabled:opacity-40 text-orange-700 font-bold"
                          >
                            <Plus className="h-3 w-3 mx-auto" />
                          </button>
                        </div>
                      </div>

                      {/* 删除 */}
                      <div className="col-span-2 md:col-span-1 flex md:justify-end justify-between items-center">
                        <div className="md:hidden text-sm font-bold text-orange-700">
                          × {l.unit}
                        </div>
                        <button
                          type="button"
                          onClick={() => removeLine(l.lineId)}
                          className="h-8 w-8 inline-flex items-center justify-center rounded-md text-red-500 hover:bg-red-50 transition-colors"
                          title="移除"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  ))}

                  {/* 汇总条 + 提交 */}
                  <div className="mt-4 p-4 rounded-xl bg-gradient-to-r from-orange-500 via-orange-600 to-rose-500 text-white shadow-lg">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="space-y-0.5">
                        <div className="text-xs opacity-90">
                          {shipMode === 'offline' ? '📍 线下交易' : `📦 快递单号：${trackingBound ? trackingNo.trim() : '（未绑定，记录为空）'}`}
                        </div>
                        <div className="text-lg font-bold flex items-center gap-4">
                          <span>{linesSummary.skuCount} 种产品</span>
                          <span className="opacity-60">·</span>
                          <span>合计 {linesSummary.totalQty} 件</span>
                        </div>
                      </div>
                      <Button
                        type="button"
                        size="lg"
                        onClick={submitOutbound}
                        disabled={submitting || !shipModeValid}
                        className="bg-white text-orange-700 hover:bg-orange-50 font-bold shadow-md"
                      >
                        {submitting ? (
                          <>
                            <RefreshCcw className="h-4 w-4 mr-2 animate-spin" />
                            出库中...
                          </>
                        ) : (
                          <>
                            <ArrowUpFromLine className="h-5 w-5 mr-2" />
                            确认批量出库
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* 备注 */}
          <Card>
            <CardContent className="p-4">
              <div className="space-y-2">
                <Label className="text-sm font-medium flex items-center gap-1">
                  整单备注 <span className="text-muted-foreground font-normal text-xs">（可选）</span>
                </Label>
                <Textarea
                  value={remark}
                  onChange={(e) => setRemark(e.target.value)}
                  rows={2}
                  placeholder="整单统一备注，例如：赠品、破损补发、退货返仓原因等"
                />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* 右侧：库存分布（选中产品时） */}
        <div className="space-y-4">
          <Card className="sticky top-4">
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <MapPin className="h-4 w-4" />
                库存分布
              </CardTitle>
            </CardHeader>
            <CardContent>
              {!activeProduct ? (
                <div className="text-sm text-muted-foreground text-center py-10">
                  <Package className="h-10 w-10 mx-auto mb-2 opacity-30" />
                  选择产品后查看
                </div>
              ) : invLoading ? (
                <div className="text-sm text-muted-foreground text-center py-10">加载中...</div>
              ) : inventoryList?.length === 0 ? (
                <div className="text-sm text-muted-foreground text-center py-10">暂无库存</div>
              ) : (
                <div className="space-y-2">
                  {inventoryList?.map((inv) => {
                    const inList = lines.find(
                      (l) => l.product.id === activeProduct.id && l.locationId === inv.location_id,
                    )
                    return (
                      <div
                        key={inv.id}
                        className={`p-3 rounded-xl border text-sm transition ${
                          inList
                            ? 'bg-orange-50 border-orange-400 ring-1 ring-orange-300'
                            : 'bg-blue-50/40 border-blue-200'
                        }`}
                      >
                        <div className="flex justify-between items-center mb-1">
                          <span className="font-mono font-bold text-blue-900">
                            {inv.location.warehouse.code} / {inv.location.code}
                          </span>
                          <span className="font-bold text-blue-900">
                            {inv.quantity} <span className="font-normal text-xs text-muted-foreground">{activeProduct.unit}</span>
                          </span>
                        </div>
                        <div className="text-xs text-muted-foreground truncate mb-2">
                          {inv.location.warehouse.name}
                          {inv.location.description && ` · ${inv.location.description}`}
                        </div>
                        {inList && (
                          <div className="text-[11px] text-orange-700 bg-orange-100 rounded-md px-2 py-1 inline-flex items-center gap-1">
                            ✓ 已加入清单 {inList.quantity} {activeProduct.unit}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          {/* 操作提示 */}
          <Card className="border-indigo-100 bg-indigo-50/50">
            <CardContent className="p-4 text-sm text-indigo-900 space-y-1.5">
              <div className="font-bold text-indigo-700 flex items-center gap-1.5">
                💡 使用小贴士
              </div>
              <ul className="space-y-1 text-xs list-disc pl-4 text-indigo-800/90">
                <li>同一个单号下多个产品：先填单号 → 绑定 → 连续扫产品 → 提交</li>
                <li>同一产品+库位重复扫，数量自动累加，不会生成多行</li>
                <li>快速扫码模式默认每次加 1 件；可在清单里直接改数量</li>
                <li>批量出库逐个执行，中间失败会停止，已提交的不会回滚</li>
                <li>提交后清单清空，单号保留，便于连续打包下一单</li>
              </ul>
            </CardContent>
          </Card>
        </div>
      </div>

      <ProductPicker
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        onSelect={handleManualSelect}
      />
    </div>
  )
}
