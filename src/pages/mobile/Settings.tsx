import { useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  ArrowLeft,
  Palette,
  Gauge,
  Sliders,
  Database,
  Coins,
  Info,
  Check,
  Download,
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
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'

export default function MobileSettings() {
  const navigate = useNavigate()
  const { isSuperAdmin, canManageUsers } = useAuthStore()
  const queryClient = useQueryClient()
  const [settings, setSettings] = useState<AppSettings>(() => getSettings())

  const { data: warehouses } = useQuery({
    queryKey: ['warehouses'],
    queryFn: async () => {
      const { data, error } = await supabase.from('warehouses').select('*').order('name')
      if (error) throw error
      return data
    },
  })

  const update = useCallback(
    (patch: Partial<AppSettings>) => {
      const next = saveSettings(patch)
      setSettings(next)
      if (
        patch.lowStockWarning !== undefined ||
        patch.lowStockDanger !== undefined ||
        patch.lowStockCritical !== undefined
      ) {
        queryClient.invalidateQueries({ queryKey: ['low-stock'] })
        queryClient.invalidateQueries({ queryKey: ['inventory'] })
      }
    },
    [queryClient],
  )

  const handleThemeChange = (theme: ThemeName) => {
    applyTheme(theme)
    update({ theme })
  }

  const handleThresholdSave = () => {
    const { lowStockWarning, lowStockDanger, lowStockCritical } = settings
    if (lowStockCritical > lowStockDanger || lowStockDanger > lowStockWarning) {
      toast.error('阈值需满足：红色 ≤ 橙色 ≤ 黄色')
      return
    }
    update({ lowStockWarning, lowStockDanger, lowStockCritical })
    toast.success('预警阈值已保存')
  }

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
      const rows: (string | number)[][] = [
        ['产品名称', 'SKU', '条码', '仓库', '库位', '数量', '单位', '批次'],
      ]
      for (const item of data || []) {
        const p: any = item.product
        const l: any = item.location
        rows.push([
          p?.name || '',
          p?.sku || '',
          p?.barcode || '',
          l?.warehouse?.name || '',
          l?.code || '',
          item.quantity,
          p?.unit || '',
          item.batch_no || '',
        ])
      }
      downloadCSV(`库存导出_${new Date().toISOString().slice(0, 10)}.csv`, rows)
      toast.success('库存已导出')
    } catch (err: any) {
      toast.error(err.message || '导出失败')
    }
  }

  const handleClearCache = () => {
    queryClient.clear()
    localStorage.removeItem('device:is-mobile')
    toast.success('缓存已清理，正在刷新...')
    setTimeout(() => window.location.reload(), 800)
  }

  const handleResetAll = () => {
    if (!confirm('确定重置所有设置为默认值？')) return
    const next = resetSettings()
    setSettings(next)
    toast.success('设置已重置')
  }

  const allRoles: UserRole[] = ['super_admin', 'admin', 'warehouse_manager', 'staff']
  const toggleRole = (role: UserRole) => {
    const current = settings.costVisibleRoles
    const next = current.includes(role)
      ? current.filter((r) => r !== role)
      : [...current, role]
    update({ costVisibleRoles: next })
  }

  return (
    <div className="p-4 space-y-4 pb-4">
      {/* 顶部栏 */}
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)} className="h-9 w-9">
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1">
          <h1 className="font-bold text-base">设置</h1>
          <p className="text-xs text-muted-foreground">外观、预警、数据维护</p>
        </div>
      </div>

      {/* 外观 */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="font-medium text-sm flex items-center gap-1.5">
            <Palette className="h-4 w-4" />
            外观
          </div>
          <div className="grid grid-cols-3 gap-2">
            {THEMES.map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => handleThemeChange(t.key)}
                className={cn(
                  'relative flex flex-col items-center gap-1.5 rounded-lg border-2 p-3 transition-all',
                  settings.theme === t.key ? 'border-primary' : 'border-border',
                )}
              >
                <div
                  className="h-10 w-10 rounded-full border-2 border-white shadow-sm"
                  style={{ backgroundColor: t.swatch }}
                />
                <div className="text-xs font-medium">{t.label}</div>
                {settings.theme === t.key && (
                  <div className="absolute top-1.5 right-1.5 h-4 w-4 rounded-full bg-primary text-primary-foreground flex items-center justify-center">
                    <Check className="h-2.5 w-2.5" />
                  </div>
                )}
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* 预警配置 */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="font-medium text-sm flex items-center gap-1.5">
            <Gauge className="h-4 w-4" />
            低库存预警
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div className="space-y-1">
              <Label className="text-xs flex items-center gap-1">
                <span className="inline-block h-2.5 w-2.5 rounded-full bg-red-500" />
                红色 ≤
              </Label>
              <Input
                type="number"
                min="0"
                value={settings.lowStockCritical}
                onChange={(e) =>
                  setSettings((s) => ({ ...s, lowStockCritical: parseInt(e.target.value) || 0 }))
                }
                className="h-9 text-sm"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs flex items-center gap-1">
                <span className="inline-block h-2.5 w-2.5 rounded-full bg-orange-500" />
                橙色 ≤
              </Label>
              <Input
                type="number"
                min="0"
                value={settings.lowStockDanger}
                onChange={(e) =>
                  setSettings((s) => ({ ...s, lowStockDanger: parseInt(e.target.value) || 0 }))
                }
                className="h-9 text-sm"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs flex items-center gap-1">
                <span className="inline-block h-2.5 w-2.5 rounded-full bg-yellow-500" />
                黄色 ≤
              </Label>
              <Input
                type="number"
                min="0"
                value={settings.lowStockWarning}
                onChange={(e) =>
                  setSettings((s) => ({ ...s, lowStockWarning: parseInt(e.target.value) || 0 }))
                }
                className="h-9 text-sm"
              />
            </div>
          </div>
          <Button size="sm" className="w-full" onClick={handleThresholdSave}>
            <Check className="mr-1.5 h-3.5 w-3.5" />
            保存阈值
          </Button>
        </CardContent>
      </Card>

      {/* 通用设置 */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="font-medium text-sm flex items-center gap-1.5">
            <Sliders className="h-4 w-4" />
            通用设置
          </div>
          <div className="space-y-2">
            <div className="space-y-1">
              <Label className="text-xs">默认仓库</Label>
              <select
                value={settings.defaultWarehouseId}
                onChange={(e) => update({ defaultWarehouseId: e.target.value })}
                className="w-full h-9 rounded-md border border-input bg-background px-2 text-sm"
              >
                <option value="">不指定</option>
                {warehouses?.map((w: any) => (
                  <option key={w.id} value={w.id}>
                    {w.name || w.code}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">入库数量步长</Label>
              <Input
                type="number"
                min="1"
                value={settings.stockInStep}
                onChange={(e) => update({ stockInStep: parseInt(e.target.value) || 1 })}
                className="h-9 text-sm"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">扫码枪最小长度</Label>
              <Input
                type="number"
                min="1"
                value={settings.scannerMinLength}
                onChange={(e) => update({ scannerMinLength: parseInt(e.target.value) || 4 })}
                className="h-9 text-sm"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">扫码枪按键间隔(ms)</Label>
              <Input
                type="number"
                min="10"
                value={settings.scannerMaxInterval}
                onChange={(e) => update({ scannerMaxInterval: parseInt(e.target.value) || 50 })}
                className="h-9 text-sm"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 成本权限 */}
      {canManageUsers() && (
        <Card>
          <CardContent className="p-4 space-y-3">
            <div className="font-medium text-sm flex items-center gap-1.5">
              <Coins className="h-4 w-4" />
              成本可见角色
            </div>
            <div className="flex flex-wrap gap-2">
              {allRoles.map((role) => (
                <button
                  key={role}
                  type="button"
                  onClick={() => toggleRole(role)}
                  className={cn(
                    'flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-all',
                    settings.costVisibleRoles.includes(role)
                      ? 'border-primary bg-primary/5 text-primary'
                      : 'border-border text-muted-foreground',
                  )}
                >
                  <div
                    className={cn(
                      'h-3.5 w-3.5 rounded border flex items-center justify-center',
                      settings.costVisibleRoles.includes(role)
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'border-muted-foreground/30',
                    )}
                  >
                    {settings.costVisibleRoles.includes(role) && <Check className="h-2 w-2" />}
                  </div>
                  {ROLE_LABELS[role]}
                </button>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* 数据维护 */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="font-medium text-sm flex items-center gap-1.5">
            <Database className="h-4 w-4" />
            数据维护
          </div>
          <div className="space-y-2">
            <Button variant="outline" size="sm" className="w-full justify-start" onClick={handleExportInventory}>
              <Download className="mr-2 h-3.5 w-3.5" />
              导出库存 CSV
            </Button>
            <Button variant="outline" size="sm" className="w-full justify-start" onClick={handleClearCache}>
              <RotateCw className="mr-2 h-3.5 w-3.5" />
              清理缓存并刷新
            </Button>
            {isSuperAdmin() && (
              <Button
                variant="outline"
                size="sm"
                className="w-full justify-start text-destructive"
                onClick={handleResetAll}
              >
                <RotateCcw className="mr-2 h-3.5 w-3.5" />
                重置所有设置
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* 关于 */}
      <Card>
        <CardContent className="p-4 space-y-2 text-sm">
          <div className="font-medium text-sm flex items-center gap-1.5 mb-2">
            <Info className="h-4 w-4" />
            关于
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">版本</span>
            <span className="font-mono">v0.2.0</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">当前外观</span>
            <span>{THEMES.find((t) => t.key === settings.theme)?.label || '墨石'}</span>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
