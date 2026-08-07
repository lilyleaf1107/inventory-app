import { useEffect, useState } from 'react'

const SS_KEY = 'device:is-mobile'

function determineIsMobile(): boolean {
  if (typeof window === 'undefined') return false
  const w = window.innerWidth
  // 优先看UA，移动端浏览器通常匹配
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent || '' : ''
  const uaMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|HarmonyOS|Mobile/i.test(ua)
  // 小屏幕或UA为移动设备都认为是移动端
  const byWidth = w <= 768
  return byWidth || uaMobile
}

/**
 * 设备类型判断 Hook
 * - 首屏优先使用 sessionStorage 缓存，避免 hydration/首屏抖动（路由层依赖）
 * - 实时监听 resize 更新
 * - 同时基于 UA 辅助判断，避免小窗口 PC 被误判
 */
export function useDevice() {
  const [isMobile, setIsMobile] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false
    try {
      const cached = window.sessionStorage.getItem(SS_KEY)
      if (cached === '1') return true
      if (cached === '0') return false
    } catch {
      /* ignore storage error */
    }
    return determineIsMobile()
  })

  useEffect(() => {
    const update = () => {
      const v = determineIsMobile()
      setIsMobile(v)
      try {
        window.sessionStorage.setItem(SS_KEY, v ? '1' : '0')
      } catch {
        /* ignore */
      }
    }
    update()
    window.addEventListener('resize', update)
    window.addEventListener('orientationchange', update)
    return () => {
      window.removeEventListener('resize', update)
      window.removeEventListener('orientationchange', update)
    }
  }, [])

  return {
    isMobile,
    isDesktop: !isMobile,
  }
}
