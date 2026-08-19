import { useState } from 'react'
import { View, Text, Input, Button, Navigator } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import { useAuthStore } from '@/store/auth'
import './index.scss'

export default function LoginPage() {
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [account, setAccount] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [loading, setLoading] = useState(false)
  const { signIn, signUp, signInWithWx } = useAuthStore()

  useDidShow(() => {
    useAuthStore.getState().initFromStorage()
  })

  const handleSubmit = async () => {
    if (!account.trim()) return Taro.showToast({ title: '请输入账号', icon: 'none' })
    if (!password.trim()) return Taro.showToast({ title: '请输入密码', icon: 'none' })
    if (mode === 'register' && !name.trim()) return Taro.showToast({ title: '请输入姓名', icon: 'none' })
    setLoading(true)
    try {
      if (mode === 'login') {
        await signIn(account.trim(), password)
        Taro.showToast({ title: '登录成功', icon: 'success' })
      } else {
        await signUp(account.trim(), password, name.trim())
        Taro.showToast({ title: '注册成功', icon: 'success' })
      }
      setTimeout(() => Taro.switchTab({ url: '/pages/home/index' }), 300)
    } catch (err: any) {
      Taro.showToast({ title: err.message || '操作失败', icon: 'none' })
    } finally {
      setLoading(false)
    }
  }

  const handleWxLogin = async () => {
    if (loading) return
    setLoading(true)
    try {
      await signInWithWx()
      Taro.showToast({ title: '登录成功', icon: 'success' })
      setTimeout(() => Taro.switchTab({ url: '/pages/home/index' }), 300)
    } catch (err: any) {
      Taro.showToast({ title: err.message || '微信登录失败', icon: 'none' })
    } finally {
      setLoading(false)
    }
  }

  return (
    <View className="login-page">
      <View className="login-card">
        <View className="login-title">进出库管理系统</View>
        <View className="login-desc">{mode === 'login' ? '登录账号' : '注册新账号'}</View>

        {mode === 'register' && (
          <View className="field-wrap">
            <Text className="field-label">姓名</Text>
            <Input
              className="field-input"
              placeholder="请输入姓名"
              value={name}
              onInput={(e) => setName(e.detail.value)}
            />
          </View>
        )}

        <View className="field-wrap">
          <Text className="field-label">手机号 / 邮箱</Text>
          <Input
            className="field-input"
            placeholder="手机号或邮箱"
            value={account}
            onInput={(e) => setAccount(e.detail.value)}
          />
        </View>

        <View className="field-wrap">
          <Text className="field-label">密码</Text>
          <Input
            className="field-input"
            placeholder="至少 6 位"
            password
            value={password}
            onInput={(e) => setPassword(e.detail.value)}
          />
        </View>

        <Button
          className="btn btn-primary btn-block"
          disabled={loading}
          onClick={handleSubmit}
        >
          {loading ? '处理中...' : (mode === 'login' ? '登录' : '注册')}
        </Button>

        <View className="login-divider">
          <View className="login-divider-line" />
          <Text className="login-divider-text">或</Text>
          <View className="login-divider-line" />
        </View>

        <Button
          className="btn btn-wx-green btn-block"
          disabled={loading}
          onClick={handleWxLogin}
        >
          🟢 微信一键登录
        </Button>

        <View className="login-switch">
          <Text>{mode === 'login' ? '没有账号？' : '已有账号？'}</Text>
          <Text className="link" onClick={() => setMode(mode === 'login' ? 'register' : 'login')}>
            {mode === 'login' ? '立即注册' : '去登录'}
          </Text>
        </View>
      </View>
    </View>
  )
}
