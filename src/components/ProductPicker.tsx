import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Search, ImagePlus, Check } from 'lucide-react'
import { supabase, getProductImageUrl } from '@/lib/supabase'
import type { Product } from '@/types'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'

interface ProductPickerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSelect: (product: Product) => void
}

export default function ProductPicker({ open, onOpenChange, onSelect }: ProductPickerProps) {
  const [search, setSearch] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const { data: products, isLoading } = useQuery({
    queryKey: ['products', search],
    queryFn: async () => {
      let query = supabase.from('products').select('*').order('name')
      if (search) {
        query = query.or(
          `name.ilike.%${search}%,sku.ilike.%${search}%,barcode.ilike.%${search}%`,
        )
      }
      const { data, error } = await query.limit(50)
      if (error) throw error
      return data as Product[]
    },
  })

  const selected = useMemo(
    () => products?.find((p) => p.id === selectedId) || null,
    [products, selectedId],
  )

  const handleConfirm = () => {
    if (selected) {
      onSelect(selected)
      setSelectedId(null)
      setSearch('')
      onOpenChange(false)
    }
  }

  const handleClose = () => {
    setSelectedId(null)
    setSearch('')
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col p-0">
        <DialogHeader className="p-4 pb-2">
          <DialogTitle>选择产品</DialogTitle>
          <DialogDescription>搜索并选择要操作的产品</DialogDescription>
        </DialogHeader>
        <div className="px-4 pb-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="搜索名称 / SKU / 条形码"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8"
              autoFocus
            />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto px-4">
          {isLoading ? (
            <div className="py-12 text-center text-muted-foreground">加载中...</div>
          ) : products?.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground">
              没有找到产品
            </div>
          ) : (
            <div className="space-y-1 pb-2">
              {products?.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setSelectedId(p.id)}
                  className={`w-full flex items-center gap-3 p-2 rounded-md text-left transition-colors ${
                    selectedId === p.id
                      ? 'bg-primary/10 ring-1 ring-primary'
                      : 'hover:bg-muted'
                  }`}
                >
                  {p.image_path ? (
                    <img
                      src={getProductImageUrl(p.image_path)}
                      alt={p.name}
                      className="h-10 w-10 rounded object-cover flex-shrink-0"
                    />
                  ) : (
                    <div className="h-10 w-10 rounded bg-muted flex items-center justify-center flex-shrink-0">
                      <ImagePlus className="h-5 w-5 text-muted-foreground/50" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm truncate">{p.name}</div>
                    <div className="text-xs text-muted-foreground">
                      SKU: {p.sku || '-'}
                      {p.barcode && ` · 条码: ${p.barcode}`}
                    </div>
                  </div>
                  {selectedId === p.id && (
                    <Check className="h-4 w-4 text-primary flex-shrink-0" />
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
        <DialogFooter className="p-4 pt-2">
          <Button variant="outline" onClick={handleClose}>
            取消
          </Button>
          <Button onClick={handleConfirm} disabled={!selected}>
            确认选择
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
