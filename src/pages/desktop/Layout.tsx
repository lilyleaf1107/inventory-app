import { useState } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard,
  Package,
  FolderOpen,
  Warehouse,
  ArrowDownToLine,
  ArrowUpFromLine,
  Search,
  List,
  Users,
  Settings,
  LogOut,
  Menu,
  X,
  AlertTriangle,
  Gauge,
  Boxes,
  BarChart3,
} from 'lucide-react'
import { useAuthStore } from '@/store/auth'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useOutOfStock } from '@/hooks/useOutOfStock'
import { useLowStockCount } from '@/hooks/useLowStock'
import { ROLE_LABELS } from '@/lib/permissions'
import BackToTop from '@/components/BackToTop'

interface NavItem {
  to: string
  label: string
  icon: React.ComponentType<{ className?: string }>
  disabled?: boolean
  badge?: number
  requireWrite?: boolean // 库管及以上才可见
}

const navItems: NavItem[] = [
  { to: '/dashboard', label: '工作台', icon: LayoutDashboard },
  { to: '/products', label: '产品管理', icon: Package },
  { to: '/materials', label: '物料管理', icon: Boxes },
  { to: '/categories', label: '分类管理', icon: FolderOpen },
  { to: '/warehouses', label: '仓库管理', icon: Warehouse },
  { to: '/stock-in', label: '入库', icon: ArrowDownToLine, requireWrite: true },
  { to: '/stock-out', label: '出库', icon: ArrowUpFromLine, requireWrite: true },
  { to: '/inventory', label: '库存查询', icon: Search },
  { to: '/out-of-stock', label: '缺货提醒', icon: AlertTriangle },
  { to: '/low-stock', label: '低库存预警', icon: Gauge },
  { to: '/moves', label: '进出库记录', icon: List, requireWrite: true },
]

const adminItems: NavItem[] = [
  { to: '/users', label: '用户管理', icon: Users },
  { to: '/stats', label: '数据统计', icon: BarChart3 },
  { to: '/settings', label: '设置', icon: Settings },
]

const STORAGE_KEY = 'sidebar-nav-order'

export default function DesktopLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const { profile, signOut, canManageUsers, canWrite } = useAuthStore()
  const navigate = useNavigate()
  const { data: outOfStockItems } = useOutOfStock()
  const outOfStockCount = outOfStockItems?.length || 0
  const lowStockCount = useLowStockCount()

  // 侧边栏拖拽排序：从 localStorage 读取自定义顺序
  const [navItemsOrdered, setNavItemsOrdered] = useState<NavItem[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      if (saved) {
        const savedOrder: string[] = JSON.parse(saved)
        const ordered = savedOrder
          .map((to) => navItems.find((i) => i.to === to))
          .filter(Boolean) as NavItem[]
        const missing = navItems.filter((i) => !savedOrder.includes(i.to))
        return [...ordered, ...missing]
      }
    } catch {
      // ignore
    }
    return navItems
  })
  // 根据权限过滤可见项（员工不可见入库/出库/进出库记录）
  const visibleItems = navItemsOrdered.filter(
    (item) => !item.requireWrite || canWrite(),
  )
  const [dragIndex, setDragIndex] = useState<number | null>(null)

  const handleDragStart = (index: number) => setDragIndex(index)
  const handleDragOver = (e: React.DragEvent) => e.preventDefault()
  const handleDrop = (index: number) => {
    if (dragIndex === null || dragIndex === index) {
      setDragIndex(null)
      return
    }
    setNavItemsOrdered((prev) => {
      const next = [...prev]
      const [dragged] = next.splice(dragIndex, 1)
      next.splice(index, 0, dragged)
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next.map((i) => i.to)))
      return next
    })
    setDragIndex(null)
  }

  const handleSignOut = async () => {
    await signOut()
    navigate('/login')
  }

  return (
    <div className="flex h-screen bg-muted/30">
      {/* Sidebar */}
      <aside
        className={cn(
          'flex flex-col border-r bg-background transition-all duration-200',
          sidebarOpen ? 'w-60' : 'w-0 overflow-hidden',
        )}
      >
        <div className="flex h-14 items-center px-4 border-b">
          <h1 className="font-bold text-lg">进出库管理</h1>
        </div>
        <nav className="flex-1 space-y-1 p-2 overflow-y-auto">
          {visibleItems.map((item, index) => (
            <NavLink
              key={item.to}
              to={item.disabled ? '#' : item.to}
              onClick={(e) => item.disabled && e.preventDefault()}
              draggable
              onDragStart={() => handleDragStart(index)}
              onDragOver={handleDragOver}
              onDrop={() => handleDrop(index)}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors cursor-grab active:cursor-grabbing',
                  dragIndex === index && 'opacity-40',
                  isActive && !item.disabled
                    ? 'bg-primary text-primary-foreground'
                    : 'hover:bg-muted',
                  item.disabled && 'opacity-50 cursor-not-allowed',
                )
              }
            >
              <item.icon className="h-4 w-4" />
              <span className="flex-1">{item.label}</span>
              {item.to === '/out-of-stock' && outOfStockCount > 0 && (
                <span className="inline-flex items-center justify-center h-5 min-w-[1.25rem] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold">
                  {outOfStockCount > 99 ? '99+' : outOfStockCount}
                </span>
              )}
              {item.to === '/low-stock' && lowStockCount.total > 0 && (
                <span className="inline-flex items-center justify-center h-5 min-w-[1.25rem] px-1 rounded-full bg-orange-500 text-white text-[10px] font-bold">
                  {lowStockCount.total > 99 ? '99+' : lowStockCount.total}
                </span>
              )}
            </NavLink>
          ))}

          {canManageUsers() && (
            <>
              <div className="mt-6 mb-2 px-3 text-xs font-medium text-muted-foreground">
                管理员
              </div>
              {adminItems.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={({ isActive }) =>
                    cn(
                      'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                      isActive
                        ? 'bg-primary text-primary-foreground'
                        : 'hover:bg-muted',
                    )
                  }
                >
                  <item.icon className="h-4 w-4" />
                  {item.label}
                </NavLink>
              ))}
            </>
          )}
        </nav>
        <div className="border-t p-3 space-y-2">
          <div className="flex items-center gap-3 px-2 py-1">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-muted">
              <span className="text-xs font-medium">
                {profile?.name?.charAt(0) || '?'}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">
                {profile?.name || '未命名'}
              </p>
              <p className="text-xs text-muted-foreground">
                {profile?.role ? ROLE_LABELS[profile.role] : '员工'}
              </p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start"
            onClick={handleSignOut}
          >
            <LogOut className="h-4 w-4 mr-2" />
            退出登录
          </Button>
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="flex h-14 items-center gap-4 border-b bg-background px-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setSidebarOpen(!sidebarOpen)}
          >
            {sidebarOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
          </Button>
          <div className="font-medium">
            工作台
          </div>
        </header>
        <main id="scroll-container" className="flex-1 overflow-y-auto p-6">
          <Outlet />
        </main>
      </div>
      {/* 🆕 一键回到顶部（监听 main#scroll-container，因为 main 才是真正的滚动容器） */}
      <BackToTop containerId="scroll-container" />
    </div>
  )
}
