import { memo } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { Home, ScanLine, Search, List, User, LogOut } from 'lucide-react'
import { useAuthStore } from '@/store/auth'
import { cn } from '@/lib/utils'
import { ROLE_LABELS } from '@/lib/permissions'
import { shallow } from 'zustand/shallow'
import BackToTop from '@/components/BackToTop'

const allTabs = [
  { to: '/m', label: '首页', icon: Home, end: true, requireWrite: false },
  { to: '/m/scan', label: '扫码', icon: ScanLine, requireWrite: true },
  { to: '/m/inventory', label: '库存', icon: Search, requireWrite: false },
  { to: '/m/moves', label: '记录', icon: List, requireWrite: true },
  { to: '/m/profile', label: '我的', icon: User, requireWrite: false },
]

const MobileHeader = memo(function MobileHeader({
  name,
  roleLabel,
}: {
  name: string
  roleLabel: string
}) {
  return (
    <header className="flex h-14 items-center px-4 border-b bg-background flex-shrink-0">
      <h1 className="font-bold text-base">进出库管理</h1>
      <div className="ml-auto text-xs text-muted-foreground">
        {name} · {roleLabel}
      </div>
    </header>
  )
})

interface TabItem {
  to: string
  label: string
  icon: any
  end?: boolean
  requireWrite: boolean
}

const BottomTabs = memo(function BottomTabs({ tabs }: { tabs: TabItem[] }) {
  const tabCount = tabs.length
  return (
    <nav className="fixed bottom-0 left-0 right-0 max-w-md mx-auto border-t bg-background flex-shrink-0 pb-[env(safe-area-inset-bottom)]">
      <div className="grid" style={{ gridTemplateColumns: `repeat(${tabCount}, minmax(0, 1fr))` }}>
        {tabs.map((tab) => (
          <NavLink
            key={tab.to}
            to={tab.to}
            end={tab.end}
            className={({ isActive }) =>
              cn(
                'flex flex-col items-center gap-0.5 py-2.5',
                isActive ? 'text-primary' : 'text-muted-foreground hover:text-foreground',
              )
            }
          >
            <tab.icon className="h-5 w-5" />
            <span className="text-[10px]">{tab.label}</span>
          </NavLink>
        ))}
      </div>
    </nav>
  )
})

function MobileLayoutInner() {
  const { profile, signOut, canWrite } = useAuthStore(
    (s) => ({
      profile: s.profile,
      signOut: s.signOut,
      canWrite: s.canWrite,
    }),
    shallow,
  )
  const navigate = useNavigate()

  const handleSignOut = async () => {
    await signOut()
    navigate('/login')
  }

  const tabs = allTabs.filter((t) => !t.requireWrite || canWrite())
  const roleLabel = profile?.role ? ROLE_LABELS[profile.role] : '员工'
  const name = profile?.name || '未命名'

  return (
    <div className="flex flex-col h-screen bg-muted/30 max-w-md mx-auto">
      <MobileHeader name={name} roleLabel={roleLabel} />
      <main id="scroll-container-mobile" className="flex-1 overflow-y-auto pb-16">
        <Outlet />
      </main>
      <BottomTabs tabs={tabs} />
      {/* 🆕 一键回到顶部（全移动端页通用，位置不挡底部 tab；监听 main 才是真实滚动容器） */}
      <BackToTop mobile containerId="scroll-container-mobile" />
    </div>
  )
}

export default memo(MobileLayoutInner)
