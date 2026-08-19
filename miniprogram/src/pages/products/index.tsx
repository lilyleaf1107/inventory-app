import { useState, useMemo } from 'react'
import { View, Text, Input, ScrollView, Picker } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/auth'
import { isWarehouseManagerAbove, canViewCost, isAdminAbove } from '@/lib/permissions'
import type { Product, Category, Warehouse, Location } from '@/types'

interface ProForm {
  name: string; sku: string; barcode: string; category: string;
  spec: string; unit: string; cost: string; description: string
}
const emptyPro: ProForm = { name: '', sku: '', barcode: '', category: '', spec: '', unit: '个', cost: '', description: '' }

// 低库存等级配色
function lowLevel(qty: number) {
  if (qty === 0) return { text: '#dc2626', label: '缺货', bg: '#fef2f2', border: '#fecaca' }
  if (qty <= 5) return { text: '#dc2626', label: '红色预警', bg: '#fef2f2', border: '#fecaca' }
  if (qty <= 15) return { text: '#ea580c', label: '橙色预警', bg: '#fff7ed', border: '#fed7aa' }
  if (qty <= 30) return { text: '#ca8a04', label: '黄色预警', bg: '#fefce8', border: '#fef08a' }
  return null
}

interface PList extends Product {
  locations?: { id: string; quantity: number; locations?: { id: string; code: string; warehouse?: { id: string; name?: string | null; code?: string } } }[]
}

