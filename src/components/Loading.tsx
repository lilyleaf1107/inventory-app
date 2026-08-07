import { useEffect, useState } from 'react'
import { RefreshCw, WifiOff } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface LoadingProps {
  /** 超时时间（毫秒），默认 12s */
  timeout?: number
  /** 提示文案 */
  text?: string
}

/**
 * 通用 Loading 组件
 * - 展示转圈
 * - 超时后展示「网络问题提示 + 刷新按钮」，避免空白页
 */
export function Loading({ timeout = 12000, text = '加载中...' }: LoadingProps) {
  const [stuck, setStuck] = useState(false)

  useEffect(() => {
    const t = window.setTimeout(() => setStuck(true), timeout)
    return () => window.clearTimeout(t)
  }, [timeout])

  const handleReload = () => window.location.reload()

  if (stuck) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-background">
        <div className="max-w-sm w-full border rounded-lg p-6 space-y-4 bg-card">
          <div className="flex flex-col items-center text-center space-y-2">
            <div className="h-12 w-12 rounded-full bg-amber-100 text-amber-600 flex items-center justify-center">
              <WifiOff className="h-6 w-6" />
            </div>
            <div className="font-semibold text-lg">加载时间过长</div>
            <p className="text-sm text-muted-foreground">
              可能是网络较差或资源未加载，可刷新重试
            </p>
          </div>
          <div className="space-y-2 pt-2">
            <Button className="w-full" onClick={handleReload}>
              <RefreshCw className="mr-2 h-4 w-4" />
              刷新页面
            </Button>
            <p className="text-[11px] text-center text-muted-foreground">
              仍无法进入请尝试清理浏览器缓存或切换网络
            </p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-3">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      <div className="text-sm text-muted-foreground">{text}</div>
    </div>
  )
}

export default Loading
