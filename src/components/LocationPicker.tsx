import { useState, useRef, useEffect, useMemo } from 'react'
import { Search, MapPin } from 'lucide-react'
import { Input } from '@/components/ui/input'

interface LocationItem {
  id: string
  code: string
  zone?: string | null
  rack?: string | null
  level?: string | null
  position?: string | null
  warehouse?: { id: string; name: string | null; code: string } | null
}

interface LocationPickerProps {
  locations: LocationItem[]
  excludeIds?: string[]
  onSelect: (locationId: string) => void
  placeholder?: string
  autoFocus?: boolean
  className?: string
}

export function LocationPicker({
  locations,
  excludeIds = [],
  onSelect,
  placeholder = '搜索库位编码 / 仓库名...',
  autoFocus = false,
  className = '',
}: LocationPickerProps) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  // 过滤掉已选库位
  const available = useMemo(
    () => (locations || []).filter((l) => !excludeIds.includes(l.id)),
    [locations, excludeIds],
  )

  // 按输入文本过滤
  const filtered = useMemo(() => {
    if (!query.trim()) return available.slice(0, 50)
    const q = query.trim().toLowerCase()
    return available
      .filter((l) => {
        const code = (l.code || '').toLowerCase()
        const whName = (l.warehouse?.name || '').toLowerCase()
        const whCode = (l.warehouse?.code || '').toLowerCase()
        const zone = (l.zone || '').toLowerCase()
        const rack = (l.rack || '').toLowerCase()
        return (
          code.includes(q) ||
          whName.includes(q) ||
          whCode.includes(q) ||
          zone.includes(q) ||
          rack.includes(q)
        )
      })
      .slice(0, 50)
  }, [available, query])

  // 点击外部关闭下拉
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const handleSelect = (loc: LocationItem) => {
    onSelect(loc.id)
    setQuery('')
    setOpen(false)
  }

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground pointer-events-none" />
      <Input
        value={query}
        onChange={(e) => {
          setQuery(e.target.value)
          setOpen(true)
        }}
        onFocus={() => setOpen(true)}
        autoFocus={autoFocus}
        placeholder={placeholder}
        className="pl-8"
      />
      {open && filtered.length > 0 && (
        <div className="absolute z-50 mt-1 w-full max-h-60 overflow-y-auto rounded-md border bg-background shadow-lg">
          {filtered.map((loc) => (
            <button
              key={loc.id}
              type="button"
              onClick={() => handleSelect(loc)}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-accent transition-colors border-b border-border/50 last:border-0"
            >
              <MapPin className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
              <span className="font-mono font-medium">{loc.code}</span>
              {loc.warehouse?.name && (
                <span className="text-muted-foreground text-xs">({loc.warehouse.name})</span>
              )}
              {(loc.zone || loc.rack || loc.level) && (
                <span className="text-muted-foreground text-xs ml-auto">
                  {[loc.zone, loc.rack, loc.level].filter(Boolean).join('-')}
                </span>
              )}
            </button>
          ))}
        </div>
      )}
      {open && filtered.length === 0 && query.trim() && (
        <div className="absolute z-50 mt-1 w-full rounded-md border bg-background shadow-lg px-3 py-2 text-sm text-muted-foreground">
          未找到匹配的库位
        </div>
      )}
    </div>
  )
}
