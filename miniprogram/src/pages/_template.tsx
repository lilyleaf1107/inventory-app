import { View, Text } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import { useAuthStore } from '@/store/auth'

function Placeholder({ title, icon }: { title: string; icon: string }) {
  const checkAuth = useAuthStore(s => s.checkAuth)
  useDidShow(() => {
    checkAuth()
    if (!useAuthStore.getState().user) {
      Taro.redirectTo({ url: '/pages/login/index' })
    }
  })
  return (
    <View className="container">
      <View style={{ padding: '120rpx 0', textAlign: 'center' }}>
        <View style={{ fontSize: '120rpx', marginBottom: '32rpx' }}>{icon}</View>
        <Text style={{ fontSize: '32rpx', fontWeight: '600' }}>{title}</Text>
        <View style={{ marginTop: '16rpx' }}>
          <Text className="text-sm text-muted">开发中，后续功能会逐步上线</Text>
        </View>
      </View>
    </View>
  )
}

const pages: Record<string, { title: string; icon: string }> = {
  'warehouses':   { title: '仓库管理',   icon: '🏪' },
  'stock-in':     { title: '入库',       icon: '📥' },
  'stock-out':    { title: '出库',       icon: '📤' },
  'low-stock':    { title: '低库存预警', icon: '⚠️' },
  'out-of-stock': { title: '缺货提醒',   icon: '❗' },
  'materials':    { title: '物料管理',   icon: '🧰' },
  'categories':   { title: '分类管理',   icon: '🏷️' },
}

export default function Factory(page: keyof typeof pages) {
  const cfg = pages[page]
  return () => <Placeholder title={cfg.title} icon={cfg.icon} />
}
