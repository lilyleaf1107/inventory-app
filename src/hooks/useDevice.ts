import { useEffect, useState } from 'react'

/**
 * 设备类型判断 Hook
 * 根据屏幕宽度和 UA 判断当前是手机还是电脑
 */
export function useDevice() {
  const [isMobile, setIsMobile] = useState(() => {
    if (typeof window === 'undefined') return false
    return window.innerWidth <= 768
  })

  useEffect(() => {
    const handler = () => {
      setIsMobile(window.innerWidth <= 768)
    }
    window.addEventListener('resize', handler)
    return () => window.removeEventListener('resize', handler)
  }, [])

  return {
    isMobile,
    isDesktop: !isMobile,
  }
}
