import { useEffect, useRef, useCallback } from 'react'

interface UseBarcodeGunOptions {
  onScan: (code: string) => void
  enabled?: boolean
  // 按键间隔超过此毫秒数认为是新的扫码（扫码枪通常 <50ms）
  maxInterval?: number
  // 最小长度（避免误触发）
  minLength?: number
}

/**
 * 扫码枪监听 Hook
 * USB 扫码枪默认为键盘模拟模式，扫码后自动输入字符 + 回车
 * 通过监听快速连续的 keydown 事件识别扫码枪输入
 */
export function useBarcodeGun({
  onScan,
  enabled = true,
  maxInterval = 100,
  minLength = 3,
}: UseBarcodeGunOptions) {
  const bufferRef = useRef('')
  const lastTimeRef = useRef(0)
  const onScanRef = useRef(onScan)

  // 保持最新的 onScan 引用
  useEffect(() => {
    onScanRef.current = onScan
  }, [onScan])

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
        const code = bufferRef.current.trim()
        if (code.length >= minLength) {
          onScanRef.current(code)
        }
        bufferRef.current = ''
        // 阻止 Enter 触发表单提交
        if (code.length >= minLength) {
          e.preventDefault()
        }
      } else if (e.key.length === 1) {
        bufferRef.current += e.key
      }
    },
    [maxInterval, minLength],
  )

  useEffect(() => {
    if (!enabled) return
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [enabled, handleKeyDown])
}
