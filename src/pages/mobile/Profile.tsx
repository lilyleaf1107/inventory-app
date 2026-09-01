import { useMemo } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { LogOut, User, Shield, ChevronRight, List, Users, Settings, BarChart3 } from 'lucide-react'
import { useAuthStore } from '@/store/auth'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { ROLE_LABELS } from '@/lib/permissions'
import { shallow } from 'zustand/shallow'

interface EntryItem {
  to: string
  label: string
  desc: string
  icon: any
  iconClass: string
  bgClass: string
  requireWrite?: boolean
  requireAdmin?: boolean
}

export default function MobileProfile() {
  const { profile, signOut, canWrite, canManageUsers } = useAuthStore(
    (s) => ({
      profile: s.profile,
      signOut: s.signOut,
      canWrite: s.canWrite,
      canManageUsers: s.canManageUsers,
    }),
    shallow,
  )
  const navigate = useNavigate()

  const handleSignOut = async () => {
    await signOut()
    navigate('/login')
  }

  const entries: EntryItem[] = useMemo(() => {
    const list: EntryItem[] = [
      {
        to: '/m/moves',
        label: '进出库记录',
        desc: '最近出入库流水',
        icon: List,
        iconClass: 'text-slate-600',
        bgClass: 'bg-slate-50',
        requireWrite: true,
      },
      {
        to: '/m/users',
        label: '用户管理',
        desc: '团队成员与权限',
        icon: Users,
        iconClass: 'text-rose-600',
        bgClass: 'bg-rose-50',
        requireAdmin: true,
      },
      {
        to: '/m/stats',
        label: '数据统计',
        desc: '出库趋势与产品排行',
        icon: BarChart3,
        iconClass: 'text-indigo-600',
        bgClass: 'bg-indigo-50',
        requireAdmin: true,
      },
      {
        to: '/m/settings',
        label: '设置',
        desc: '外观、预警、数据维护',
        icon: Settings,
        iconClass: 'text-slate-600',
        bgClass: 'bg-slate-50',
        requireAdmin: true,
      },
    ]
    return list.filter((e) => {
      if (e.requireWrite && !canWrite()) return false
      if (e.requireAdmin && !canManageUsers()) return false
      return true
    })
  }, [canWrite, canManageUsers])

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

      {/* 管理入口（由首页迁移过来） */}
      {entries.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold mb-2 px-1">管理</h2>
          <div className="grid grid-cols-1 gap-2">
            {entries.map((e) => (
              <Link key={e.to} to={e.to}>
                <Card>
                  <CardContent className="p-3 flex items-center gap-3">
                    <div className={`${e.bgClass} rounded-lg h-10 w-10 flex items-center justify-center flex-shrink-0`}>
                      <e.icon className={`h-5 w-5 ${e.iconClass}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm">{e.label}</div>
                      <div className="text-xs text-muted-foreground truncate">{e.desc}</div>
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground/60 flex-shrink-0" />
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* 退出登录 */}
      <Button variant="outline" className="w-full" onClick={handleSignOut}>
        <LogOut className="mr-2 h-4 w-4" />
        退出登录
      </Button>
    </div>
  )
}
