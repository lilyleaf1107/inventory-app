import { useState, useMemo } from 'react'
import { View, Text, Input, ScrollView } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/auth'
import { isWarehouseManagerAbove } from '@/lib/permissions'
import type { Material } from '@/types'

interface MatForm { name: string; spec: string }
const emptyForm: MatForm = { name: '', spec: '' }

export default function Materials() {
  const profile = useAuthStore(s => s.profile)
  const checkAuth = useAuthStore(s => s.checkAuth)
  const queryClient = useQueryClient()
  const canWrite = isWarehouseManagerAbove(profile)

  const [search, setSearch] = useState('')
  const [onlyMarked, setOnlyMarked] = useState(false)
  const [dialog, setDialog] = useState(false)
  const [editing, setEditing] = useState<Material | null>(null)
  const [form, setForm] = useState<MatForm>(emptyForm)

  useDidShow(() => {
    checkAuth()
    if (!useAuthStore.getState().user) Taro.redirectTo({ url: '/pages/login/index' })
  })

  const { data: materials, isLoading } = useQuery({
    queryKey: ['materials', search, onlyMarked],
    queryFn: async () => {
      let q = supabase.from('materials').select('*')
        .order('is_out_of_stock_marked', { ascending: false })
        .order('updated_at', { ascending: false })
      if (search) q = q.or(`name.ilike.%${search}%,spec.ilike.%${search}%`)
      if (onlyMarked) q = q.eq('is_out_of_stock_marked', true)
      const { data, error } = await q
      if (error) throw error
      return data as Material[]
    },
  })

  const counts = useMemo(() => ({
    total: materials?.length || 0,
    marked: materials?.filter(m => m.is_out_of_stock_marked).length || 0,
  }), [materials])

  const create = useMutation({
    mutationFn: async (d: MatForm) => {
      if (!d.name.trim()) throw new Error('物料名称必填')
      const { error } = await supabase.from('materials').insert({
        name: d.name.trim(),
        spec: d.spec.trim() || null,
      })
      if (error) throw error
    },
    onSuccess: () => {
      Taro.showToast({ title: '创建成功', icon: 'success' })
      queryClient.invalidateQueries({ queryKey: ['materials'] })
      setDialog(false); setForm(emptyForm); setEditing(null)
    },
    onError: (e: any) => Taro.showToast({ title: e.message || '创建失败', icon: 'none' }),
  })

  const update = useMutation({
    mutationFn: async ({ id, d }: { id: string; d: MatForm }) => {
      if (!d.name.trim()) throw new Error('物料名称必填')
      const { error } = await supabase.from('materials').update({
        name: d.name.trim(),
        spec: d.spec.trim() || null,
        updated_at: new Date().toISOString(),
      }).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      Taro.showToast({ title: '更新成功', icon: 'success' })
      queryClient.invalidateQueries({ queryKey: ['materials'] })
      setDialog(false); setForm(emptyForm); setEditing(null)
    },
    onError: (e: any) => Taro.showToast({ title: e.message || '更新失败', icon: 'none' }),
  })

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('materials').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      Taro.showToast({ title: '删除成功', icon: 'success' })
      queryClient.invalidateQueries({ queryKey: ['materials'] })
    },
    onError: (e: any) => Taro.showToast({ title: e.message || '删除失败', icon: 'none' }),
  })

  const toggleMarked = useMutation({
    mutationFn: async ({ id, val }: { id: string; val: boolean }) => {
      const { error } = await supabase.from('materials').update({
        is_out_of_stock_marked: val,
        updated_at: new Date().toISOString(),
      }).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['materials'] }),
    onError: (e: any) => Taro.showToast({ title: e.message || '操作失败', icon: 'none' }),
  })

  const open = (m?: Material) => {
    if (m) { setEditing(m); setForm({ name: m.name, spec: m.spec || '' }) }
    else { setEditing(null); setForm(emptyForm) }
    setDialog(true)
  }
  const submit = () => { editing ? update.mutate({ id: editing.id, d: form }) : create.mutate(form) }
  const confirmDel = async (m: Material) => {
    const r = await Taro.showModal({ title: '确认删除', content: `删除物料「${m.name}」？` })
    if (r.confirm) remove.mutate(m.id)
  }

  return (
    <ScrollView scrollY style={{ minHeight: '100vh' }}>
      <View className="page-wrap">
      <View className="flex items-center justify-between mb-3">
        <Text className="text-lg font-semibold">🧰 物料管理</Text>
        {canWrite && <View className="btn btn-primary btn-sm" onClick={() => open()}>+ 新建物料</View>}
      </View>

      {/* 搜索+筛选 */}
      <View className="card mb-3">
        <View className="card-content" style={{ padding: '20rpx 24rpx' }}>
          <Input className="field-input" placeholder="搜索物料名 / 规格"
            value={search} onInput={(e) => setSearch(e.detail.value)} />
          <View className="flex items-center justify-between mt-3">
            <View className="text-xs text-muted-foreground">
              共 {counts.total} 个物料，<Text className="text-red-600 font-medium">{counts.marked}</Text> 个缺货
            </View>
            <View className={`btn btn-xs ${onlyMarked ? 'btn-primary' : 'btn-outline'}`}
              onClick={() => setOnlyMarked(v => !v)}>
              {onlyMarked ? '仅看缺货中' : '显示全部'}
            </View>
          </View>
        </View>
      </View>

      <View className="grid grid-cols-1 grid-gap-2">
        {isLoading ? (
          <View className="text-center text-sm text-muted-foreground py-8">加载中...</View>
        ) : materials?.length === 0 ? (
          <View className="empty">
            <View className="empty-icon">🧰</View>
            <View className="empty-title">{onlyMarked ? '暂无缺货物料' : '暂无物料'}</View>
            {canWrite && !onlyMarked && <View className="empty-desc">点击右上角「新建物料」添加</View>}
          </View>
        ) : materials?.map(m => (
          <View key={m.id} className="card">
            <View className="card-content" style={{ padding: '20rpx 24rpx' }}>
              <View className="flex items-center justify-between">
                <View className="flex-1 min-w-0">
                  <View className="flex items-center gap-2 flex-wrap">
                    <Text className="font-medium text-sm truncate">{m.name}</Text>
                    {m.is_out_of_stock_marked ? (
                      <View className="badge badge-red">缺货</View>
                    ) : (
                      <Text className="badge badge-muted">正常</Text>
                    )}
                  </View>
                  {m.spec && <View className="text-xs text-muted-foreground mt-1">规格: {m.spec}</View>}
                </View>
                {canWrite && (
                  <View
                    className={`btn btn-xs ${m.is_out_of_stock_marked ? 'btn-outline' : 'btn-destructive'}`}
                    onClick={() => toggleMarked.mutate({ id: m.id, val: !m.is_out_of_stock_marked })}>
                    {m.is_out_of_stock_marked ? '取消缺货' : '标记缺货'}
                  </View>
                )}
              </View>
              {canWrite && (
                <View className="flex gap-2 mt-2">
                  <View className="btn btn-outline btn-xs" onClick={() => open(m)}>编辑</View>
                  <View className="btn btn-outline btn-xs"
                    style={{ color: '#c73b38', borderColor: '#fecaca' }}
                    onClick={() => confirmDel(m)}>删除</View>
                </View>
              )}
            </View>
          </View>
        ))}
      </View>

      {dialog && (
        <View style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '40rpx' }}
          onClick={() => setDialog(false)}>
          <View className="card" style={{ width: '100%', maxWidth: '700rpx' }} onClick={(e) => e.stopPropagation()}>
            <View className="card-header"><Text className="card-title">{editing ? '编辑物料' : '新建物料'}</Text></View>
            <View className="card-content">
              <View className="field-wrap">
                <Text className="field-label">物料名称 *</Text>
                <Input className="field-input" placeholder="如 打包胶带" value={form.name}
                  onInput={(e) => setForm({ ...form, name: e.detail.value })} />
              </View>
              <View className="field-wrap">
                <Text className="field-label">规格</Text>
                <Input className="field-input" placeholder="如 宽5cm / 长100m（可选）"
                  value={form.spec} onInput={(e) => setForm({ ...form, spec: e.detail.value })} />
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
