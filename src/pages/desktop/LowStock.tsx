import { useMemo, useState } from 'react'
import { AlertTriangle, Package, MapPin, TrendingDown, HelpCircle } from 'lucide-react'
import {
  useLowStock,
  getLowStockLevelV2,
  getLowStockLevelColor,
  formatSellableDays,
  DAYS_THRESHOLD_WARNING,
  DAYS_THRESHOLD_DANGER,
  DAYS_THRESHOLD_CRITICAL,
  calcStockAlert,
} from '@/hooks/useLowStock'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { getProductImageUrl } from '@/lib/supabase'
import { ImagePlus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { buildPageRange, scrollToTopOfPage } from '@/lib/utils'

const PAGE_SIZE = 20

export default function LowStockPage() {
  const { data: lowStockItems, isLoading } = useLowStock()
  const [page, setPage] = useState(1)

  const total = lowStockItems?.length || 0
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  // 筛选/数据变化时，重置回第 1 页
  useMemo(() => { setPage(1) }, [total])

  const pagedList = useMemo(
    () => (lowStockItems || []).slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [lowStockItems, page],
  )

  const stats = useMemo(() => {
    if (!lowStockItems) return { total: 0, warning: 0, danger: 0, critical: 0 }
    return {
      total: lowStockItems.length,
      warning: lowStockItems.filter((i) => getLowStockLevelV2(i.quantity, i.outQty30d, { trackQty: i.product.track_qty !== false, manualStatus: i.product.manual_status ?? null }) === 'warning').length,
      danger: lowStockItems.filter((i) => getLowStockLevelV2(i.quantity, i.outQty30d, { trackQty: i.product.track_qty !== false, manualStatus: i.product.manual_status ?? null }) === 'danger').length,
      critical: lowStockItems.filter((i) => getLowStockLevelV2(i.quantity, i.outQty30d, { trackQty: i.product.track_qty !== false, manualStatus: i.product.manual_status ?? null }) === 'critical').length,
    }
  }, [lowStockItems])

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-orange-600 flex items-center gap-2">
            <AlertTriangle className="h-6 w-6" />
            库存预警
          </h2>
          <p className="text-sm text-muted-foreground flex items-center gap-2">
            按「能卖天数」分级（30天有出库记录生效）：
            <span className="text-red-600 font-medium">≤{DAYS_THRESHOLD_CRITICAL}天🔴</span>
            <span className="text-orange-600 font-medium">≤{DAYS_THRESHOLD_DANGER}天🟠</span>
            <span className="text-yellow-600 font-medium">≤{DAYS_THRESHOLD_WARNING}天🟡</span>
            <span className="flex items-center gap-1 text-muted-foreground">
              <HelpCircle className="h-3 w-3" />
              新品/无出库记录：回退至固定数量阈值(≤30/≤15/≤5)
            </span>
          </p>
        </div>
      </div>

      {/* 统计卡片 */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card className="border-orange-200">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Package className="h-4 w-4" />
              预警总数
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-600">{stats.total}</div>
          </CardContent>
        </Card>
        <Card className="border-yellow-200">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              🟡 黄色预警（≤{DAYS_THRESHOLD_WARNING} 天）
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-yellow-600">{stats.warning}</div>
          </CardContent>
        </Card>
        <Card className="border-orange-200">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              🟠 橙色预警（≤{DAYS_THRESHOLD_DANGER} 天）
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-600">{stats.danger}</div>
          </CardContent>
        </Card>
        <Card className="border-red-200">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              🔴 红色预警（≤{DAYS_THRESHOLD_CRITICAL} 天）
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{stats.critical}</div>
          </CardContent>
        </Card>
      </div>

      {/* 低库存列表 */}
      <div className="rounded-md border bg-background">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-16">图片</TableHead>
              <TableHead>产品</TableHead>
              <TableHead>SKU / 条码</TableHead>
              <TableHead>仓库 / 库位</TableHead>
              <TableHead>当前库存</TableHead>
              <TableHead>30天出库 / 日均</TableHead>
              <TableHead>能卖天数</TableHead>
              <TableHead>预警等级</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                  加载中...
                </TableCell>
              </TableRow>
            ) : (lowStockItems ?? []).length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                  🎉 暂无库存预警商品
                </TableCell>
              </TableRow>
            ) : (
              pagedList.map((item) => {
                const level = getLowStockLevelV2(item.quantity, item.outQty30d, {
                  trackQty: item.product.track_qty !== false,
                  manualStatus: item.product.manual_status ?? null,
                })
                const color = getLowStockLevelColor(level)
                const alert = calcStockAlert(item.quantity, item.outQty30d)
                const isMaterial = item.product.is_material_area
                const sellableDaysText = formatSellableDays(alert.sellableDays, alert.usesFallback)

                // 能卖天数 进度条：15天以内按比例显示（>15 显示100%绿，但这些不会进列表）
                const days = alert.sellableDays
                const ratioPercent = days == null
                  ? Math.min((item.quantity / DAYS_THRESHOLD_WARNING) * 100, 100) // 回退模式下按数量/30 比例
                  : Math.min((days / DAYS_THRESHOLD_WARNING) * 100, 100)

                return (
                  <TableRow key={item.id} className={color.bg}>
                    <TableCell>
                      {item.product.image_path ? (
                        <img
                          src={getProductImageUrl(item.product.image_path)}
                          alt={item.product.name}
                          className="h-10 w-10 rounded object-cover"
                        />
                      ) : (
                        <div className="h-10 w-10 rounded bg-muted flex items-center justify-center">
                          <ImagePlus className="h-5 w-5 text-muted-foreground/50" />
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-1.5">
                        {item.product.name}
                        {isMaterial && (
                          <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-blue-100 text-blue-700">物料</span>
                        )}
                        {alert.usesFallback && (
                          <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-slate-100 text-slate-600 border border-slate-200" title="暂无销售数据，使用固定阈值兜底">
                            固定阈值
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {item.product.sku || '-'} / {item.product.barcode || '-'}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1 text-sm">
                        {item.location.id === 'unalloc' ? (
                          <Package className="h-3 w-3 text-amber-600" />
                        ) : (
                          <MapPin className="h-3 w-3 text-muted-foreground" />
                        )}
                        <span className={item.location.id === 'unalloc' ? 'text-amber-700 font-medium' : ''}>
                          {item.location.id === 'unalloc'
                            ? item.location.code
                            : `${item.location.warehouse?.name || item.location.warehouse?.code || ''} · ${item.location.code}`}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className={`font-bold ${color.text}`}>
                      {isMaterial ? '***' : `${item.quantity} ${item.product.unit}`}
                    </TableCell>
                    <TableCell>
                      <div className="text-sm space-y-0.5">
                        <div className="flex items-center gap-1">
                          <TrendingDown className="h-3 w-3 text-orange-500" />
                          <span>{item.outQty30d ?? 0} {item.product.unit}（30天）</span>
                        </div>
                        <div className="text-xs text-muted-foreground">
                          日均：{alert.dailyAvg > 0 ? `${alert.dailyAvg.toFixed(2)} ${item.product.unit}/天` : '—'}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="space-y-1">
                        <div className={`text-sm font-semibold ${color.text}`}>
                          {sellableDaysText}
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="w-20 h-2 bg-muted rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full ${
                                level === 'critical' ? 'bg-red-500' :
                                level === 'danger' ? 'bg-orange-500' : 'bg-yellow-500'
                              }`}
                              style={{ width: `${ratioPercent}%` }}
                            />
                          </div>
                          {alert.usesFallback && (
                            <span className="text-[10px] text-slate-500">固定</span>
                          )}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${color.text} ${color.bg} border ${color.border}`}>
                        {color.label}
                      </span>
                    </TableCell>
                  </TableRow>
                )
              })
            )}
          </TableBody>
        </Table>
      </div>

      {/* 🆕 页码条（宽展开）：超过 1 页才显示 */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-1 py-2 text-sm flex-wrap">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => { setPage(1); scrollToTopOfPage() }}>
            首页
          </Button>
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => { setPage(page - 1); scrollToTopOfPage() }}>
            上一页
          </Button>
          {buildPageRange(page, totalPages).map((p, i) =>
            typeof p === 'number' ? (
              <Button key={i} variant={p === page ? 'default' : 'outline'} size="sm"
                onClick={() => { setPage(p); scrollToTopOfPage() }}>
                {p}
              </Button>
            ) : (
              <span key={i} className="px-1 text-muted-foreground">…</span>
            ),
          )}
          <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => { setPage(page + 1); scrollToTopOfPage() }}>
            下一页
          </Button>
          <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => { setPage(totalPages); scrollToTopOfPage() }}>
            末页
          </Button>
          <span className="text-muted-foreground ml-2">第 {page}/{totalPages} 页 · 共 {total} 条预警</span>
        </div>
      )}
    </div>
  )
}
