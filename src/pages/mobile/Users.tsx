import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Users,
  Shield,
  User,
  ArrowLeft,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/auth'
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
  role: 'admin' | 'staff'
  created_at: string
}

export default function MobileUsers() {
  const navigate = useNavigate()
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
      const { error } = await supabase.from('profiles').update({ role }).eq('id', id)
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
        <div className="grid grid-cols-3 gap-2">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-1 px-3 pt-3">
              <CardTitle className="text-[11px] font-medium text-muted-foreground">
              总用户数
              </CardTitle>
              <Users className="h-3.5 w-3.5 text-muted-foreground" />
            </CardHeader>
            <CardContent className="px-3 pb-3 pt-0">
              <div className="text-lg font-bold">{users?.length || 0}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-1 px-3 pt-3">
              <CardTitle className="text-[11px] font-medium text-muted-foreground">
              管理员
              </CardTitle>
              <Shield className="h-3.5 w-3.5 text-muted-foreground" />
            </CardHeader>
            <CardContent className="px-3 pb-3 pt-0">
              <div className="text-lg font-bold">{adminCount}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-1 px-3 pt-3">
              <CardTitle className="text-[11px] font-medium text-muted-foreground">
              员工
              </CardTitle>
              <User className="h-3.5 w-3.5 text-muted-foreground" />
            </CardHeader>
            <CardContent className="px-3 pb-3 pt-0">
              <div className="text-lg font-bold">{(users?.length || 0) - adminCount}</div>
            </CardContent>
          </Card>
        </div>

        {/* 用户列表 */}
        <div className="space-y-2">
          {isLoading ? (
            <div className="text-center py-12 text-muted-foreground text-sm">加载中...</div>
          ) : users?.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground text-sm">暂无用户</div>
          ) : (
            users?.map((u) => (
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
                        {u.role === 'admin' ? (
                          <span className="inline-flex items-center gap-1 text-xs font-medium text-primary">
                            <Shield className="h-3 w-3" />
                            管理员
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                            <User className="h-3 w-3" />
                            员工
                          </span>
                        )}
                        <span className="text-xs text-muted-foreground ml-2">
                          {new Date(u.created_at).toLocaleDateString('zh-CN')}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="mt-3 pt-3 border-t flex items-center justify-end gap-2">
                    {u.role !== 'admin' && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => openConfirm(u, 'admin')}
                        className="h-8"
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
                        className="h-8"
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
                </CardContent>
              </Card>
            ))
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
              {confirmRole === 'admin' ? '管理员' : '员工'}吗？
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
