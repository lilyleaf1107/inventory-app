import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { Home, ScanLine, Search, List, User, LogOut } from 'lucide-react'
import { useAuthStore } from '@/store/auth'
import { cn } from '@/lib/utils'
import { ROLE_LABELS } from '@/lib/permissions'

const allTabs = [
  { to: '/m', label: '首页', icon: Home, end: true, requireWrite: false },
  { to: '/m/scan', label: '扫码', icon: ScanLine, requireWrite: true },
  { to: '/m/inventory', label: '库存', icon: Search, requireWrite: false },
  { to: '/m/moves', label: '记录', icon: List, requireWrite: true },
  { to: '/m/profile', label: '我的', icon: User, requireWrite: false },
]

export default function MobileLayout() {
  const { profile, signOut, canWrite } = useAuthStore()
  const navigate = useNavigate()

  const handleSignOut = async () => {
    await signOut()
    navigate('/login')
  }

  // 员工（无写入权限）不可见扫码和记录
  const tabs = allTabs.filter((t) => !t.requireWrite || canWrite())
  const tabCount = tabs.length

  return (
    <div className="flex flex-col h-screen bg-muted/30 max-w-md mx-auto">
      {/* 顶部标题栏 */}
      <header className="flex h-14 items-center px-4 border-b bg-background flex-shrink-0">
        <h1 className="font-bold text-base">进出库管理</h1>
        <div className="ml-auto text-xs text-muted-foreground">
          {profile?.name || '未命名'} · {profile?.role ? ROLE_LABELS[profile.role] : '员工'}
        </div>
      </header>

      {/* 内容区 */}
      <main className="flex-1 overflow-y-auto pb-16">
        <Outlet />
      </main>

      {/* 底部 Tab */}
      <nav className="fixed bottom-0 left-0 right-0 max-w-md mx-auto border-t bg-background flex-shrink-0 pb-[env(safe-area-inset-bottom)]">
        <div className="grid" style={{ gridTemplateColumns: `repeat(${tabCount}, minmax(0, 1fr))` }}>
          {tabs.map((tab) => (
            <NavLink
              key={tab.to}
              to={tab.to}
              end={tab.end}
              className={({ isActive }) =>
                cn(
                  'flex flex-col items-center gap-0.5 py-2.5 transition-colors',
                  isActive
                    ? 'text-primary'
                    : 'text-muted-foreground hover:text-foreground',
                )
              }
            >
              <tab.icon className="h-5 w-5" />
              <span className="text-[10px]">{tab.label}</span>
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  )
}
