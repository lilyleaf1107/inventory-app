import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Users,
  Shield,
  User,
  UserCog,
  Crown,
  ArrowLeft,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/auth'
import type { UserRole } from '@/types'
import {
  ROLE_LABELS,
  canChangeRoleOf,
  canAssignRole,
} from '@/lib/permissions'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

interface UserProfile {
  id: string
  name: string | null
  role: UserRole
  created_at: string
}

const ROLE_ICONS: Record<UserRole, React.ComponentType<{ className?: string }>> = {
  super_admin: Crown,
  admin: Shield,
  warehouse_manager: UserCog,
  staff: User,
}

const ROLE_COLORS: Record<UserRole, string> = {
  super_admin: 'text-purple-600',
  admin: 'text-primary',
  warehouse_manager: 'text-blue-600',
  staff: 'text-muted-foreground',
}

const ASSIGNABLE_ROLES: UserRole[] = [
  'super_admin',
  'admin',
  'warehouse_manager',
  'staff',
]

export default function MobileUsers() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { profile } = useAuthStore()
  const [confirmUser, setConfirmUser] = useState<UserProfile | null>(null)
  const [confirmRole, setConfirmRole] = useState<UserRole>('staff')

  const { data: users, isLoading } = useQuery({
    queryKey: ['profiles'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .order('created_at', { ascending: false })
      if (error) throw error
      return data as UserProfile[]
    },
  })

  const updateRole = useMutation({
    mutationFn: async ({ id, role }: { id: string; role: UserRole }) => {
      const { error } = await supabase.from('profiles').update({ role }).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['profiles'] })
      setConfirmUser(null)
    },
  })

  const countByRole = (role: UserRole) =>
    users?.filter((u) => u.role === role).length || 0

  const isSelf = (id: string) => id === profile?.id

  const openConfirm = (u: UserProfile, role: UserRole) => {
    setConfirmUser(u)
    setConfirmRole(role)
  }

  return (
    <div className="flex flex-col h-full">
      {/* 顶部栏 */}
      <div className="flex items-center gap-2 px-4 py-3 border-b bg-background flex-shrink-0">
        <button
          onClick={() => navigate(-1)}
          className="p-1.5 -ml-1.5 rounded-lg hover:bg-muted transition-colors"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <h1 className="font-bold text-base flex-1">用户管理</h1>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {/* 统计卡片 */}
        <div className="grid grid-cols-4 gap-2">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-1 px-2 pt-2">
              <CardTitle className="text-[10px] font-medium text-muted-foreground">
              总数
              </CardTitle>
              <Users className="h-3 w-3 text-muted-foreground" />
            </CardHeader>
            <CardContent className="px-2 pb-2 pt-0">
              <div className="text-base font-bold">{users?.length || 0}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-1 px-2 pt-2">
              <CardTitle className="text-[10px] font-medium text-muted-foreground">
              超管
              </CardTitle>
              <Crown className="h-3 w-3 text-purple-500" />
            </CardHeader>
            <CardContent className="px-2 pb-2 pt-0">
              <div className="text-base font-bold text-purple-600">
                {countByRole('super_admin')}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-1 px-2 pt-2">
              <CardTitle className="text-[10px] font-medium text-muted-foreground">
              管理员
              </CardTitle>
              <Shield className="h-3 w-3 text-muted-foreground" />
            </CardHeader>
            <CardContent className="px-2 pb-2 pt-0">
              <div className="text-base font-bold">{countByRole('admin')}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-1 px-2 pt-2">
              <CardTitle className="text-[10px] font-medium text-muted-foreground">
              库管/员工
              </CardTitle>
              <UserCog className="h-3 w-3 text-muted-foreground" />
            </CardHeader>
            <CardContent className="px-2 pb-2 pt-0">
              <div className="text-base font-bold">
                {countByRole('warehouse_manager') + countByRole('staff')}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* 用户列表 */}
        <div className="space-y-2">
          {isLoading ? (
            <div className="text-center py-12 text-muted-foreground text-sm">加载中...</div>
          ) : (users?.length || 0) === 0 ? (
            <div className="text-center py-12 text-muted-foreground text-sm">暂无用户</div>
          ) : (
            (users ?? []).map((u) => {
              const RoleIcon = ROLE_ICONS[u.role]
              const canChange = canChangeRoleOf(u, profile)
              const availableRoles = ASSIGNABLE_ROLES.filter(
                (r) => r !== u.role && canAssignRole(r, profile),
              )
              return (
                <Card key={u.id}>
                  <CardContent className="p-3">
                    <div className="flex items-start gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 flex-shrink-0">
                        <span className="text-sm font-medium text-primary">
                          {u.name?.charAt(0) || '?'}
                        </span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-sm">{u.name || '未命名'}</span>
                          {isSelf(u.id) && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                              自己
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-1 mt-0.5">
                          <span className={`inline-flex items-center gap-1 text-xs font-medium ${ROLE_COLORS[u.role]}`}>
                            <RoleIcon className="h-3 w-3" />
                            {ROLE_LABELS[u.role]}
                          </span>
                          <span className="text-xs text-muted-foreground ml-2">
                            {new Date(u.created_at).toLocaleDateString('zh-CN')}
                          </span>
                        </div>
                      </div>
                    </div>
                    {canChange && availableRoles.length > 0 && (
                      <div className="mt-3 pt-3 border-t flex items-center justify-end gap-2 flex-wrap">
                        {availableRoles.map((r) => {
                          const Icon = ROLE_ICONS[r]
                          return (
                            <Button
                              key={r}
                              variant="outline"
                              size="sm"
                              onClick={() => openConfirm(u, r)}
                              className="h-8"
                            >
                              <Icon className="mr-1 h-3.5 w-3.5" />
                              {ROLE_LABELS[r]}
                            </Button>
                          )
                        })}
                      </div>
                    )}
                    {!canChange && u.role === 'super_admin' && (
                      <div className="mt-3 pt-3 border-t flex items-center justify-end">
                        <span className="text-xs text-muted-foreground">超管不可更改</span>
                      </div>
                    )}
                  </CardContent>
                </Card>
              )
            })
          )}
        </div>
      </div>

      {/* 确认弹窗 */}
      <Dialog open={!!confirmUser} onOpenChange={() => setConfirmUser(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>确认修改角色</DialogTitle>
            <DialogDescription>
              确定要将 <strong>{confirmUser?.name || '该用户'}</strong> 的角色改为
              <strong className="mx-1">{ROLE_LABELS[confirmRole]}</strong>吗？
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmUser(null)} size="sm">
              取消
            </Button>
            <Button
              onClick={() =>
                confirmUser &&
                updateRole.mutate({ id: confirmUser.id, role: confirmRole })
              }
              disabled={updateRole.isPending}
              size="sm"
            >
              {updateRole.isPending ? '保存中...' : '确认'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
