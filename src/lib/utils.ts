import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatDate(date: string | Date) {
  return new Date(date).toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/**
 * 平滑滚回页面「内容区域」的最顶部。
 *
 * 桌面端/移动端 Layout 都把滚动容器放在 `<main>`（而不是 body/window），
 * 直接调用 window.scrollTo 不会有效果，所以统一用这个函数按 id 优先滚动 main。
 *
 * 规则：按传入 id → 默认桌面 main(#scroll-container) → 移动 main(#scroll-container-mobile) → window 兜底
 */
export function scrollToTopOfPage(containerId?: string) {
  const tryIds = [
    containerId,
    'scroll-container',
    'scroll-container-mobile',
  ].filter(Boolean) as string[]

  for (const id of tryIds) {
    const el = document.getElementById(id)
    if (el) {
      try {
        el.scrollTo({ top: 0, behavior: 'smooth' as ScrollBehavior })
        return
      } catch {
        el.scrollTop = 0
        return
      }
    }
  }
  // 兜底
  try {
    window.scrollTo({ top: 0, behavior: 'smooth' })
  } catch { /* ignore */ }
}

/**
 * 生成「展开更宽」的分页页码范围（供 UI 渲染）。
 * 规则：
 *  - totalPages ≤ 11：全部直接显示（1..totalPages）
 *  - 否则：首末页 + 以当前页为中心 ±SIDE（默认 ±4，中间最多 9 个数字按钮），两端用 '...' 做省略
 * 示例（30 页，当前 15）→ [1, '...', 11,12,13,14,15,16,17,18,19, '...', 30]
 */
export function buildPageRange(page: number, totalPages: number, side = 4): (number | string)[] {
  const FULL_SHOW_MAX = 11
  const range: (number | string)[] = []
  if (totalPages <= FULL_SHOW_MAX) {
    for (let i = 1; i <= totalPages; i++) range.push(i)
    return range
  }
  range.push(1)
  const start = Math.max(2, page - side)
  const end   = Math.min(totalPages - 1, page + side)
  if (start > 2) range.push('...')
  for (let i = start; i <= end; i++) range.push(i)
  if (end < totalPages - 1) range.push('...')
  range.push(totalPages)
  return range
}

