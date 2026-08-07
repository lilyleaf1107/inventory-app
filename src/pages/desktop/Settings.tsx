import { useState, useEffect, useCallback } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  Settings as SettingsIcon,
  Palette,
  Gauge,
  Sliders,
  Database,
  Coins,
  Info,
  Check,
  Download,
  Trash2,
  RotateCcw,
  RotateCw,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import {
  getSettings,
  saveSettings,
  resetSettings,
  applyTheme,
  downloadCSV,
  type AppSettings,
  type ThemeName,
  THEMES,
} from '@/lib/settings'
import { useAuthStore } from '@/store/auth'
import { ROLE_LABELS } from '@/lib/permissions'
import type { UserRole } from '@/types'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'

export default function SettingsPage() {
  const { isSuperAdmin, canManageUsers } = useAuthStore()
  const queryClient = useQueryClient()
  const [settings, setSettings] = useState<AppSettings>(() => getSettings())

  // 仓库列表
  const { data: warehouses } = useQuery({
    queryKey: ['warehouses'],
    queryFn: async () => {
      const { data, error } = await supabase.from('warehouses').select('*').order('name')
      if (error) throw error
      return data
    },
  })

  const update = useCallback((patch: Partial<AppSettings>) => {
    const next = saveSettings(patch)
    setSettings(next)
    // 阈值变更后刷新库存相关查询
    if (patch.lowStockWarning !== undefined || patch.lowStockDanger !== undefined || patch.lowStockCritical !== undefined) {
      queryClient.invalidateQueries({ queryKey: ['low-stock'] })
      queryClient.invalidateQueries({ queryKey: ['inventory'] })
    }
  }, [queryClient])

  // ========== 外观 ==========
  const handleThemeChange = (theme: ThemeName) => {
    applyTheme(theme)
    update({ theme })
  }

  // ========== 预警配置 ==========
  const handleThresholdSave = () => {
    const { lowStockWarning, lowStockDanger, lowStockCritical } = settings
    if (lowStockCritical > lowStockDanger || lowStockDanger > lowStockWarning) {
      toast.error('阈值需满足：红色 ≤ 橙色 ≤ 黄色')
      return
    }
    if (lowStockCritical < 0 || lowStockDanger < 0 || lowStockWarning < 0) {
      toast.error('阈值不能为负数')
      return
    }
    update({ lowStockWarning, lowStockDanger, lowStockCritical })
    toast.success('预警阈值已保存')
  }

  // ========== 数据维护 ==========
  const handleExportInventory = async () => {
    try {
      const { data, error } = await supabase
        .from('inventory')
        .select(`
          quantity, batch_no,
          product:products ( name, sku, barcode, unit ),
          location:locations ( code, warehouse:warehouses ( name ) )
        `)
        .order('quantity')
      if (error) throw error
      const rows: (string | number)[][] = [['产品名称', 'SKU', '条码', '仓库', '库位', '数量', '单位', '批次']]
      for (const item of data || []) {
        const p: any = item.product
        const l: any = item.location
        rows.push([
          p?.name || '', p?.sku || '', p?.barcode || '',
          l?.warehouse?.name || '', l?.code || '',
          item.quantity, p?.unit || '', item.batch_no || '',
        ])
      }
      downloadCSV(`库存导出_${new Date().toISOString().slice(0, 10)}.csv`, rows)
      toast.success('库存已导出')
    } catch (err: any) {
      toast.error(err.message || '导出失败')
    }
  }

  const handleResetSidebar = () => {
    localStorage.removeItem('sidebar-nav-order')
    toast.success('侧边栏顺序已重置，刷新页面生效')
  }

  const handleClearCache = () => {
    queryClient.clear()
    localStorage.removeItem('device:is-mobile')
    toast.success('缓存已清理，正在刷新...')
    setTimeout(() => window.location.reload(), 800)
  }

  const handleResetAll = () => {
    if (!confirm('确定重置所有设置为默认值？此操作不可撤销。')) return
    const next = resetSettings()
    setSettings(next)
    toast.success('设置已重置为默认值')
  }

  // ========== 成本可见角色 ==========
  const allRoles: UserRole[] = ['super_admin', 'admin', 'warehouse_manager', 'staff']
  const toggleRole = (role: UserRole) => {
    const current = settings.costVisibleRoles
    const next = current.includes(role)
      ? current.filter((r) => r !== role)
      : [...current, role]
    update({ costVisibleRoles: next })
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <SettingsIcon className="h-6 w-6" />
          设置
        </h2>
        <p className="text-sm text-muted-foreground mt-1">外观、预警阈值、数据维护等全局配置</p>
      </div>

      {/* ========== 外观 ========== */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Palette className="h-5 w-5" />
            外观
          </CardTitle>
          <CardDescription>选择清新低明度的配色方案</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            {THEMES.map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => handleThemeChange(t.key)}
                className={cn(
                  'relative flex flex-col items-center gap-2 rounded-lg border-2 p-4 transition-all hover:shadow-md',
                  settings.theme === t.key
                    ? 'border-primary ring-2 ring-primary/20'
                    : 'border-border',
                )}
              >
                <div
                  className="h-12 w-12 rounded-full border-2 border-white shadow-sm"
                  style={{ backgroundColor: t.swatch }}
                />
                <div className="text-sm font-medium">{t.label}</div>
                <div className="text-xs text-muted-foreground">{t.desc}</div>
                {settings.theme === t.key && (
                  <div className="absolute top-2 right-2 h-5 w-5 rounded-full bg-primary text-primary-foreground flex items-center justify-center">
                    <Check className="h-3 w-3" />
                  </div>
                )}
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* ========== 预警配置 ========== */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Gauge className="h-5 w-5" />
            低库存预警配置
          </CardTitle>
          <CardDescription>设置三级预警阈值，库存 ≤ 对应值时显示对应颜色</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <span className="inline-block h-3 w-3 rounded-full bg-red-500" />
                红色预警 ≤
              </Label>
              <Input
                type="number"
                min="0"
                value={settings.lowStockCritical}
                onChange={(e) =>
                  setSettings((s) => ({ ...s, lowStockCritical: parseInt(e.target.value) || 0 }))
                }
              />
              <p className="text-xs text-muted-foreground">最紧急，需立即补货</p>
            </div>
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <span className="inline-block h-3 w-3 rounded-full bg-orange-500" />
                橙色预警 ≤
              </Label>
              <Input
                type="number"
                min="0"
                value={settings.lowStockDanger}
                onChange={(e) =>
                  setSettings((s) => ({ ...s, lowStockDanger: parseInt(e.target.value) || 0 }))
                }
              />
              <p className="text-xs text-muted-foreground">需要关注，建议补货</p>
            </div>
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <span className="inline-block h-3 w-3 rounded-full bg-yellow-500" />
                黄色预警 ≤
              </Label>
              <Input
                type="number"
                min="0"
                value={settings.lowStockWarning}
                onChange={(e) =>
                  setSettings((s) => ({ ...s, lowStockWarning: parseInt(e.target.value) || 0 }))
                }
              />
              <p className="text-xs text-muted-foreground">提前预警，留意库存</p>
            </div>
          </div>
          <div className="flex gap-2 pt-2">
            <Button onClick={handleThresholdSave}>
              <Check className="mr-2 h-4 w-4" />
              保存阈值
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* ========== 通用设置 ========== */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Sliders className="h-5 w-5" />
            通用设置
          </CardTitle>
          <CardDescription>日常操作偏好，减少重复点击</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>默认仓库</Label>
              <select
                value={settings.defaultWarehouseId}
                onChange={(e) => update({ defaultWarehouseId: e.target.value })}
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm"
              >
                <option value="">不指定</option>
                {warehouses?.map((w: any) => (
                  <option key={w.id} value={w.id}>
                    {w.name || w.code}
                  </option>
                ))}
              </select>
              <p className="text-xs text-muted-foreground">入库页面默认选中此仓库</p>
            </div>
            <div className="space-y-2">
              <Label>入库数量步长</Label>
              <Input
                type="number"
                min="1"
                value={settings.stockInStep}
                onChange={(e) => update({ stockInStep: parseInt(e.target.value) || 1 })}
              />
              <p className="text-xs text-muted-foreground">数量输入框的增减步长</p>
            </div>
            <div className="space-y-2">
              <Label>扫码枪最小长度</Label>
              <Input
                type="number"
                min="1"
                value={settings.scannerMinLength}
                onChange={(e) => update({ scannerMinLength: parseInt(e.target.value) || 4 })}
              />
              <p className="text-xs text-muted-foreground">短于此长度的输入不触发扫码</p>
            </div>
            <div className="space-y-2">
              <Label>扫码枪按键间隔(ms)</Label>
              <Input
                type="number"
                min="10"
                value={settings.scannerMaxInterval}
                onChange={(e) => update({ scannerMaxInterval: parseInt(e.target.value) || 50 })}
              />
              <p className="text-xs text-muted-foreground">超过此间隔视为新一次扫码</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ========== 成本权限 ========== */}
      {canManageUsers() && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Coins className="h-5 w-5" />
              成本可见角色
            </CardTitle>
            <CardDescription>勾选可查看和修改产品成本的角色</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-3">
              {allRoles.map((role) => (
                <button
                  key={role}
                  type="button"
                  onClick={() => toggleRole(role)}
                  className={cn(
                    'flex items-center gap-2 rounded-lg border-2 px-4 py-2 text-sm font-medium transition-all',
                    settings.costVisibleRoles.includes(role)
                      ? 'border-primary bg-primary/5 text-primary'
                      : 'border-border text-muted-foreground hover:border-primary/50',
                  )}
                >
                  <div
                    className={cn(
                      'h-4 w-4 rounded border-2 flex items-center justify-center',
                      settings.costVisibleRoles.includes(role)
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'border-muted-foreground/30',
                    )}
                  >
                    {settings.costVisibleRoles.includes(role) && <Check className="h-2.5 w-2.5" />}
                  </div>
                  {ROLE_LABELS[role]}
                </button>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ========== 数据维护 ========== */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Database className="h-5 w-5" />
            数据维护
          </CardTitle>
          <CardDescription>导出数据、重置偏好、清理缓存</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={handleExportInventory}>
              <Download className="mr-2 h-4 w-4" />
              导出库存 CSV
            </Button>
            <Button variant="outline" onClick={handleResetSidebar}>
              <RotateCcw className="mr-2 h-4 w-4" />
              重置侧边栏顺序
            </Button>
            <Button variant="outline" onClick={handleClearCache}>
              <RotateCw className="mr-2 h-4 w-4" />
              清理缓存并刷新
            </Button>
            {isSuperAdmin() && (
              <Button variant="outline" onClick={handleResetAll} className="text-destructive">
                <Trash2 className="mr-2 h-4 w-4" />
                重置所有设置
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* ========== 关于 ========== */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Info className="h-5 w-5" />
            关于
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">版本</span>
            <span className="font-mono">v0.2.0</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">当前外观</span>
            <span>{THEMES.find((t) => t.key === settings.theme)?.label || '墨石'}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">数据刷新时间</span>
            <span className="font-mono">{new Date().toLocaleString('zh-CN')}</span>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
