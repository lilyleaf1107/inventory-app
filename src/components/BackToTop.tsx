import { useEffect, useState } from 'react'
import { ArrowUp } from 'lucide-react'
import { useLocation } from 'react-router-dom'

/**
 * 一键回到页面顶部（通用组件）
 * - 支持两种模式：
 *   1. 传 containerId → 监听该 DOM 元素的 scrollTop（Layout 的 main 才是滚动容器时用）
 *   2. 不传 → 监听 window（body 滚动）
 * - 下滑超过 SHOW_THRESHOLD 像素淡入，点击平滑回顶
 * - 路由切换时自动隐藏
 */
const SHOW_THRESHOLD = 400

export default function BackToTop({
  mobile = false,
  containerId,
}: {
  mobile?: boolean
  /** 如果滚动容器不是 window，传对应元素 id（比如 Layout 的 main id） */
  containerId?: string
}) {
  const [show, setShow] = useState(false)
  const { pathname } = useLocation()

  // 路由切换 → 隐藏
  useEffect(() => { setShow(false) }, [pathname])

  useEffect(() => {
    let raf = 0
    const el: HTMLElement | Window = containerId
      ? (document.getElementById(containerId) as HTMLElement | null) || window
      : window

    const getTop = () => {
      if (el === window) return window.scrollY || document.documentElement.scrollTop || 0
      return (el as HTMLElement).scrollTop || 0
    }

    const handle = () => {
      if (raf) return
      raf = window.requestAnimationFrame(() => {
        raf = 0
        setShow(getTop() > SHOW_THRESHOLD)
      })
    }

    const remove = () => (el as any).removeEventListener('scroll', handle, { passive: true })
    ;(el as any).addEventListener('scroll', handle, { passive: true })
    handle()

    // 如果 containerId 对应的元素晚一点才挂到 DOM（比如 React 渲染），等 150ms 再绑一次
    let t = 0 as unknown as number
    if (containerId && !(document.getElementById(containerId))) {
      t = window.setTimeout(() => {
        const newEl = document.getElementById(containerId)
        if (newEl) {
          remove()
          ;(newEl as any).addEventListener('scroll', handle, { passive: true })
          handle()
        }
      }, 150)
    }

    return () => {
      if (t) clearTimeout(t)
      cancelAnimationFrame(raf)
      remove()
    }
  }, [containerId])

  const goTop = () => {
    const el = containerId ? document.getElementById(containerId) : null
    if (el) {
      try {
        el.scrollTo({ top: 0, behavior: 'smooth' as ScrollBehavior })
        return
      } catch {
        el.scrollTop = 0
        return
      }
    }
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const size = mobile ? 'h-12 w-12' : 'h-14 w-14'
  const iconSize = mobile ? 'h-5 w-5' : 'h-6 w-6'

  return (
    <button
      aria-label="回到顶部"
      onClick={goTop}
      className={[
        'fixed z-40 rounded-full shadow-2xl',
        'bg-gradient-to-br from-indigo-500 via-purple-500 to-fuchsia-500',
        'text-white border-2 border-white/50',
        'flex items-center justify-center',
        'hover:scale-110 active:scale-95 transition-transform duration-200',
        size,
        mobile ? 'right-4 bottom-24' : 'right-6 bottom-6',
        show
          ? 'opacity-100 translate-y-0 pointer-events-auto animate-in fade-in slide-in-from-bottom-4 duration-200'
          : 'opacity-0 translate-y-4 pointer-events-none transition-all duration-200',
      ].join(' ')}
      style={{ backdropFilter: 'blur(8px)' }}
    >
      <div className="absolute inset-0 rounded-full bg-white/10 animate-pulse" />
      <ArrowUp className={[iconSize, 'relative drop-shadow-sm'].join(' ')} />
    </button>
  )
}
