import { useMemo } from 'react'
import {
  useOutOfStock,
  formatOutOfStockDuration,
  getStockoutLevel,
} from '@/hooks/useOutOfStock'
import { supabase, getProductImageUrl } from '@/lib/supabase'
import {
  AlertTriangle,
  ImagePlus,
  MapPin,
  Clock,
  Package,
  Warehouse,
  TrendingUp,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

function levelBadge(level: 'recent' | 'warning' | 'critical') {
  switch (level) {
    case 'recent':
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-700">
          <Clock className="h-3 w-3" />
          刚断货
        </span>
      )
    case 'warning':
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-700">
          <AlertTriangle className="h-3 w-3" />
          缺货中
        </span>
      )
    case 'critical':
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700">
          <TrendingUp className="h-3 w-3" />
          长期缺货
        </span>
      )
  }
}

export default function OutOfStockPage() {
  const { data: outOfStockItems, isLoading } = useOutOfStock()

  const stats = useMemo(() => {
    if (!outOfStockItems) return { total: 0, recent: 0, warning: 0, critical: 0 }
    return {
      total: outOfStockItems.length,
      recent: outOfStockItems.filter((i) => getStockoutLevel(i.lastOutAt) === 'recent').length,
      warning: outOfStockItems.filter((i) => getStockoutLevel(i.lastOutAt) === 'warning').length,
      critical: outOfStockItems.filter((i) => getStockoutLevel(i.lastOutAt) === 'critical').length,
    }
  }, [outOfStockItems])

  // 按缺货时长排序（最长的在前）
  const sortedItems = useMemo(() => {
    if (!outOfStockItems) return []
    return [...outOfStockItems].sort((a, b) => {
      const ta = a.lastOutAt ? new Date(a.lastOutAt).getTime() : 0
      const tb = b.lastOutAt ? new Date(b.lastOutAt).getTime() : 0
      return ta - tb // 越早断货的排越前
    })
  }, [outOfStockItems])

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-red-600 flex items-center gap-2">
            <AlertTriangle className="h-6 w-6" />
            缺货提醒
          </h2>
          <p className="text-sm text-muted-foreground">库存为零的商品及断货时长</p>
        </div>
      </div>

      {/* 统计卡片 */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card className="border-red-200">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Package className="h-4 w-4" />
              缺货总数
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{stats.total}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Clock className="h-4 w-4 text-yellow-500" />
              24小时内
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-yellow-600">{stats.recent}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-orange-500" />
              1-7天
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-600">{stats.warning}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-red-500" />
              超过7天
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{stats.critical}</div>
          </CardContent>
        </Card>
      </div>

      {/* 缺货列表 */}
      <div className="rounded-md border bg-background">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-16">图片</TableHead>
              <TableHead>产品</TableHead>
              <TableHead>SKU / 条码</TableHead>
              <TableHead>仓库 / 库位</TableHead>
              <TableHead>断货时间</TableHead>
              <TableHead>缺货时长</TableHead>
              <TableHead>状态</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                  加载中...
                </TableCell>
              </TableRow>
            ) : sortedItems.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                  暂无缺货商品
                </TableCell>
              </TableRow>
            ) : (
              sortedItems.map((item) => {
                const level = getStockoutLevel(item.lastOutAt)
                const rowClass =
                  level === 'critical'
                    ? 'bg-red-50/60'
                    : level === 'warning'
                      ? 'bg-orange-50/40'
                      : 'bg-yellow-50/30'

                return (
                  <TableRow key={item.id} className={rowClass}>
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
                    <TableCell>
                      <div className="font-medium">{item.product.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {item.product.category || ''}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="font-mono text-xs">{item.product.sku || '-'}</div>
                      <div className="font-mono text-xs text-muted-foreground">
                        {item.product.barcode || '-'}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1 text-sm">
                        <MapPin className="h-3 w-3 text-muted-foreground" />
                        {item.location.warehouse.name || item.location.warehouse.code}
                      </div>
                      <div className="font-mono text-xs text-muted-foreground">
                        {item.location.code}
                        {item.location.description && ` · ${item.location.description}`}
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {item.lastOutAt
                        ? new Date(item.lastOutAt).toLocaleString('zh-CN')
                        : '未知'}
                    </TableCell>
                    <TableCell>
                      <span
                        className={`font-bold text-sm ${
                          level === 'critical'
                            ? 'text-red-600'
                            : level === 'warning'
                              ? 'text-orange-600'
                              : 'text-yellow-600'
                        }`}
                      >
                        {formatOutOfStockDuration(item.lastOutAt)}
                      </span>
                    </TableCell>
                    <TableCell>{levelBadge(level)}</TableCell>
                  </TableRow>
                )
              })
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
