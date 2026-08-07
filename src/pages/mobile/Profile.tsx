import { useNavigate } from 'react-router-dom'
import { LogOut, User, Shield } from 'lucide-react'
import { useAuthStore } from '@/store/auth'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { ROLE_LABELS } from '@/lib/permissions'

export default function MobileProfile() {
  const { profile, signOut } = useAuthStore()
  const navigate = useNavigate()

  const handleSignOut = async () => {
    await signOut()
    navigate('/login')
  }

  return (
    <div className="p-4 space-y-4">
      {/* 用户信息 */}
      <Card>
        <CardContent className="p-5 flex items-center gap-4">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 flex-shrink-0">
            <User className="h-8 w-8 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-semibold text-lg truncate">{profile?.name || '未命名'}</div>
            <div className="text-sm text-muted-foreground flex items-center gap-1 mt-1">
              <Shield className="h-3.5 w-3.5" />
              {profile?.role ? ROLE_LABELS[profile.role] : '员工'}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 提示 */}
      <div className="text-center text-xs text-muted-foreground py-2">
        所有功能入口请在「首页」查看
      </div>

      {/* 退出登录 */}
      <Button
        variant="outline"
        className="w-full"
        onClick={handleSignOut}
      >
        <LogOut className="mr-2 h-4 w-4" />
        退出登录
      </Button>
    </div>
  )
}
