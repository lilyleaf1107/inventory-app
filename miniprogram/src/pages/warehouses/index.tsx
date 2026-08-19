import { useState, useMemo } from 'react'
import { View, Text, Input, ScrollView } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/auth'
import { isWarehouseManagerAbove } from '@/lib/permissions'
import type { Warehouse, Location } from '@/types'

interface LocationWithInv extends Location {
  inventory?: { id: string; quantity: number; product: { id: string; name: string } }[]
}

interface WhForm { code: string; name: string; address: string }
interface LocForm { code: string; zone: string; rack: string; level: string; position: string; description: string }
const emptyWh: WhForm = { code: '', name: '', address: '' }
const emptyLoc: LocForm = { code: '', zone: '', rack: '', level: '', position: '', description: '' }

export default function Warehouses() {
  const profile = useAuthStore(s => s.profile)
  const checkAuth = useAuthStore(s => s.checkAuth)
  const queryClient = useQueryClient()
  const canWrite = isWarehouseManagerAbove(profile)

  const [activeWh, setActiveWh] = useState<Warehouse | null>(null)
  const [whDialog, setWhDialog] = useState(false)
  const [editingWh, setEditingWh] = useState<Warehouse | null>(null)
  const [whForm, setWhForm] = useState<WhForm>(emptyWh)
  const [locDialog, setLocDialog] = useState(false)
  const [editingLoc, setEditingLoc] = useState<Location | null>(null)
  const [locForm, setLocForm] = useState<LocForm>(emptyLoc)

  useDidShow(() => {
    checkAuth()
    if (!useAuthStore.getState().user) Taro.redirectTo({ url: '/pages/login/index' })
  })

  const { data: warehouses, isLoading: whLoading } = useQuery({
    queryKey: ['warehouses'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('warehouses')
        .select('*')
        .order('sort_order', { ascending: false, nullsFirst: false })
        .order('created_at', { ascending: false })
      if (error) throw error
      return data as Warehouse[]
    },
  })

  const { data: locations, isLoading: locLoading } = useQuery({
    queryKey: ['locations', activeWh?.id],
    enabled: !!activeWh,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('locations')
        .select(`
          *,
          inventory (
            id, quantity,
            product:products ( id, name )
          )
        `)
        .eq('warehouse_id', activeWh!.id)
        .order('code')
      if (error) throw error
      return data as LocationWithInv[]
    },
  })

  const createWh = useMutation({
    mutationFn: async (d: WhForm) => {
      if (!d.code.trim()) throw new Error('仓库编码必填')
      const { error } = await supabase.from('warehouses').insert({
        code: d.code.trim(),
        name: d.name.trim() || null,
        address: d.address.trim() || null,
      })
      if (error) throw error
    },
    onSuccess: () => {
      Taro.showToast({ title: '创建成功', icon: 'success' })
      queryClient.invalidateQueries({ queryKey: ['warehouses'] })
      setWhDialog(false); setWhForm(emptyWh); setEditingWh(null)
    },
    onError: (e: any) => Taro.showToast({ title: e.message || '创建失败', icon: 'none' }),
  })

  const updateWh = useMutation({
    mutationFn: async ({ id, d }: { id: string; d: WhForm }) => {
      if (!d.code.trim()) throw new Error('仓库编码必填')
      const { error } = await supabase.from('warehouses').update({
        code: d.code.trim(),
        name: d.name.trim() || null,
        address: d.address.trim() || null,
      }).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      Taro.showToast({ title: '更新成功', icon: 'success' })
      queryClient.invalidateQueries({ queryKey: ['warehouses'] })
      setWhDialog(false); setWhForm(emptyWh); setEditingWh(null)
    },
    onError: (e: any) => Taro.showToast({ title: e.message || '更新失败', icon: 'none' }),
  })

  const deleteWh = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('warehouses').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      Taro.showToast({ title: '删除成功', icon: 'success' })
      queryClient.invalidateQueries({ queryKey: ['warehouses'] })
      if (activeWh?.id === id) setActiveWh(null)
    },
    onError: (e: any) => Taro.showToast({ title: e.message || '删除失败（可能存在关联库位）', icon: 'none' }),
  })

  const pinWh = useMutation({
    mutationFn: async ({ id, val }: { id: string; val: boolean }) => {
      const { error } = await supabase.from('warehouses').update({
        sort_order: val ? 999999 : null,
      }).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['warehouses'] })
    },
  })

  const createLoc = useMutation({
    mutationFn: async (d: LocForm) => {
      if (!d.code.trim()) throw new Error('库位编码必填')
      const { error } = await supabase.from('locations').insert({
        warehouse_id: activeWh!.id,
        code: d.code.trim(),
        zone: d.zone.trim() || null,
        rack: d.rack.trim() || null,
        level: d.level.trim() || null,
        position: d.position.trim() || null,
        description: d.description.trim() || null,
      })
      if (error) throw error
    },
    onSuccess: () => {
      Taro.showToast({ title: '创建成功', icon: 'success' })
      queryClient.invalidateQueries({ queryKey: ['locations'] })
      setLocDialog(false); setLocForm(emptyLoc); setEditingLoc(null)
    },
    onError: (e: any) => Taro.showToast({ title: e.message || '创建失败', icon: 'none' }),
  })

  const updateLoc = useMutation({
    mutationFn: async ({ id, d }: { id: string; d: LocForm }) => {
      if (!d.code.trim()) throw new Error('库位编码必填')
      const { error } = await supabase.from('locations').update({
        code: d.code.trim(),
        zone: d.zone.trim() || null,
        rack: d.rack.trim() || null,
        level: d.level.trim() || null,
        position: d.position.trim() || null,
        description: d.description.trim() || null,
      }).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      Taro.showToast({ title: '更新成功', icon: 'success' })
      queryClient.invalidateQueries({ queryKey: ['locations'] })
      setLocDialog(false); setLocForm(emptyLoc); setEditingLoc(null)
    },
    onError: (e: any) => Taro.showToast({ title: e.message || '更新失败', icon: 'none' }),
  })

  const deleteLoc = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('locations').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      Taro.showToast({ title: '删除成功', icon: 'success' })
      queryClient.invalidateQueries({ queryKey: ['locations'] })
    },
    onError: (e: any) => Taro.showToast({ title: e.message || '删除失败（可能有库存）', icon: 'none' }),
  })

  const openWh = (wh?: Warehouse) => {
    if (wh) { setEditingWh(wh); setWhForm({ code: wh.code, name: wh.name || '', address: wh.address || '' }) }
    else { setEditingWh(null); setWhForm(emptyWh) }
    setWhDialog(true)
  }
  const openLoc = (loc?: Location) => {
    if (loc) {
      setEditingLoc(loc)
      setLocForm({ code: loc.code, zone: loc.zone || '', rack: loc.rack || '', level: loc.level || '', position: loc.position || '', description: loc.description || '' })
    } else { setEditingLoc(null); setLocForm(emptyLoc) }
    setLocDialog(true)
  }
  const submitWh = () => { editingWh ? updateWh.mutate({ id: editingWh.id, d: whForm }) : createWh.mutate(whForm) }
  const submitLoc = () => { editingLoc ? updateLoc.mutate({ id: editingLoc.id, d: locForm }) : createLoc.mutate(locForm) }
  const confirmDelWh = async (wh: Warehouse) => {
    const r = await Taro.showModal({ title: '确认删除', content: `删除仓库「${wh.name || wh.code}」？将无法恢复` })
    if (r.confirm) deleteWh.mutate(wh.id)
  }
  const confirmDelLoc = async (loc: Location) => {
    const r = await Taro.showModal({ title: '确认删除', content: `删除库位「${loc.code}」？` })
    if (r.confirm) deleteLoc.mutate(loc.id)
  }

  return (
    <ScrollView scrollY style={{ minHeight: '100vh' }}>
      <View className="page-wrap">
      <View className="flex items-center justify-between mb-3">
        <Text className="text-lg font-semibold">仓库管理</Text>
        {canWrite && (
          <View className="btn btn-primary btn-sm" onClick={() => openWh()}>+ 新建仓库</View>
        )}
      </View>

      {/* 仓库列表 */}
      <View className="grid grid-cols-1 grid-gap-2 mb-4">
        {whLoading ? (
          <View className="text-center text-sm text-muted-foreground py-8">加载中...</View>
        ) : warehouses?.length === 0 ? (
          <View className="empty"><View className="empty-icon">🏪</View>
            <View className="empty-title">暂无仓库</View>
            {canWrite && <View className="empty-desc">点击右上角「新建仓库」添加</View>}
          </View>
        ) : warehouses?.map(wh => {
          const isActive = activeWh?.id === wh.id
          const pinned = wh.sort_order && wh.sort_order > 0
          return (
            <View key={wh.id} className={`card ${isActive ? 'ring-offset-2' : ''}`}
              style={isActive ? { borderColor: 'var(--ring)', boxShadow: '0 0 0 4rpx rgba(106,166,123,0.15)' } : {}}>
              <View className="card-content" style={{ padding: '20rpx 24rpx' }}>
                <View className="flex items-center gap-2" onClick={() => setActiveWh(isActive ? null : wh)}>
                  <View className="icon-box icon-box-emerald">🏭</View>
                  <View className="flex-1 min-w-0">
                    <View className="flex items-center gap-2">
                      <Text className="list-row-title truncate">{wh.name || wh.code}</Text>
                      {pinned && <Text className="badge badge-emerald">置顶</Text>}
                    </View>
                    <View className="list-row-desc">编码: {wh.code} {wh.address ? '· ' + wh.address : ''}</View>
                  </View>
                  <Text className="chevron">{isActive ? '▾' : '›'}</Text>
                </View>
                {canWrite && (
                  <View className="flex gap-2 mt-3 flex-wrap">
                    <View className="btn btn-outline btn-xs" onClick={(e) => { e.stopPropagation(); openWh(wh) }}>编辑</View>
                    <View className="btn btn-outline btn-xs" onClick={(e) => { e.stopPropagation(); pinWh.mutate({ id: wh.id, val: !pinned }) }}>
                      {pinned ? '取消置顶' : '置顶'}
                    </View>
                    <View className="btn btn-outline btn-xs" style={{ color: '#c73b38', borderColor: '#fecaca' }}
                      onClick={(e) => { e.stopPropagation(); confirmDelWh(wh) }}>删除</View>
                  </View>
                )}
              </View>
            </View>
          )
        })}
      </View>

      {/* 库位管理 */}
      {activeWh && (
        <View className="mb-4">
          <View className="flex items-center justify-between mb-2">
            <Text className="text-base font-semibold">库位 · {activeWh.name || activeWh.code}</Text>
            {canWrite && <View className="btn btn-primary btn-sm" onClick={() => openLoc()}>+ 新增库位</View>}
          </View>
          {locLoading ? (
            <View className="text-center text-sm text-muted-foreground py-8">加载中...</View>
          ) : locations?.length === 0 ? (
            <View className="empty" style={{ padding: '80rpx 24rpx' }}>
              <View className="empty-icon" style={{ fontSize: '80rpx' }}>📍</View>
              <View className="empty-title">暂无库位</View>
              {canWrite && <View className="empty-desc">点击「新增库位」添加</View>}
            </View>
          ) : (
            <View className="grid grid-cols-2 grid-gap-2">
              {locations?.map(loc => {
                const invQty = loc.inventory?.reduce((s, i) => s + Number(i.quantity || 0), 0) || 0
                const stored = loc.inventory?.[0]?.product
                return (
                  <View key={loc.id} className="card">
                    <View className="card-content" style={{ padding: '20rpx' }}>
                      <View className="flex items-center justify-between">
                        <Text className="font-mono font-semibold text-sm">{loc.code}</Text>
                        <Text className={`badge ${invQty > 0 ? 'badge-emerald' : 'badge-muted'}`}>
                          {invQty > 0 ? `${invQty}件` : '空'}
                        </Text>
                      </View>
                      {invQty > 0 && stored && (
                        <View className="text-xs text-muted-foreground mt-2 truncate">
                          {stored.name} × {invQty}
                        </View>
                      )}
                      {invQty === 0 && (
                        <View className="text-xs text-muted-foreground mt-2">空库位</View>
                      )}
                      {canWrite && (
                        <View className="flex gap-2 mt-2">
                          <View className="btn btn-outline btn-xs" onClick={() => openLoc(loc)}>编辑</View>
                          <View className="btn btn-outline btn-xs"
                            style={{ color: '#c73b38', borderColor: '#fecaca' }}
                            onClick={() => confirmDelLoc(loc)}>删除</View>
                        </View>
                      )}
                    </View>
                  </View>
                )
              })}
            </View>
          )}
        </View>
      )}

      {/* 仓库弹窗 */}
      {whDialog && (
        <View style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '40rpx' }}
          onClick={() => setWhDialog(false)}>
          <View className="card" style={{ width: '100%', maxWidth: '700rpx', maxHeight: '80vh', overflow: 'auto' }} onClick={(e) => e.stopPropagation()}>
            <View className="card-header"><Text className="card-title">{editingWh ? '编辑仓库' : '新建仓库'}</Text></View>
            <View className="card-content">
              <View className="field-wrap">
                <Text className="field-label">仓库编码 *</Text>
                <Input className="field-input" placeholder="如 WH01" value={whForm.code} onInput={(e) => setWhForm({ ...whForm, code: e.detail.value })} />
              </View>
              <View className="field-wrap">
                <Text className="field-label">仓库名称</Text>
                <Input className="field-input" placeholder="如 主仓库（可选）" value={whForm.name} onInput={(e) => setWhForm({ ...whForm, name: e.detail.value })} />
              </View>
              <View className="field-wrap">
                <Text className="field-label">地址</Text>
                <Input className="field-input" placeholder="选填" value={whForm.address} onInput={(e) => setWhForm({ ...whForm, address: e.detail.value })} />
              </View>
            </View>
            <View className="card-footer flex gap-2">
              <View className="btn btn-outline flex-1" onClick={() => setWhDialog(false)}>取消</View>
              <View className="btn btn-primary flex-1" onClick={submitWh}>保存</View>
            </View>
          </View>
        </View>
      )}

      {/* 库位弹窗 */}
      {locDialog && (
        <View style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '40rpx' }}
          onClick={() => setLocDialog(false)}>
          <View className="card" style={{ width: '100%', maxWidth: '700rpx', maxHeight: '80vh', overflow: 'auto' }} onClick={(e) => e.stopPropagation()}>
            <View className="card-header"><Text className="card-title">{editingLoc ? '编辑库位' : '新增库位'}</Text></View>
            <View className="card-content">
              <View className="field-wrap">
                <Text className="field-label">库位编码 *</Text>
                <Input className="field-input" placeholder="如 A-03-02-05（区号-架号-层号-位号）" value={locForm.code}
                  onInput={(e) => setLocForm({ ...locForm, code: e.detail.value })} />
              </View>
              <View className="grid grid-cols-2 grid-gap-2">
                <View className="field-wrap">
                  <Text className="field-label">区号</Text>
                  <Input className="field-input" placeholder="如 A" value={locForm.zone} onInput={(e) => setLocForm({ ...locForm, zone: e.detail.value })} />
                </View>
                <View className="field-wrap">
                  <Text className="field-label">架号</Text>
                  <Input className="field-input" placeholder="如 03" value={locForm.rack} onInput={(e) => setLocForm({ ...locForm, rack: e.detail.value })} />
                </View>
                <View className="field-wrap">
                  <Text className="field-label">层号</Text>
                  <Input className="field-input" placeholder="如 02" value={locForm.level} onInput={(e) => setLocForm({ ...locForm, level: e.detail.value })} />
                </View>
                <View className="field-wrap">
                  <Text className="field-label">位号</Text>
                  <Input className="field-input" placeholder="如 05" value={locForm.position} onInput={(e) => setLocForm({ ...locForm, position: e.detail.value })} />
                </View>
              </View>
              <View className="field-wrap">
                <Text className="field-label">备注描述</Text>
                <Input className="field-input" placeholder="选填" value={locForm.description} onInput={(e) => setLocForm({ ...locForm, description: e.detail.value })} />
              </View>
            </View>
            <View className="card-footer flex gap-2">
              <View className="btn btn-outline flex-1" onClick={() => setLocDialog(false)}>取消</View>
              <View className="btn btn-primary flex-1" onClick={submitLoc}>保存</View>
            </View>
          </View>
        </View>
      )}
      <View style={{ height: '60rpx' }} />
      </View>
    </ScrollView>
  )
}
