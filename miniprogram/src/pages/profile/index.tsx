import { View, Text, Button } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import { useAuthStore } from '@/store/auth'
import { ROLE_LABELS } from '@/lib/permissions'

export default function Profile() {
  const profile = useAuthStore(s => s.profile)
  const user = useAuthStore(s => s.user)
  const signOut = useAuthStore(s => s.signOut)
  const bindWx = useAuthStore(s => s.bindWx)
  const wxOpenid = useAuthStore(s => s.wxOpenid)
  const checkAuth = useAuthStore(s => s.checkAuth)

  useDidShow(() => { checkAuth() })

  const doLogout = async () => {
    const res = await Taro.showModal({
      title: '确认退出？',
      content: '退出后需要重新登录',
    })
    if (!res.confirm) return
    await signOut()
    Taro.redirectTo({ url: '/pages/login/index' })
  }

  const doBindWx = async () => {
    if (!wxOpenid) {
      Taro.showToast({ title: '微信身份获取失败，请重启小程序', icon: 'none' })
      return
    }
    try {
      await bindWx()
      Taro.showToast({ title: '绑定成功', icon: 'success' })
    } catch (e: any) {
      Taro.showToast({ title: '失败:' + e.message, icon: 'none' })
    }
  }

  if (!user || !profile) {
    return (
      <View style={{ padding: '200rpx 0', textAlign: 'center' }}>
        <Text className="text-muted">未登录</Text>
      </View>
    )
  }

  return (
    <View className="container">
      <View className="card" style={{ padding: '32rpx' }}>
        <View className="row-between">
          <View className="row gap-m">
            <View style={{
              width: '120rpx', height: '120rpx', borderRadius: '60rpx',
              background: '#dcfce7', display: 'flex', alignItems: 'center',
              justifyContent: 'center', fontSize: '56rpx',
            }}>👤</View>
            <View>
              <Text style={{ fontSize: '34rpx', fontWeight: '700' }}>
                {profile.name || '未设置姓名'}
              </Text>
              <View style={{ marginTop: '10rpx' }}>
                <Text className="tag tag-green">{ROLE_LABELS[profile.role as keyof typeof ROLE_LABELS] || profile.role || '未设置角色'}</Text>
              </View>
              <Text className="text-sm text-muted" style={{ marginTop: '8rpx' }}>
                {user.email}
              </Text>
            </View>
          </View>
        </View>
      </View>

      <View className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <View className="item-line" style={{ padding: '24rpx 28rpx' }}>
          <Text>微信绑定</Text>
          <View style={{ marginLeft: 'auto' }}>
            {profile.wx_openid ? (
              <Text className="tag tag-green">已绑定</Text>
            ) : (
              <Text className="tag tag-gray" onClick={doBindWx}>
                点击绑定
              </Text>
            )}
          </View>
        </View>
      </View>

      <View style={{ marginTop: '48rpx' }}>
        <Button className="btn-ghost" style={{ color: '#dc2626', borderColor: '#fecaca' }} onClick={doLogout}>
          退出登录
        </Button>
      </View>

      <View style={{ textAlign: 'center', marginTop: '48rpx' }}>
        <Text className="text-sm text-muted">库存管理小程序 v1.0.0</Text>
      </View>
    </View>
  )
}
