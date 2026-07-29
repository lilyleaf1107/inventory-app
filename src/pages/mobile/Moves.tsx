import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ArrowDownToLine, ArrowUpFromLine } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { formatDate } from '@/lib/utils'

interface MoveItem {
  id: string
  move_type: 'in' | 'out'
  quantity: number
  scan_mode: string
  created_at: string
  product: { id: string; name: string; sku: string; unit: string }
  location: { id: string; code: string; warehouse: { id: string; code: string; name: string | null } }
}

export default function MobileMoves() {
  const [typeFilter, setTypeFilter] = useState<'all' | 'in' | 'out'>('all')

  const { data: moves, isLoading } = useQuery({
    queryKey: ['stock-moves', typeFilter],
    queryFn: async () => {
      let query = supabase
        .from('stock_moves')
        .select(`
          id, move_type, quantity, scan_mode, created_at,
          product:products ( id, name, sku, unit ),
          location:locations ( id, code, warehouse:warehouses ( id, code, name ) )
        `)
        .order('created_at', { ascending: false })

      if (typeFilter !== 'all') {
        query = query.eq('move_type', typeFilter)
      }

      const { data, error } = await query.limit(50)
      if (error) throw error
      return data as unknown as MoveItem[]
    },
  })

  return (
    <div className="p-4 space-y-3">
      {/* 筛选 */}
      <div className="flex items-center gap-1 p-1 bg-muted rounded-lg">
        {(['all', 'in', 'out'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTypeFilter(t)}
            className={`flex-1 py-1.5 rounded-md text-xs font-medium transition-colors ${
              typeFilter === t
                ? 'bg-background shadow-sm'
                : 'text-muted-foreground'
            }`}
          >
            {t === 'all' ? '全部' : t === 'in' ? '入库' : '出库'}
          </button>
        ))}
      </div>

      {/* 记录列表 */}
      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground text-sm">加载中...</div>
      ) : moves?.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground text-sm">暂无记录</div>
      ) : (
        <div className="space-y-2">
          {moves?.map((m) => (
            <div
              key={m.id}
              className="flex items-center gap-3 p-3 bg-background rounded-lg border"
            >
              <div
                className={`flex h-9 w-9 items-center justify-center rounded-full flex-shrink-0 ${
                  m.move_type === 'in'
                    ? 'bg-green-100 text-green-600'
                    : 'bg-orange-100 text-orange-600'
                }`}
              >
                {m.move_type === 'in' ? (
                  <ArrowDownToLine className="h-4 w-4" />
                ) : (
                  <ArrowUpFromLine className="h-4 w-4" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-medium text-sm truncate">{m.product.name}</div>
                <div className="text-xs text-muted-foreground">
                  {m.location.warehouse.name || m.location.warehouse.code} · {m.location.code}
                </div>
                <div className="text-xs text-muted-foreground">
                  {formatDate(m.created_at)}
                  {m.scan_mode === 'scan' && ' · 扫码'}
                </div>
              </div>
              <div className="text-right flex-shrink-0">
                <div
                  className={`font-bold text-sm ${
                    m.move_type === 'in' ? 'text-green-600' : 'text-orange-600'
                  }`}
                >
                  {m.move_type === 'in' ? '+' : '-'}
                  {m.quantity}
                </div>
                <div className="text-xs text-muted-foreground">{m.product.unit}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
