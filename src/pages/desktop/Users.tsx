import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Users, Shield, User } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/auth'
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
  role: 'admin' | 'staff'
  created_at: string
}

export default function UsersPage() {
  const queryClient = useQueryClient()
  const { profile } = useAuthStore()
  const [confirmUser, setConfirmUser] = useState<UserProfile | null>(null)
  const [confirmRole, setConfirmRole] = useState<'admin' | 'staff'>('staff')

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
    mutationFn: async ({ id, role }: { id: string; role: 'admin' | 'staff' }) => {
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

  const adminCount = users?.filter((u) => u.role === 'admin').length || 0
  const isSelf = (id: string) => id === profile?.id
  const canDemote = (u: UserProfile) => {
    if (!isSelf(u.id)) return true
    if (u.role === 'admin' && adminCount <= 1) return false
    return true
  }

  const openConfirm = (u: UserProfile, role: 'admin' | 'staff') => {
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
      <div className="grid gap-4 md:grid-cols-3">
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
              管理员
            </CardTitle>
            <Shield className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{adminCount}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              员工
            </CardTitle>
            <User className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {(users?.length || 0) - adminCount}
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
              users?.map((u) => (
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
                    {u.role === 'admin' ? (
                      <span className="inline-flex items-center gap-1 text-sm font-medium text-primary">
                        <Shield className="h-3.5 w-3.5" />
                        管理员
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-sm text-muted-foreground">
                        <User className="h-3.5 w-3.5" />
                        员工
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {new Date(u.created_at).toLocaleDateString('zh-CN')}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      {u.role !== 'admin' && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => openConfirm(u, 'admin')}
                        >
                          <Shield className="mr-1 h-3.5 w-3.5" />
                          设为管理员
                        </Button>
                      )}
                      {u.role !== 'staff' && canDemote(u) && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => openConfirm(u, 'staff')}
                        >
                          <User className="mr-1 h-3.5 w-3.5" />
                          设为员工
                        </Button>
                      )}
                      {u.role === 'admin' && !canDemote(u) && (
                        <span className="text-xs text-muted-foreground">
                          至少保留一名管理员
                        </span>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))
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
              {confirmRole === 'admin' ? '管理员' : '员工'}吗？
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
