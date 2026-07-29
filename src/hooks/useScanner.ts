import { useRef, useState, useCallback, useEffect } from 'react'
import { BrowserMultiFormatReader } from '@zxing/browser'
import type { IScannerControls } from '@zxing/browser'

interface UseScannerOptions {
  onResult: (code: string) => void
  onError?: (err: Error) => void
}

/**
 * 摄像头扫码 Hook
 * 调用 start 后会请求摄像头权限并开始扫码，识别成功后触发 onResult
 */
export function useScanner({ onResult, onError }: UseScannerOptions) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const controlsRef = useRef<IScannerControls | null>(null)
  const [scanning, setScanning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const lastCodeRef = useRef<{ code: string; time: number }>({ code: '', time: 0 })

  // 防止同一码在 2 秒内重复触发
  const handleResult = useCallback(
    (code: string) => {
      const now = Date.now()
      const last = lastCodeRef.current
      if (code === last.code && now - last.time < 2000) return
      lastCodeRef.current = { code, time: now }
      onResult(code)
      // 震动反馈（移动端）
      if (navigator.vibrate) {
        navigator.vibrate(200)
      }
    },
    [onResult],
  )

  const start = useCallback(async () => {
    if (!videoRef.current) return
    setError(null)

    // 安全上下文检测：HTTPS 或 localhost 才允许调用摄像头
    if (
      typeof window !== 'undefined' &&
      typeof window.isSecureContext !== 'undefined' &&
      !window.isSecureContext &&
      window.location.hostname !== 'localhost' &&
      window.location.hostname !== '127.0.0.1'
    ) {
      const msg =
        '当前环境非 HTTPS，无法使用摄像头扫码。\n请使用 HTTPS 链接访问，或手动输入条形码。'
      setError(msg)
      return
    }

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      const msg =
        '当前浏览器不支持摄像头扫码。\n请使用 HTTPS 访问，或手动输入条形码。'
      setError(msg)
      return
    }

    try {
      const reader = new BrowserMultiFormatReader()
      // 优先使用后置摄像头
      controlsRef.current = await reader.decodeFromVideoDevice(
        undefined,
        videoRef.current,
        (result, err) => {
          if (result) {
            handleResult(result.getText())
          }
        },
      )
      setScanning(true)
    } catch (err: any) {
      const msg =
        err?.name === 'NotAllowedError'
          ? '摄像头权限被拒绝，请在浏览器设置中允许访问摄像头'
          : err?.name === 'NotFoundError'
            ? '未检测到摄像头设备'
            : err?.name === 'NotAllowedError' ||
                err?.name === 'PermissionDeniedError'
              ? '摄像头权限被拒绝，请在浏览器设置中允许访问摄像头'
              : err?.message || '无法启动摄像头'
      setError(msg)
      onError?.(err)
    }
  }, [handleResult, onError])

  const stop = useCallback(() => {
    if (controlsRef.current) {
      controlsRef.current.stop()
      controlsRef.current = null
    }
    setScanning(false)
  }, [])

  useEffect(() => {
    return () => {
      if (controlsRef.current) {
        controlsRef.current.stop()
      }
    }
  }, [])

  return { videoRef, scanning, error, start, stop }
}