export default function Products() {
  const profile = useAuthStore(s => s.profile)
  const checkAuth = useAuthStore(s => s.checkAuth)
  const queryClient = useQueryClient()
  const canWrite = isWarehouseManagerAbove(profile)
  const seeCost = canViewCost(profile)

  const [kw, setKw] = useState('')
  const [catFilter, setCatFilter] = useState('')
  const [dialog, setDialog] = useState(false)
  const [editing, setEditing] = useState<Product | null>(null)
  const [form, setForm] = useState<ProForm>(emptyPro)

  useDidShow(() => {
    checkAuth()
    if (!useAuthStore.getState().user) Taro.redirectTo({ url: '/pages/login/index' })
  })

  const { data: categories } = useQuery({
    queryKey: ['categories'],
    queryFn: async () => {
      const { data, error } = await supabase.from('categories').select('*').order('sort_order', { ascending: false }).order('name')
      if (error) throw error
      return data as Category[]
    },
  })

  const { data: warehouses } = useQuery({
    queryKey: ['warehouses'],
    queryFn: async () => {
      const { data, error } = await supabase.from('warehouses').select('*').order('name')
      if (error) throw error
      return data as Warehouse[]
    },
  })

  // 所有库位：新增产品时可选初始库位
  const { data: allLocations } = useQuery({
    queryKey: ['all-locs'],
    queryFn: async () => {
      const { data, error } = await supabase.from('locations').select('id, code, warehouse_id, warehouse:warehouses(id, code, name)').order('code')
      if (error) throw error
      return data as (Location & { warehouse?: Warehouse })[]
    },
  })

  const [initLocId, setInitLocId] = useState('')
  const [initQty, setInitQty] = useState('')

  const { data: products, isLoading } = useQuery({
    queryKey: ['products-mini', catFilter],
    enabled: !!profile,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('products')
        .select(`*, locations:inventory(id, quantity, location_id, locations(id, code, warehouse_id, warehouse: warehouses(id, name, code)))`)
        .order('created_at', { ascending: false })
      if (error) throw error
      return data as PList[]
    },
  })

  // 产品总库存 + 首个库位（用于排序：仓库名→库位编码，无库位排末尾）
  const enriched = useMemo(() => {
    if (!products) return products
    return [...products].sort((a, b) => {
      const aLocs = (a.locations || []).filter(l => l.locations)
      const bLocs = (b.locations || []).filter(l => l.locations)
      if (aLocs.length === 0 && bLocs.length === 0) return 0
      if (aLocs.length === 0) return 1
      if (bLocs.length === 0) return -1
      const aWh = aLocs[0]?.locations?.warehouse?.name || aLocs[0]?.locations?.warehouse?.code || ''
      const bWh = bLocs[0]?.locations?.warehouse?.name || bLocs[0]?.locations?.warehouse?.code || ''
      if (aWh !== bWh) return aWh.localeCompare(bWh, 'zh-CN')
      const aCode = aLocs[0]?.locations?.code || ''
      const bCode = bLocs[0]?.locations?.code || ''
      return aCode.localeCompare(bCode, 'zh-CN', { numeric: true })
    })
  }, [products])

  const rows = useMemo(() => {
    if (!enriched) return []
    const kwl = kw.trim().toLowerCase()
    return enriched.filter(p => {
      if (catFilter && p.category !== catFilter) return false
      if (!kwl) return true
      return (
        p.name.toLowerCase().includes(kwl) ||
        (p.sku && p.sku.toLowerCase().includes(kwl)) ||
        (p.barcode && p.barcode.toLowerCase().includes(kwl))
      )
    })
  }, [enriched, kw, catFilter])

  const createMutation = useMutation({
    mutationFn: async (f: ProForm) => {
      if (!f.name.trim()) throw new Error('产品名称必填')
      // SKU 冲突检测
      const skuTrim = f.sku.trim() || null
      if (skuTrim) {
        const { data: dup } = await supabase.from('products').select('id, name').eq('sku', skuTrim).limit(2)
        const other = (dup || []).filter(p => p.id !== editing?.id)
        if (other.length) throw new Error(`SKU「${skuTrim}」已被「${other[0].name}」占用`)
      }
      const { data, error } = await supabase.from('products').insert({
        name: f.name.trim(),
        sku: skuTrim,
        barcode: f.barcode.trim() || null,
        category: f.category || null,
        spec: f.spec.trim() || null,
        unit: f.unit || '个',
        cost: seeCost && f.cost ? Number(f.cost) : null,
        description: f.description.trim() || null,
        on_shelf: true,
      }).select().single()
      if (error) throw error
      // 初始库位
      if (initLocId && initQty && Number(initQty) > 0) {
        const { error: ie } = await supabase.from('inventory').insert({
          product_id: (data as any).id,
          location_id: initLocId,
          quantity: Number(initQty),
        })
        if (ie) throw ie
      }
      return data
    },
    onSuccess: () => {
      Taro.showToast({ title: '创建成功', icon: 'success' })
      queryClient.invalidateQueries({ queryKey: ['products-mini'] })
      setDialog(false); setEditing(null); setForm(emptyPro); setInitLocId(''); setInitQty('')
    },
    onError: (e: any) => Taro.showToast({ title: e.message || '创建失败', icon: 'none' }),
  })

  const updateMutation = useMutation({
    mutationFn: async ({ id, f }: { id: string; f: ProForm }) => {
      if (!f.name.trim()) throw new Error('产品名称必填')
      const skuTrim = f.sku.trim() || null
      if (skuTrim) {
        const { data: dup } = await supabase.from('products').select('id, name').eq('sku', skuTrim).limit(2)
        const other = (dup || []).filter(p => p.id !== id)
        if (other.length) throw new Error(`SKU「${skuTrim}」已被「${other[0].name}」占用`)
      }
      const payload: any = {
        name: f.name.trim(),
        sku: skuTrim,
        barcode: f.barcode.trim() || null,
        category: f.category || null,
        spec: f.spec.trim() || null,
        unit: f.unit || '个',
        description: f.description.trim() || null,
        updated_at: new Date().toISOString(),
      }
      if (seeCost) payload.cost = f.cost ? Number(f.cost) : null
      const { error } = await supabase.from('products').update(payload).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      Taro.showToast({ title: '更新成功', icon: 'success' })
      queryClient.invalidateQueries({ queryKey: ['products-mini'] })
      setDialog(false); setEditing(null); setForm(emptyPro); setInitLocId(''); setInitQty('')
    },
    onError: (e: any) => Taro.showToast({ title: e.message || '更新失败', icon: 'none' }),
  })

  const toggleShelf = useMutation({
    mutationFn: async ({ id, val }: { id: string; val: boolean }) => {
      const { error } = await supabase.from('products').update({
        on_shelf: val, updated_at: new Date().toISOString(),
      }).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products-mini'] })
    },
    onError: (e: any) => Taro.showToast({ title: e.message || '操作失败', icon: 'none' }),
  })

  const deleteMutation = useMutation({
    mutationFn: async (p: Product) => {
      const { error: e1 } = await supabase.from('stock_moves').delete().eq('product_id', p.id)
      if (e1) throw e1
      const { error: e2 } = await supabase.from('inventory').delete().eq('product_id', p.id)
      if (e2) throw e2
      const { error: e3 } = await supabase.from('product_tags').delete().eq('product_id', p.id)
      if (e3) throw e3
      const { error } = await supabase.from('products').delete().eq('id', p.id)
      if (error) throw error
    },
    onSuccess: () => {
      Taro.showToast({ title: '删除成功', icon: 'success' })
      queryClient.invalidateQueries({ queryKey: ['products-mini'] })
    },
    onError: (e: any) => Taro.showToast({ title: e.message || '删除失败', icon: 'none' }),
  })

  const open = (p?: Product) => {
    if (p) {
      setEditing(p)
      setForm({
        name: p.name, sku: p.sku || '', barcode: p.barcode || '',
        category: p.category || '', spec: p.spec || '',
        unit: p.unit || '个', cost: p.cost != null ? String(p.cost) : '',
        description: p.description || '',
      })
    } else {
      setEditing(null)
      setForm(emptyPro)
    }
    setInitLocId(''); setInitQty('')
    setDialog(true)
  }
  const submit = () => { editing ? updateMutation.mutate({ id: editing.id, d: form }) : createMutation.mutate(form) }
  const confirmDel = async (p: Product) => {
    const r = await Taro.showModal({ title: '确认删除', content: `删除产品「${p.name}」？\n将同时删除所有库存与出入库记录，无法恢复`, confirmColor: '#d9534f' })
    if (r.confirm) deleteMutation.mutate(p)
  }

  const catRange = useMemo(() => {
    const list = ['全部分类']
    if (categories) list.push(...categories.map(c => c.name))
    return list
  }, [categories])
  const catIdx = useMemo(() => {
    if (!catFilter) return 0
    const idx = categories?.findIndex(c => c.name === catFilter) ?? -1
    return idx >= 0 ? idx + 1 : 0
  }, [categories, catFilter])

  const locRange = useMemo(() => allLocations?.map(l => `${l.code} · ${l.warehouse?.name || l.warehouse?.code}`) || [], [allLocations])
  const locIdx = useMemo(() => allLocations?.findIndex(l => l.id === initLocId) ?? -1, [allLocations, initLocId])

  return (
    <ScrollView scrollY style={{ minHeight: '100vh' }}>
      <View className="page-wrap">
      <View className="flex items-center justify-between mb-3">
        <Text className="text-lg font-semibold">📦 产品管理</Text>
        {canWrite && <View className="btn btn-primary btn-sm" onClick={() => open()}>+ 新增产品</View>}
      </View>

      <View className="card mb-3">
        <View className="card-content" style={{ padding: '20rpx 24rpx' }}>
          <Input className="field-input" placeholder="搜索 产品名 / SKU / 条码"
            value={kw} onInput={(e) => setKw(e.detail.value)} />
          <View className="mt-2 flex items-center justify-between">
            <Picker mode="selector" range={catRange} value={catIdx}
              onChange={(e) => {
                const idx = Number(e.detail.value)
                setCatFilter(idx === 0 ? '' : catRange[idx])
              }}>
              <View className="btn btn-outline btn-sm">
                {catFilter ? `分类: ${catFilter}` : '全部分类'} <Text className="chevron ml-1">▾</Text>
              </View>
            </Picker>
            <Text className="text-xs text-muted-foreground">{rows.length} 个产品</Text>
          </View>
        </View>
      </View>

      <View className="grid grid-cols-1 grid-gap-2">
        {isLoading ? (
          <View className="text-center text-sm text-muted-foreground py-8">加载中...</View>
        ) : rows.length === 0 ? (
          <View className="empty">
            <View className="empty-icon">📦</View>
            <View className="empty-title">暂无产品</View>
            {canWrite && <View className="empty-desc">点击右上角「新增产品」添加</View>}
          </View>
        ) : rows.map(p => {
          const locs = (p.locations || []).filter(l => l.locations)
          const totalQty = locs.reduce((s, l) => s + Number(l.quantity || 0), 0)
          const lv = p.is_material_area ? null : lowLevel(totalQty)
          return (
            <View key={p.id} className="card" style={lv ? { background: lv.bg, borderColor: lv.border } : {}}>
              <View className="card-content" style={{ padding: '20rpx 24rpx' }}>
                <View className="flex items-start justify-between gap-2">
                  <View className="flex-1 min-w-0">
                    <View className="flex items-center gap-2 flex-wrap">
                      <Text className="font-semibold text-sm truncate flex-1 min-w-0">{p.name}</Text>
                      {p.on_shelf ? (
                        <Text className="badge badge-emerald">已上架</Text>
                      ) : (
                        <Text className="badge badge-muted">未上架</Text>
                      )}
                      {p.is_material_area && <Text className="badge badge-muted">物料区</Text>}
                      {!p.is_material_area && lv && (
                        <Text className={`badge ${totalQty === 0 ? 'badge-red' : ''}`}
                          style={!totalQty ? {} : { background: lv.bg, color: lv.text, border: `1rpx solid ${lv.border}` }}>
                          {lv.label}
                        </Text>
                      )}
                    </View>
                    <View className="mt-1 flex flex-wrap gap-2 text-xs text-muted-foreground">
                      {p.sku && <Text>SKU: {p.sku}</Text>}
                      {p.category && <Text>分类: {p.category}</Text>}
                      {seeCost && p.cost != null && <Text>成本: ¥{Number(p.cost).toFixed(2)}</Text>}
                    </View>
                    <View className="mt-1.5 flex items-center gap-2 text-xs">
                      <Text className="text-muted-foreground">库存:</Text>
                      <Text className={`font-semibold ${p.is_material_area ? 'text-muted-foreground' : (lv?.text || '')}`}>
                        {p.is_material_area ? '***' : totalQty}
                      </Text>
                      {p.unit && <Text className="text-muted-foreground">{p.unit}</Text>}
                      {canWrite ? (
                        <View className={`btn btn-xs ml-auto ${p.on_shelf ? 'btn-outline' : 'btn-secondary'}`}
                          onClick={() => toggleShelf.mutate({ id: p.id, val: !p.on_shelf })}>
                          {p.on_shelf ? '已上架' : '未上架'}
                        </View>
                      ) : null}
                    </View>
                    {locs.length > 0 && (
                      <View className="mt-2 flex flex-wrap gap-1.5">
                        {locs.slice(0, 4).map(l => (
                          <Text key={l.id} className="text-xs px-2 py-0.5 rounded"
                            style={{ background: 'var(--muted)', color: 'var(--muted-foreground)' }}>
                            📍 {l.locations?.code || '-'} : {p.is_material_area ? '***' : l.quantity}
                          </Text>
                        ))}
                        {locs.length > 4 && (
                          <Text className="text-xs px-2 py-0.5 rounded"
                            style={{ background: 'var(--muted)', color: 'var(--muted-foreground)' }}>
                            +{locs.length - 4} 库位
                          </Text>
                        )}
                      </View>
                    )}
                    {p.spec && <View className="mt-1 text-xs text-muted-foreground">规格: {p.spec}</View>}
                  </View>
                </View>
                {canWrite && (
                  <View className="flex gap-2 mt-2">
                    <View className="btn btn-outline btn-xs" onClick={() => open(p)}>编辑</View>
                    <View className="btn btn-outline btn-xs" style={{ color: '#c73b38', borderColor: '#fecaca' }}
                      onClick={() => confirmDel(p)}>删除</View>
                  </View>
                )}
              </View>
            </View>
          )
        })}
      </View>

      {dialog && (
        <View style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24rpx' }}
          onClick={() => setDialog(false)}>
          <View className="card" style={{ width: '100%', maxWidth: '760rpx', maxHeight: '85vh', overflow: 'auto' }} onClick={(e) => e.stopPropagation()}>
            <View className="card-header flex items-center justify-between">
              <Text className="card-title">{editing ? '编辑产品' : '新增产品'}</Text>
              <Text className="chevron" onClick={() => setDialog(false)}>✕</Text>
            </View>
            <View className="card-content">
              <View className="field-wrap">
                <Text className="field-label">产品名称 *</Text>
                <Input className="field-input" placeholder="如 纯牛奶 250ml" value={form.name}
                  onInput={(e) => setForm({ ...form, name: e.detail.value })} />
              </View>
              <View className="grid grid-cols-2 grid-gap-2">
                <View className="field-wrap">
                  <Text className="field-label">SKU</Text>
                  <Input className="field-input" placeholder="选填，唯一" value={form.sku}
                    onInput={(e) => setForm({ ...form, sku: e.detail.value })} />
                </View>
                <View className="field-wrap">
                  <Text className="field-label">单位</Text>
                  <Input className="field-input" placeholder="个 / 盒 / 件" value={form.unit}
                    onInput={(e) => setForm({ ...form, unit: e.detail.value })} />
                </View>
              </View>
              <View className="field-wrap">
                <Text className="field-label">条形码</Text>
                <Input className="field-input" placeholder="扫码枪可识别（选填）" value={form.barcode}
                  onInput={(e) => setForm({ ...form, barcode: e.detail.value })} />
              </View>
              <View className="grid grid-cols-2 grid-gap-2">
                <View className="field-wrap">
                  <Text className="field-label">分类</Text>
                  <View className="flex flex-wrap gap-2">
                    <View className={`btn btn-outline btn-xs ${!form.category ? '' : ''}`}
                      style={!form.category ? { borderColor: 'var(--ring)', color: 'var(--primary)' } : {}}
                      onClick={() => setForm({ ...form, category: '' })}>无</View>
                    {categories?.map(c => (
                      <View key={c.id} className={`btn btn-outline btn-xs`}
                        style={form.category === c.name ? { borderColor: 'var(--ring)', color: 'var(--primary)' } : {}}
                        onClick={() => setForm({ ...form, category: c.name })}>{c.name}</View>
                    ))}
                  </View>
                </View>
                <View className="field-wrap">
                  <Text className="field-label">规格</Text>
                  <Input className="field-input" placeholder="如 500ml（选填）" value={form.spec}
                    onInput={(e) => setForm({ ...form, spec: e.detail.value })} />
                </View>
              </View>
              {seeCost && (
                <View className="field-wrap">
                  <Text className="field-label">成本（元）</Text>
                  <Input className="field-input" type="digit" placeholder="选填，仅管理员可见"
                    value={form.cost} onInput={(e) => setForm({ ...form, cost: e.detail.value })} />
                </View>
              )}
              {!editing && (
                <View className="field-wrap">
                  <Text className="field-label">初始库位（选填）</Text>
                  <View className="grid grid-cols-2 grid-gap-2">
                    <Picker mode="selector" range={locRange} value={locIdx >= 0 ? locIdx : 0}
                      onChange={(e) => setInitLocId(allLocations?.[Number(e.detail.value)]?.id || '')}>
                      <View className="btn btn-outline btn-sm"
                        style={{ justifyContent: 'flex-start', paddingLeft: '20rpx' }}>
                        {initLocId
                          ? <Text className="truncate font-mono">{allLocations?.find(l => l.id === initLocId)?.code}</Text>
                          : <Text className="text-muted-foreground">选择库位</Text>}
                      </View>
                    </Picker>
                    <Input className="field-input" type="digit" placeholder="初始数量"
                      value={initQty} onInput={(e) => setInitQty(e.detail.value)} />
                  </View>
                </View>
              )}
              <View className="field-wrap">
                <Text className="field-label">描述</Text>
                <Input className="field-input" placeholder="选填" value={form.description}
                  onInput={(e) => setForm({ ...form, description: e.detail.value })} />
              </View>
            </View>
            <View className="card-footer flex gap-2">
              <View className="btn btn-outline flex-1" onClick={() => setDialog(false)}>取消</View>
              <View className="btn btn-primary flex-1" onClick={submit}>
                {editing ? '保存' : '创建'}
              </View>
            </View>
          </View>
        </View>
      )}
      <View style={{ height: '60rpx' }} />
      </View>
    </ScrollView>
  )
}
