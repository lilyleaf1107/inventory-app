import { useMemo } from 'react'
import { AlertTriangle, Package, MapPin } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useLowStock, getLowStockLevel, getLowStockLevelColor } from '@/hooks/useLowStock'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { getProductImageUrl } from '@/lib/supabase'
import { ImagePlus } from 'lucide-react'

export default function LowStockPage() {
  const { data: lowStockItems, isLoading } = useLowStock()

  const stats = useMemo(() => {
    if (!lowStockItems) return { total: 0, warning: 0, danger: 0, critical: 0 }
    return {
      total: lowStockItems.length,
      warning: lowStockItems.filter((i) => getLowStockLevel(i.quantity, i.minStock) === 'warning').length,
      danger: lowStockItems.filter((i) => getLowStockLevel(i.quantity, i.minStock) === 'danger').length,
      critical: lowStockItems.filter((i) => getLowStockLevel(i.quantity, i.minStock) === 'critical').length,
    }
  }, [lowStockItems])

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-orange-600 flex items-center gap-2">
            <AlertTriangle className="h-6 w-6" />
            低库存预警
          </h2>
          <p className="text-sm text-muted-foreground">库存低于预警值的商品（50%黄色 / 30%橙色 / 10%红色）</p>
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
            <CardTitle className="text-sm font-medium text-muted-foreground">黄色预警 (≤50%)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-yellow-600">{stats.warning}</div>
          </CardContent>
        </Card>
        <Card className="border-orange-200">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">橙色预警 (≤30%)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-600">{stats.danger}</div>
          </CardContent>
        </Card>
        <Card className="border-red-200">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">红色预警 (≤10%)</CardTitle>
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
              <TableHead>预警值</TableHead>
              <TableHead>库存比例</TableHead>
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
            ) : lowStockItems?.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                  暂无低库存预警商品
                </TableCell>
              </TableRow>
            ) : (
              lowStockItems?.map((item) => {
                const level = getLowStockLevel(item.quantity, item.minStock)
                const color = getLowStockLevelColor(level)
                const isMaterial = (item.product as any).is_material_area
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
                      {item.product.name}
                      {isMaterial && (
                        <span className="ml-2 px-2 py-0.5 rounded-full text-xs bg-blue-100 text-blue-700">物料区</span>
                      )}
                    </TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {item.product.sku || '-'} / {item.product.barcode || '-'}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1 text-sm">
                        <MapPin className="h-3 w-3 text-muted-foreground" />
                        {item.location.warehouse.name || item.location.warehouse.code} · {item.location.code}
                      </div>
                    </TableCell>
                    <TableCell className={isMaterial ? 'text-muted-foreground' : 'font-bold'}>
                      {isMaterial ? '***' : `${item.quantity} ${item.product.unit}`}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {item.minStock} {item.product.unit}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div className="w-20 h-2 bg-muted rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full ${
                              level === 'critical' ? 'bg-red-500' :
                              level === 'danger' ? 'bg-orange-500' : 'bg-yellow-500'
                            }`}
                            style={{ width: `${Math.min(item.stockRatio * 100, 100)}%` }}
                          />
                        </div>
                        <span className="text-xs text-muted-foreground">
                          {(item.stockRatio * 100).toFixed(0)}%
                        </span>
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
    </div>
  )
}
