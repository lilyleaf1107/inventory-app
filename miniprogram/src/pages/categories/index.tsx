import { useState } from 'react'
import { View, Text, Input, ScrollView } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/auth'
import { isWarehouseManagerAbove } from '@/lib/permissions'
import type { Category } from '@/types'

interface CatForm { name: string; parent_id: string }
const emptyForm: CatForm = { name: '', parent_id: '' }

export default function Categories() {
  const profile = useAuthStore(s => s.profile)
  const checkAuth = useAuthStore(s => s.checkAuth)
  const queryClient = useQueryClient()
  const canWrite = isWarehouseManagerAbove(profile)

  const [dialog, setDialog] = useState(false)
  const [editing, setEditing] = useState<Category | null>(null)
  const [form, setForm] = useState<CatForm>(emptyForm)
  const [activeId, setActiveId] = useState<string | null>(null)

  useDidShow(() => {
    checkAuth()
    if (!useAuthStore.getState().user) Taro.redirectTo({ url: '/pages/login/index' })
  })

  const { data: categories, isLoading } = useQuery({
    queryKey: ['categories'],
    queryFn: async () => {
      const { data, error } = await supabase.from('categories').select('*')
        .order('sort_order', { ascending: false }).order('created_at', { ascending: false })
      if (error) throw error
      return data as Category[]
    },
  })

  const { data: activeProducts } = useQuery({
    queryKey: ['category-products', activeId],
    enabled: !!activeId,
    queryFn: async () => {
      const cat = categories?.find(c => c.id === activeId)
      if (!cat) return []
      const { data, error } = await supabase
        .from('products')
        .select('id, name, sku, image_path, is_material_area, inventory(id, quantity, location(id, code, warehouse(id, name, code))))')
        .eq('category', cat.name)
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data as any[]) || []
    },
  })

  const create = useMutation({
    mutationFn: async (d: CatForm) => {
      if (!d.name.trim()) throw new Error('分类名称必填')
      const { error } = await supabase.from('categories').insert({
        name: d.name.trim(),
        parent_id: d.parent_id || null,
      })
      if (error) throw error
    },
    onSuccess: () => {
      Taro.showToast({ title: '创建成功', icon: 'success' })
      queryClient.invalidateQueries({ queryKey: ['categories'] })
      setDialog(false); setForm(emptyForm); setEditing(null)
    },
    onError: (e: any) => Taro.showToast({ title: e.message || '创建失败', icon: 'none' }),
  })

  const update = useMutation({
    mutationFn: async ({ id, d }: { id: string; d: CatForm }) => {
      if (!d.name.trim()) throw new Error('分类名称必填')
      const { error } = await supabase.from('categories').update({
        name: d.name.trim(),
        parent_id: d.parent_id || null,
      }).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      Taro.showToast({ title: '更新成功', icon: 'success' })
      queryClient.invalidateQueries({ queryKey: ['categories'] })
      setDialog(false); setForm(emptyForm); setEditing(null)
    },
    onError: (e: any) => Taro.showToast({ title: e.message || '更新失败', icon: 'none' }),
  })

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('categories').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      Taro.showToast({ title: '删除成功', icon: 'success' })
      queryClient.invalidateQueries({ queryKey: ['categories'] })
      if (activeId === id) setActiveId(null)
    },
    onError: (e: any) => Taro.showToast({ title: e.message || '删除失败（可能有产品关联）', icon: 'none' }),
  })

  const open = (c?: Category) => {
    if (c) { setEditing(c); setForm({ name: c.name, parent_id: c.parent_id || '' }) }
    else { setEditing(null); setForm(emptyForm) }
    setDialog(true)
  }
  const submit = () => { editing ? update.mutate({ id: editing.id, d: form }) : create.mutate(form) }
  const confirmDel = async (c: Category) => {
    const r = await Taro.showModal({ title: '确认删除', content: `删除分类「${c.name}」？` })
    if (r.confirm) remove.mutate(c.id)
  }

  return (
    <ScrollView scrollY style={{ minHeight: '100vh' }}>
      <View className="page-wrap">
      <View className="flex items-center justify-between mb-3">
        <Text className="text-lg font-semibold">📁 分类管理</Text>
        {canWrite && <View className="btn btn-primary btn-sm" onClick={() => open()}>+ 新建分类</View>}
      </View>

      <View className="grid grid-cols-1 grid-gap-2 mb-4">
        {isLoading ? (
          <View className="text-center text-sm text-muted-foreground py-8">加载中...</View>
        ) : categories?.length === 0 ? (
          <View className="empty">
            <View className="empty-icon">🏷️</View>
            <View className="empty-title">暂无分类</View>
            {canWrite && <View className="empty-desc">点击右上角「新建分类」添加</View>}
          </View>
        ) : categories?.map(c => {
          const isActive = activeId === c.id
          return (
            <View key={c.id} className="card"
              style={isActive ? { borderColor: 'var(--ring)', boxShadow: '0 0 0 4rpx rgba(106,166,123,0.15)' } : {}}>
              <View className="card-content" style={{ padding: '20rpx 24rpx' }}>
                <View className="flex items-center gap-2" onClick={() => setActiveId(isActive ? null : c.id)}>
                  <View className="icon-box icon-box-purple">📁</View>
                  <View className="flex-1 min-w-0">
                    <View className="flex items-center gap-2">
                      <Text className="list-row-title truncate">{c.name}</Text>
                      {c.parent_id && <Text className="badge badge-muted">子分类</Text>}
                    </View>
                    <View className="list-row-desc">
                      {c.parent_id
                        ? `父分类: ${categories?.find(p => p.id === c.parent_id)?.name || '-'}`
                        : '顶级分类'}
                    </View>
                  </View>
                  <Text className="chevron">{isActive ? '▾' : '›'}</Text>
                </View>
                {canWrite && (
                  <View className="flex gap-2 mt-2">
                    <View className="btn btn-outline btn-xs" onClick={(e) => { e.stopPropagation(); open(c) }}>编辑</View>
                    <View className="btn btn-outline btn-xs" style={{ color: '#c73b38', borderColor: '#fecaca' }}
                      onClick={(e) => { e.stopPropagation(); confirmDel(c) }}>删除</View>
                  </View>
                )}
              </View>
            </View>
          )
        })}
      </View>

      {activeId && (
        <View className="mb-4">
          <Text className="text-base font-semibold mb-2 block">分类下产品</Text>
          {activeProducts?.length === 0 ? (
            <View className="empty" style={{ padding: '80rpx 24rpx' }}>
              <View className="empty-title">该分类暂无产品</View>
            </View>
          ) : (
            <View className="grid grid-cols-1 grid-gap-2">
              {activeProducts?.map(p => {
                const total = (p.inventory || []).reduce((s, i: any) => s + Number(i.quantity || 0), 0)
                return (
                  <View key={p.id} className="card">
                    <View className="card-content" style={{ padding: '20rpx 24rpx' }}>
                      <View className="flex items-center justify-between">
                        <Text className="font-medium text-sm truncate flex-1">{p.name}</Text>
                        {p.is_material_area && <Text className="badge badge-muted ml-2">物料区</Text>}
                      </View>
                      <View className="text-xs text-muted-foreground mt-1">
                        {p.sku && `SKU: ${p.sku}  `}
                        库存: <Text className="font-semibold">{p.is_material_area ? '***' : total}</Text>
                      </View>
                      {p.inventory?.length > 0 && (
                        <View className="mt-2 text-xs text-muted-foreground">
                          {p.inventory.slice(0, 3).map((i: any) => (
                            <View key={i.id}>📍 {i.location?.code || '-'} : {p.is_material_area ? '***' : i.quantity}</View>
                          ))}
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

      {dialog && (
        <View style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '40rpx' }}
          onClick={() => setDialog(false)}>
          <View className="card" style={{ width: '100%', maxWidth: '700rpx' }} onClick={(e) => e.stopPropagation()}>
            <View className="card-header"><Text className="card-title">{editing ? '编辑分类' : '新建分类'}</Text></View>
            <View className="card-content">
              <View className="field-wrap">
                <Text className="field-label">分类名称 *</Text>
                <Input className="field-input" placeholder="如 日用品" value={form.name}
                  onInput={(e) => setForm({ ...form, name: e.detail.value })} />
              </View>
              <View className="field-wrap">
                <Text className="field-label">父分类（可选）</Text>
                <View className="flex flex-wrap gap-2">
                  <View className={`btn btn-outline btn-xs ${!form.parent_id ? '' : ''}`}
                    style={!form.parent_id ? { borderColor: 'var(--ring)', color: 'var(--primary)' } : {}}
                    onClick={() => setForm({ ...form, parent_id: '' })}>无（顶级）</View>
                  {categories?.filter(c => c.id !== editing?.id).map(c => (
                    <View key={c.id} className={`btn btn-outline btn-xs`}
                      style={form.parent_id === c.id ? { borderColor: 'var(--ring)', color: 'var(--primary)' } : {}}
                      onClick={() => setForm({ ...form, parent_id: c.id })}>{c.name}</View>
                  ))}
                </View>
              </View>
            </View>
            <View className="card-footer flex gap-2">
              <View className="btn btn-outline flex-1" onClick={() => setDialog(false)}>取消</View>
              <View className="btn btn-primary flex-1" onClick={submit}>保存</View>
            </View>
          </View>
        </View>
      )}
      <View style={{ height: '60rpx' }} />
      </View>
    </ScrollView>
  )
}
