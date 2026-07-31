import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { useAuthStore } from '@/store/auth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'

export default function LoginPage() {
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [account, setAccount] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()
  const { signIn, signUp } = useAuthStore()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    try {
      if (mode === 'login') {
        await signIn(account, password)
        toast.success('登录成功')
      } else {
        await signUp(account, password, name)
        toast.success('注册成功')
      }
      navigate('/')
    } catch (err: any) {
      toast.error(err.message || '操作失败')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1">
          <CardTitle className="text-2xl text-center">进出库管理系统</CardTitle>
          <CardDescription className="text-center">
            {mode === 'login' ? '登录账号' : '注册新账号'}
          </CardDescription>
        </CardHeader>
        <form onSubmit={handleSubmit}>
          <CardContent className="space-y-4">
            {mode === 'register' && (
              <div className="space-y-2">
                <Label htmlFor="name">姓名</Label>
                <Input
                  id="name"
                  name="name"
                  autoComplete="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  placeholder="请输入姓名"
                />
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="account">手机号 / 邮箱</Label>
              <Input
                id="account"
                name="username"
                autoComplete="username"
                value={account}
                onChange={(e) => setAccount(e.target.value)}
                required
                placeholder="手机号或邮箱"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">密码</Label>
              <Input
                id="password"
                name="password"
                type="password"
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                placeholder="至少 6 位"
                minLength={6}
              />
            </div>
          </CardContent>
          <CardFooter className="flex flex-col gap-3">
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? '处理中...' : mode === 'login' ? '登录' : '注册'}
            </Button>
            <button
              type="button"
              onClick={() => setMode(mode === 'login' ? 'register' : 'login')}
              className="text-sm text-muted-foreground hover:text-primary underline"
            >
              {mode === 'login' ? '没有账号？立即注册' : '已有账号？去登录'}
            </button>
          </CardFooter>
        </form>
      </Card>
    </div>
  )
}
