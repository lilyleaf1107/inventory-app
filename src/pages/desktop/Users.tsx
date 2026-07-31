import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Users, Shield, User, UserCog, Crown } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/auth'
import type { UserRole } from '@/types'
import {
  ROLE_LABELS,
  canChangeRoleOf,
  canAssignRole,
} from '@/lib/permissions'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
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

// 可分配的角色（按等级降序）
const ASSIGNABLE_ROLES: UserRole[] = [
  'super_admin',
  'admin',
  'warehouse_manager',
  'staff',
]

export default function UsersPage() {
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
      const { error } = await supabase
        .from('profiles')
        .update({ role })
        .eq('id', id)
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
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">用户管理</h2>
          <p className="text-sm text-muted-foreground">查看和管理团队成员</p>
        </div>
      </div>

      {/* 统计 */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              总用户数
            </CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{users?.length || 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              超级管理员
            </CardTitle>
            <Crown className="h-4 w-4 text-purple-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-purple-600">
              {countByRole('super_admin')}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              管理员
            </CardTitle>
            <Shield className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{countByRole('admin')}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              库管 / 员工
            </CardTitle>
            <UserCog className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {countByRole('warehouse_manager') + countByRole('staff')}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 用户列表 */}
      <div className="rounded-md border bg-background">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>用户</TableHead>
              <TableHead>角色</TableHead>
              <TableHead>加入时间</TableHead>
              <TableHead className="text-right">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                  加载中...
                </TableCell>
              </TableRow>
            ) : users?.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                  暂无用户
                </TableCell>
              </TableRow>
            ) : (
              (users ?? []).map((u) => {
                const RoleIcon = ROLE_ICONS[u.role]
                const canChange = canChangeRoleOf(u, profile)
                return (
                  <TableRow key={u.id}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-muted">
                          <span className="text-xs font-medium">
                            {u.name?.charAt(0) || '?'}
                          </span>
                        </div>
                        <div>
                          <div className="font-medium text-sm">
                            {u.name || '未命名'}
                            {isSelf(u.id) && (
                              <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                                自己
                              </span>
                            )}
                          </div>
                          <div className="font-mono text-xs text-muted-foreground">
                            {u.id.slice(0, 8)}...
                          </div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className={`inline-flex items-center gap-1 text-sm font-medium ${ROLE_COLORS[u.role]}`}>
                        <RoleIcon className="h-3.5 w-3.5" />
                        {ROLE_LABELS[u.role]}
                      </span>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {new Date(u.created_at).toLocaleDateString('zh-CN')}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2 flex-wrap">
                        {canChange ? (
                          ASSIGNABLE_ROLES
                            .filter((r) => r !== u.role && canAssignRole(r, profile))
                            .map((r) => {
                              const Icon = ROLE_ICONS[r]
                              return (
                                <Button
                                  key={r}
                                  variant="outline"
                                  size="sm"
                                  onClick={() => openConfirm(u, r)}
                                >
                                  <Icon className="mr-1 h-3.5 w-3.5" />
                                  设为{ROLE_LABELS[r]}
                                </Button>
                              )
                            })
                        ) : u.role === 'super_admin' ? (
                          <span className="text-xs text-muted-foreground">
                            超管不可更改
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground">
                            —
                          </span>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                )
              })
            )}
          </TableBody>
        </Table>
      </div>

      {/* 确认弹窗 */}
      <Dialog open={!!confirmUser} onOpenChange={() => setConfirmUser(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>确认修改角色</DialogTitle>
            <DialogDescription>
              确定要将 <strong>{confirmUser?.name || '该用户'}</strong> 的角色改为
              <strong className="mx-1">{ROLE_LABELS[confirmRole]}</strong>吗？
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmUser(null)}>
              取消
            </Button>
            <Button
              onClick={() =>
                confirmUser &&
                updateRole.mutate({ id: confirmUser.id, role: confirmRole })
              }
              disabled={updateRole.isPending}
            >
              {updateRole.isPending ? '保存中...' : '确认'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
