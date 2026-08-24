import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ArrowDownToLine, ArrowUpFromLine, Download, Filter } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { formatDate } from '@/lib/utils'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

interface StockMoveItem {
  id: string
  move_type: 'in' | 'out'
  quantity: number
  scan_mode: 'manual' | 'scan'
  batch_no: string | null
  remark: string | null
  created_at: string
  product: {
    id: string
    name: string
    sku: string
    unit: string
  }
  location: {
    id: string
    code: string
    warehouse: {
      id: string
      code: string
      name: string | null
    }
  }
  operator: {
    id: string
    name: string | null
  } | null
}

export default function StockMovesPage() {
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState<'all' | 'in' | 'out'>('all')

  const { data: moves, isLoading, error } = useQuery({
    queryKey: ['stock-moves', search, typeFilter],
    queryFn: async () => {
      let query = supabase
        .from('stock_moves')
        .select(`
          id,
          move_type,
          quantity,
          scan_mode,
          batch_no,
          remark,
          created_at,
          product:products ( id, name, sku, unit ),
          location:locations (
            id,
            code,
            warehouse:warehouses ( id, code, name )
          ),
          operator:profiles!stock_moves_operator_id_fkey ( id, name )
        `)
        .order('created_at', { ascending: false })

      if (typeFilter !== 'all') {
        query = query.eq('move_type', typeFilter)
      }

      const { data, error } = await query.limit(200)
      if (error) throw error

      let result = data as unknown as StockMoveItem[]

      if (search) {
        const s = search.toLowerCase()
        result = result.filter(
          (m) =>
            m.product.name.toLowerCase().includes(s) ||
            (m.product.sku || '').toLowerCase().includes(s) ||
            (m.batch_no && m.batch_no.toLowerCase().includes(s)),
        )
      }

      return result
    },
  })

  const totalIn = moves
    ?.filter((m) => m.move_type === 'in')
    .reduce((sum, m) => sum + Number(m.quantity), 0) || 0
  const totalOut = moves
    ?.filter((m) => m.move_type === 'out')
    .reduce((sum, m) => sum + Number(m.quantity), 0) || 0

  const exportCSV = () => {
    if (!moves?.length) return
    const headers = ['时间', '类型', '产品', 'SKU', '数量', '单位', '仓库', '库位', '批次', '操作方式', '操作人', '备注']
    const rows = moves.map((m) => [
      formatDate(m.created_at),
      m.move_type === 'in' ? '入库' : '出库',
      m.product.name,
      m.product.sku || '-',
      Number(m.quantity),
      m.product.unit,
      m.location.warehouse.name || m.location.warehouse.code,
      m.location.code,
      m.batch_no || '',
      m.scan_mode === 'scan' ? '扫码' : '手动',
      m.operator?.name || '',
      m.remark || '',
    ])
    const csv = [headers, ...rows].map((row) => row.map((v) => `"${v}"`).join(',')).join('\n')
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `进出库记录_${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">进出库记录</h2>
          <p className="text-sm text-muted-foreground">查看所有进出库操作历史</p>
        </div>
        <Button variant="outline" onClick={exportCSV} disabled={!moves?.length}>
          <Download className="mr-2 h-4 w-4" />
          导出 CSV
        </Button>
      </div>

      {/* 统计 */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              总记录数
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{moves?.length || 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <ArrowDownToLine className="h-4 w-4 text-green-600" />
              入库总数
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              +{totalIn.toLocaleString()}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <ArrowUpFromLine className="h-4 w-4 text-orange-600" />
              出库总数
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-600">
              -{totalOut.toLocaleString()}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 筛选 */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Filter className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="搜索产品 / SKU / 批次"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8"
          />
        </div>
        <div className="flex items-center gap-1 p-1 bg-muted rounded-md">
          <button
            onClick={() => setTypeFilter('all')}
            className={`px-3 py-1.5 text-sm rounded transition-colors ${
              typeFilter === 'all'
                ? 'bg-background shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            全部
          </button>
          <button
            onClick={() => setTypeFilter('in')}
            className={`px-3 py-1.5 text-sm rounded transition-colors ${
              typeFilter === 'in'
                ? 'bg-background shadow-sm text-green-600'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            入库
          </button>
          <button
            onClick={() => setTypeFilter('out')}
            className={`px-3 py-1.5 text-sm rounded transition-colors ${
              typeFilter === 'out'
                ? 'bg-background shadow-sm text-orange-600'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            出库
          </button>
        </div>
      </div>

      {/* 记录列表 */}
      <div className="rounded-md border bg-background">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>时间</TableHead>
              <TableHead>类型</TableHead>
              <TableHead>产品</TableHead>
              <TableHead>仓库/库位</TableHead>
              <TableHead>数量</TableHead>
              <TableHead>批次</TableHead>
              <TableHead>操作方式</TableHead>
              <TableHead>操作人</TableHead>
              <TableHead>备注</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                  加载中...
                </TableCell>
              </TableRow>
            ) : error ? (
              <TableRow>
                <TableCell colSpan={9} className="text-center py-8 text-destructive">
                  查询失败：{(error as Error).message}
                  <br />
                  <span className="text-xs">若提示外键/嵌套查询错误，请在 Supabase SQL Editor 运行迁移 0016</span>
                </TableCell>
              </TableRow>
            ) : moves?.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                  暂无记录
                </TableCell>
              </TableRow>
            ) : (
              moves?.map((m) => (
                <TableRow key={m.id}>
                  <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                    {formatDate(m.created_at)}
                  </TableCell>
                  <TableCell>
                    {m.move_type === 'in' ? (
                      <span className="inline-flex items-center gap-1 text-green-600 text-sm font-medium">
                        <ArrowDownToLine className="h-3 w-3" />
                        入库
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-orange-600 text-sm font-medium">
                        <ArrowUpFromLine className="h-3 w-3" />
                        出库
                      </span>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="font-medium text-sm">{m.product.name}</div>
                    <div className="text-xs text-muted-foreground font-mono">
                      {m.product.sku || '-'}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="text-sm">{m.location.warehouse.name || m.location.warehouse.code}</div>
                    <div className="text-xs text-muted-foreground font-mono">
                      {m.location.code}
                    </div>
                  </TableCell>
                  <TableCell>
                    <span
                      className={`font-bold ${
                        m.move_type === 'in' ? 'text-green-600' : 'text-orange-600'
                      }`}
                    >
                      {m.move_type === 'in' ? '+' : '-'}
                      {Number(m.quantity)}
                    </span>
                    <span className="text-xs text-muted-foreground ml-1">
                      {m.product.unit}
                    </span>
                  </TableCell>
                  <TableCell className="text-sm">
                    {m.batch_no || '-'}
                  </TableCell>
                  <TableCell className="text-sm">
                    {m.scan_mode === 'scan' ? '扫码' : '手动'}
                  </TableCell>
                  <TableCell className="text-sm">
                    {m.operator?.name || '-'}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground max-w-[150px] truncate">
                    {m.remark || '-'}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
