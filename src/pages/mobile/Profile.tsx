import { useNavigate } from 'react-router-dom'
import { LogOut, User, Shield, Monitor, Package, Warehouse, FolderOpen, Users, ChevronRight, AlertTriangle } from 'lucide-react'
import { useAuthStore } from '@/store/auth'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'

export default function MobileProfile() {
  const { profile, signOut } = useAuthStore()
  const navigate = useNavigate()
  const isAdmin = profile?.role === 'admin'

  const handleSignOut = async () => {
    await signOut()
    navigate('/login')
  }

  const menuItems = [
    {
      label: '缺货提醒',
      desc: '查看库存为零的商品',
      icon: AlertTriangle,
      path: '/m/out-of-stock',
      adminOnly: false,
    },
    {
      label: '产品管理',
      desc: '新增、编辑、删除产品',
      icon: Package,
      path: '/m/products',
      adminOnly: false,
    },
    {
      label: '仓库管理',
      desc: '管理仓库和库位',
      icon: Warehouse,
      path: '/m/warehouses',
      adminOnly: false,
    },
    {
      label: '分类管理',
      desc: '管理产品分类',
      icon: FolderOpen,
      path: '/m/categories',
      adminOnly: true,
    },
    {
      label: '用户管理',
      desc: '查看和管理团队成员',
      icon: Users,
      path: '/m/users',
      adminOnly: true,
    },
  ]

  return (
    <div className="p-4 space-y-4">
      {/* 用户信息 */}
      <Card>
        <CardContent className="p-4 flex items-center gap-3">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
            <User className="h-7 w-7 text-primary" />
          </div>
          <div className="flex-1">
            <div className="font-medium">{profile?.name || '未命名'}</div>
            <div className="text-sm text-muted-foreground flex items-center gap-1">
              {isAdmin ? (
                <>
                  <Shield className="h-3 w-3" />
                  管理员
                </>
              ) : (
                '员工'
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 管理功能 */}
      <Card>
        <CardContent className="p-0">
          <div className="px-4 py-3 border-b">
            <div className="text-sm font-medium">管理功能</div>
          </div>
          {menuItems
            .filter((item) => !item.adminOnly || isAdmin)
            .map((item, idx, arr) => (
              <button
                key={item.path}
                onClick={() => navigate(item.path)}
                className={`w-full flex items-center gap-3 p-4 hover:bg-muted/50 transition-colors ${
                  idx !== arr.length - 1 ? 'border-b' : ''
                }`}
              >
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
                  <item.icon className="h-5 w-5 text-primary" />
                </div>
                <div className="flex-1 text-left">
                  <div className="text-sm font-medium flex items-center gap-2">
                    {item.label}
                    {item.adminOnly && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary">
                        管理员
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground">{item.desc}</div>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </button>
            ))}
        </CardContent>
      </Card>

      {/* 切换到电脑端 */}
      <Card>
        <CardContent className="p-0">
          <button
            onClick={() => navigate('/products')}
            className="w-full flex items-center gap-3 p-4 hover:bg-muted/50 transition-colors"
          >
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted">
              <Monitor className="h-5 w-5 text-muted-foreground" />
            </div>
            <div className="flex-1 text-left">
              <div className="text-sm font-medium">切换到电脑端</div>
              <div className="text-xs text-muted-foreground">大屏完整功能体验</div>
            </div>
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          </button>
        </CardContent>
      </Card>

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
