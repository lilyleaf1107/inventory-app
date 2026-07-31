import { useNavigate } from 'react-router-dom'
import { useMemo } from 'react'
import {
  useOutOfStock,
  formatOutOfStockDuration,
  getStockoutLevel,
  getStockoutLevelColor,
  type StockoutLevel,
} from '@/hooks/useOutOfStock'
import { getProductImageUrl } from '@/lib/supabase'
import {
  AlertTriangle,
  ImagePlus,
  MapPin,
  Clock,
  ArrowLeft,
  Package,
  TrendingUp,
} from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'

function levelBadge(level: StockoutLevel) {
  const color = getStockoutLevelColor(level)
  const labels: Record<StockoutLevel, string> = {
    recent: '刚断货',
    warning: '3-7天',
    danger: '7-30天',
    critical: '超30天',
  }
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium border ${color.border} ${color.text} ${color.bg}`}>
      {labels[level]}
    </span>
  )
}

export default function MobileOutOfStock() {
  const navigate = useNavigate()
  const { data: outOfStockItems, isLoading } = useOutOfStock()

  const stats = useMemo(() => {
    if (!outOfStockItems) return { total: 0, recent: 0, warning: 0, danger: 0, critical: 0 }
    return {
      total: outOfStockItems.length,
      recent: outOfStockItems.filter((i) => getStockoutLevel(i.lastOutAt) === 'recent').length,
      warning: outOfStockItems.filter((i) => getStockoutLevel(i.lastOutAt) === 'warning').length,
      danger: outOfStockItems.filter((i) => getStockoutLevel(i.lastOutAt) === 'danger').length,
      critical: outOfStockItems.filter((i) => getStockoutLevel(i.lastOutAt) === 'critical').length,
    }
  }, [outOfStockItems])

  const sortedItems = useMemo(() => {
    if (!outOfStockItems) return []
    return [...outOfStockItems].sort((a, b) => {
      const ta = a.lastOutAt ? new Date(a.lastOutAt).getTime() : 0
      const tb = b.lastOutAt ? new Date(b.lastOutAt).getTime() : 0
      return ta - tb
    })
  }, [outOfStockItems])

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
        <h1 className="font-bold text-base flex-1 text-red-600 flex items-center gap-2">
          <AlertTriangle className="h-5 w-5" />
          缺货提醒
        </h1>
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* 统计 */}
        <div className="p-3 grid grid-cols-5 gap-1.5">
          <Card className="border-red-200">
            <CardContent className="p-2 text-center">
              <div className="text-[9px] text-muted-foreground">总数</div>
              <div className="text-base font-bold text-red-600">{stats.total}</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-2 text-center">
              <div className="text-[9px] text-muted-foreground">3天内</div>
              <div className="text-base font-bold text-muted-foreground">{stats.recent}</div>
            </CardContent>
          </Card>
          <Card className="border-yellow-200">
            <CardContent className="p-2 text-center">
              <div className="text-[9px] text-muted-foreground">3-7天</div>
              <div className="text-base font-bold text-yellow-600">{stats.warning}</div>
            </CardContent>
          </Card>
          <Card className="border-orange-200">
            <CardContent className="p-2 text-center">
              <div className="text-[9px] text-muted-foreground">7-30天</div>
              <div className="text-base font-bold text-orange-600">{stats.danger}</div>
            </CardContent>
          </Card>
          <Card className="border-red-200">
            <CardContent className="p-2 text-center">
              <div className="text-[9px] text-muted-foreground">超30天</div>
              <div className="text-base font-bold text-red-600">{stats.critical}</div>
            </CardContent>
          </Card>
        </div>

        {/* 列表 */}
        <div className="px-3 pb-3 space-y-2">
          {isLoading ? (
            <div className="text-center py-12 text-muted-foreground text-sm">加载中...</div>
          ) : sortedItems.length === 0 ? (
            <div className="text-center py-16">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-50 mx-auto mb-3">
                <Package className="h-8 w-8 text-green-500" />
              </div>
              <div className="text-muted-foreground text-sm">暂无缺货商品</div>
            </div>
          ) : (
            sortedItems.map((item) => {
              const level = getStockoutLevel(item.lastOutAt)
              const color = getStockoutLevelColor(level)
              return (
                <Card key={item.id} className={`${color.border} ${color.bg}`}>
                  <CardContent className="p-3">
                    <div className="flex gap-3">
                      {item.product.image_path ? (
                        <img
                          src={getProductImageUrl(item.product.image_path)}
                          alt={item.product.name}
                          className="h-14 w-14 rounded-lg object-cover flex-shrink-0"
                        />
                      ) : (
                        <div className="h-14 w-14 rounded-lg bg-muted flex items-center justify-center flex-shrink-0">
                          <ImagePlus className="h-6 w-6 text-muted-foreground/50" />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <div className="font-medium text-sm truncate">{item.product.name}</div>
                          {levelBadge(level)}
                        </div>
                        <div className="mt-1 flex flex-wrap gap-1 text-xs text-muted-foreground">
                          {item.product.sku && (
                            <span className="font-mono">SKU: {item.product.sku}</span>
                          )}
                          {item.product.category && (
                            <span>分类: {item.product.category}</span>
                          )}
                        </div>
                        <div className="flex items-center gap-1 text-xs text-muted-foreground mt-1">
                          <MapPin className="h-3 w-3" />
                          {item.location.warehouse.name || item.location.warehouse.code} ·{' '}
                          {item.location.code}
                        </div>
                        <div className="flex items-center gap-3 mt-2">
                          <span className="flex items-center gap-1 text-xs text-muted-foreground">
                            <Clock className="h-3 w-3" />
                            {item.lastOutAt
                              ? new Date(item.lastOutAt).toLocaleDateString('zh-CN')
                              : '未知'}
                          </span>
                          <span className={`text-xs font-bold ${color.text}`}>
                            <TrendingUp className="h-3 w-3 inline mr-0.5" />
                            已缺货 {formatOutOfStockDuration(item.lastOutAt)}
                          </span>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )
            })
          )}
        </div>
      </div>
    </div>
  )
}
