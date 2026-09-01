import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, AlertTriangle, Package, MapPin, ImagePlus, TrendingDown } from 'lucide-react'
import {
  useLowStock,
  getLowStockLevelV2,
  getLowStockLevelColor,
  DAYS_THRESHOLD_WARNING,
  calcStockAlert,
  formatSellableDays,
} from '@/hooks/useLowStock'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { getProductImageUrl } from '@/lib/supabase'
import { buildPageRange, scrollToTopOfPage } from '@/lib/utils'

const PAGE_SIZE = 15

export default function MobileLowStock() {
  const navigate = useNavigate()
  const { data: lowStockItems, isLoading } = useLowStock()
  const [page, setPage] = useState(1)

  const total = lowStockItems?.length || 0
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  useMemo(() => { setPage(1) }, [total]) // 数据变→回第 1 页

  const pagedList = useMemo(
    () => (lowStockItems || []).slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [lowStockItems, page],
  )

  const stats = {
    total: lowStockItems?.length || 0,
    warning: lowStockItems?.filter((i) => getLowStockLevelV2(i.quantity, i.outQty30d) === 'warning').length || 0,
    danger: lowStockItems?.filter((i) => getLowStockLevelV2(i.quantity, i.outQty30d) === 'danger').length || 0,
    critical: lowStockItems?.filter((i) => getLowStockLevelV2(i.quantity, i.outQty30d) === 'critical').length || 0,
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 px-4 py-3 border-b bg-background flex-shrink-0">
        <button
          onClick={() => navigate(-1)}
          className="p-1.5 -ml-1.5 rounded-lg hover:bg-muted transition-colors"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <h1 className="font-bold text-base flex-1 text-orange-600 flex items-center gap-2">
          <AlertTriangle className="h-5 w-5" />
          库存预警
        </h1>
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* 分级说明 */}
        <div className="px-3 pt-3 pb-1 text-[11px] text-muted-foreground flex items-center flex-wrap gap-x-2 gap-y-1">
          按能卖天数：
          <span className="text-red-600 font-medium">≤3天🔴</span>
          <span className="text-orange-600 font-medium">≤7天🟠</span>
          <span className="text-yellow-600 font-medium">≤15天🟡</span>
          <span className="text-slate-500">新品回退固定阈值</span>
        </div>

        {/* 统计卡片 */}
        <div className="p-3 grid grid-cols-4 gap-2">
          <Card className="border-orange-200"><CardContent className="p-2 text-center">
            <div className="text-lg font-bold text-orange-600">{stats.total}</div>
            <div className="text-[10px] text-muted-foreground">总数</div>
          </CardContent></Card>
          <Card className="border-yellow-200"><CardContent className="p-2 text-center">
            <div className="text-lg font-bold text-yellow-600">{stats.warning}</div>
            <div className="text-[10px] text-muted-foreground">黄(≤15天)</div>
          </CardContent></Card>
          <Card className="border-orange-200"><CardContent className="p-2 text-center">
            <div className="text-lg font-bold text-orange-600">{stats.danger}</div>
            <div className="text-[10px] text-muted-foreground">橙(≤7天)</div>
          </CardContent></Card>
          <Card className="border-red-200"><CardContent className="p-2 text-center">
            <div className="text-lg font-bold text-red-600">{stats.critical}</div>
            <div className="text-[10px] text-muted-foreground">红(≤3天)</div>
          </CardContent></Card>
        </div>

        {/* 列表 */}
        <div className="px-3 pb-3 space-y-2">
          {isLoading ? (
            <div className="text-center py-12 text-muted-foreground text-sm">加载中...</div>
          ) : (lowStockItems ?? []).length === 0 ? (
            <div className="text-center py-16">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-50 mx-auto mb-3">
                <Package className="h-8 w-8 text-green-500" />
              </div>
              <div className="text-muted-foreground text-sm">暂无库存预警 🎉</div>
            </div>
          ) : (
            pagedList.map((item) => {
              const alert = calcStockAlert(item.quantity, item.outQty30d)
              const level = alert.level
              const color = getLowStockLevelColor(level)
              const isMaterial = item.product.is_material_area
              const ratioPercent = alert.sellableDays == null
                ? Math.min((item.quantity / DAYS_THRESHOLD_WARNING) * 100, 100)
                : Math.min((alert.sellableDays / DAYS_THRESHOLD_WARNING) * 100, 100)

              return (
                <Card key={item.id} className={color.border + ' ' + color.bg}>
                  <CardContent className="p-3 flex items-start gap-3">
                    {item.product.image_path ? (
                      <img
                        src={getProductImageUrl(item.product.image_path)}
                        alt={item.product.name}
                        className="h-12 w-12 rounded-lg object-cover flex-shrink-0"
                      />
                    ) : (
                      <div className="h-12 w-12 rounded-lg bg-muted flex items-center justify-center flex-shrink-0">
                        <ImagePlus className="h-5 w-5 text-muted-foreground/50" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0 space-y-1">
                      <div className="font-medium text-sm truncate flex items-center gap-1">
                        {item.product.name}
                        {isMaterial && (
                          <span className="px-1 py-0.5 rounded text-[10px] bg-blue-100 text-blue-700 flex-shrink-0">物料</span>
                        )}
                        {alert.usesFallback && (
                          <span className="px-1 py-0.5 rounded text-[10px] bg-slate-100 text-slate-600 border border-slate-200 flex-shrink-0" title="暂无销售数据，固定阈值兜底">固定</span>
                        )}
                      </div>
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        {item.location.id === 'unalloc' ? (
                          <Package className="h-3 w-3 text-amber-600" />
                        ) : (
                          <MapPin className="h-3 w-3" />
                        )}
                        <span
                          className={`truncate ${
                            item.location.id === 'unalloc' ? 'text-amber-700 font-medium' : ''
                          }`}
                        >
                          {item.location.id === 'unalloc'
                            ? item.location.code
                            : `${item.location.warehouse?.name || item.location.warehouse?.code || ''} · ${item.location.code}`}
                        </span>
                      </div>
                      {/* 库存 + 天数 + 30天出库 */}
                      <div className="flex items-center justify-between gap-2 text-xs">
                        <span className={`font-semibold ${color.text}`}>
                          库存：{isMaterial ? '***' : `${item.quantity} ${item.product.unit}`}
                        </span>
                        <span className={`font-medium ${color.text}`}>
                          {formatSellableDays(alert.sellableDays, alert.usesFallback)}
                        </span>
                      </div>
                      {/* 进度条 + 30天出库 */}
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full ${
                              level === 'critical' ? 'bg-red-500' :
                              level === 'danger' ? 'bg-orange-500' : 'bg-yellow-500'
                            }`}
                            style={{ width: `${ratioPercent}%` }}
                          />
                        </div>
                        <span className="text-[10px] text-muted-foreground inline-flex items-center gap-0.5 flex-shrink-0">
                          <TrendingDown className="h-2.5 w-2.5" />
                          {item.outQty30d ?? 0}/30天
                        </span>
                      </div>
                    </div>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${color.text} ${color.bg} border ${color.border} flex-shrink-0`}>
                      {color.label}
                    </span>
                  </CardContent>
                </Card>
              )
            })
          )}
        </div>

        {/* 🆕 分页条（移动端更紧凑，页码按钮 size="sm" + 小数字标签） */}
        {totalPages > 1 && (
          <div className="px-3 pb-4 flex items-center justify-center gap-1 flex-wrap text-xs">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => { setPage(1); scrollToTopOfPage() }}>首页</Button>
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => { setPage(page - 1); scrollToTopOfPage() }}>上一页</Button>
            {buildPageRange(page, totalPages, 3).map((p, i) =>
              typeof p === 'number' ? (
                <Button key={i} variant={p === page ? 'default' : 'outline'} size="sm"
                  onClick={() => { setPage(p); scrollToTopOfPage() }}>
                  {p}
                </Button>
              ) : (
                <span key={i} className="px-0.5 text-muted-foreground text-xs">…</span>
              ),
            )}
            <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => { setPage(page + 1); scrollToTopOfPage() }}>下一页</Button>
            <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => { setPage(totalPages); scrollToTopOfPage() }}>末页</Button>
            <span className="w-full text-center pt-1 text-[11px] text-muted-foreground">第 {page}/{totalPages} 页 · 共 {total} 条预警</span>
          </div>
        )}
      </div>
    </div>
  )
}
