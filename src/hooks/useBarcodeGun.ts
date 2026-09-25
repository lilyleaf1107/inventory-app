import { useEffect, useRef, useCallback } from 'react'

interface UseBarcodeGunOptions {
  onScan: (code: string) => void
  enabled?: boolean
  // 按键间隔超过此毫秒数认为扫码结束（扫码枪字符间隔通常 <50ms）
  maxInterval?: number
  // 最小长度（避免误触发）
  minLength?: number
}

/**
 * 扫码枪监听 Hook
 * USB 扫码枪默认为键盘模拟模式，扫码后快速连续输入字符
 * 通过监听快速连续的 keydown 事件识别扫码枪输入
 *
 * 触发时机（满足任一即可）：
 *   1. 收到 Enter 键（扫码枪可能自带回车）
 *   2. 字符间隔超过 maxInterval（扫码结束，停顿后自动触发，无需回车）
 */
export function useBarcodeGun({
  onScan,
  enabled = true,
  maxInterval = 200,
  minLength = 3,
}: UseBarcodeGunOptions) {
  const bufferRef = useRef('')
  const lastTimeRef = useRef(0)
  const onScanRef = useRef(onScan)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // 保持最新的 onScan 引用
  useEffect(() => {
    onScanRef.current = onScan
  }, [onScan])

  const flushBuffer = useCallback(() => {
    const code = bufferRef.current.trim()
    if (code.length >= minLength) {
      onScanRef.current(code)
    }
    bufferRef.current = ''
  }, [minLength])

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      // 忽略修饰键组合（Ctrl/Cmd/Meta + V 等粘贴场景）
      if (e.ctrlKey || e.metaKey || e.altKey) return

      const now = Date.now()
      const lastTime = lastTimeRef.current

      // 超时重置 buffer
      if (now - lastTime > maxInterval) {
        bufferRef.current = ''
      }
      lastTimeRef.current = now

      if (e.key === 'Enter') {
        // Enter 立即触发（兜底）
        if (timerRef.current) {
          clearTimeout(timerRef.current)
          timerRef.current = null
        }
        flushBuffer()
        e.preventDefault()
      } else if (e.key.length === 1) {
        bufferRef.current += e.key
        // 停顿检测：超过 maxInterval 没有新字符，认为扫码结束，自动触发
        if (timerRef.current) clearTimeout(timerRef.current)
        timerRef.current = setTimeout(() => {
          flushBuffer()
          timerRef.current = null
        }, maxInterval)
      }
    },
    [maxInterval, flushBuffer],
  )

  useEffect(() => {
    if (!enabled) return
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [enabled, handleKeyDown])
}
