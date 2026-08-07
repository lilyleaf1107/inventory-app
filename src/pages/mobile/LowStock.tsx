import { useNavigate } from 'react-router-dom'
import { ArrowLeft, AlertTriangle, Package, MapPin, ImagePlus } from 'lucide-react'
import { useLowStock, getLowStockLevel, getLowStockLevelColor, LOW_STOCK_THRESHOLD_WARNING } from '@/hooks/useLowStock'
import { Card, CardContent } from '@/components/ui/card'
import { getProductImageUrl } from '@/lib/supabase'

export default function MobileLowStock() {
  const navigate = useNavigate()
  const { data: lowStockItems, isLoading } = useLowStock()

  const stats = {
    total: lowStockItems?.length || 0,
    warning: lowStockItems?.filter((i) => getLowStockLevel(i.quantity) === 'warning').length || 0,
    danger: lowStockItems?.filter((i) => getLowStockLevel(i.quantity) === 'danger').length || 0,
    critical: lowStockItems?.filter((i) => getLowStockLevel(i.quantity) === 'critical').length || 0,
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
          低库存预警
        </h1>
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* 统计 */}
        <div className="p-3 grid grid-cols-4 gap-2">
          <Card className="border-orange-200"><CardContent className="p-2 text-center">
            <div className="text-lg font-bold text-orange-600">{stats.total}</div>
            <div className="text-[10px] text-muted-foreground">总数</div>
          </CardContent></Card>
          <Card className="border-yellow-200"><CardContent className="p-2 text-center">
            <div className="text-lg font-bold text-yellow-600">{stats.warning}</div>
            <div className="text-[10px] text-muted-foreground">≤30</div>
          </CardContent></Card>
          <Card className="border-orange-200"><CardContent className="p-2 text-center">
            <div className="text-lg font-bold text-orange-600">{stats.danger}</div>
            <div className="text-[10px] text-muted-foreground">≤15</div>
          </CardContent></Card>
          <Card className="border-red-200"><CardContent className="p-2 text-center">
            <div className="text-lg font-bold text-red-600">{stats.critical}</div>
            <div className="text-[10px] text-muted-foreground">≤5</div>
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
              <div className="text-muted-foreground text-sm">暂无低库存预警</div>
            </div>
          ) : (
            (lowStockItems ?? []).map((item) => {
              const level = getLowStockLevel(item.quantity)
              const color = getLowStockLevelColor(level)
              const isMaterial = item.product.is_material_area
              const ratioPercent = Math.min((item.quantity / LOW_STOCK_THRESHOLD_WARNING) * 100, 100)
              return (
                <Card key={item.id} className={color.border + ' ' + color.bg}>
                  <CardContent className="p-3 flex items-center gap-3">
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
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm truncate flex items-center gap-1">
                        {item.product.name}
                        {isMaterial && (
                          <span className="px-1 py-0.5 rounded text-[10px] bg-blue-100 text-blue-700">物料</span>
                        )}
                      </div>
                      <div className="flex items-center gap-1 text-xs text-muted-foreground mt-0.5">
                        <MapPin className="h-3 w-3" />
                        <span className="truncate">
                          {item.location.warehouse.name || item.location.warehouse.code} · {item.location.code}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 mt-1">
                        <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full ${
                              level === 'critical' ? 'bg-red-500' :
                              level === 'danger' ? 'bg-orange-500' : 'bg-yellow-500'
                            }`}
                            style={{ width: `${ratioPercent}%` }}
                          />
                        </div>
                        <span className="text-[10px] text-muted-foreground">
                          {isMaterial ? '***' : `${item.quantity}/${LOW_STOCK_THRESHOLD_WARNING}`}
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
      </div>
    </div>
  )
}
