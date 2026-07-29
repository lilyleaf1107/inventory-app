import { useEffect } from 'react'
import { Camera, X, AlertCircle, ScanLine } from 'lucide-react'
import { useScanner } from '@/hooks/useScanner'
import { Button } from '@/components/ui/button'

interface ScannerProps {
  open: boolean
  onClose: () => void
  onScan: (code: string) => void
}

export default function Scanner({ open, onClose, onScan }: ScannerProps) {
  const { videoRef, scanning, error, start, stop } = useScanner({
    onResult: (code) => {
      onScan(code)
    },
  })

  useEffect(() => {
    if (open) {
      start()
    } else {
      stop()
    }
    return () => stop()
  }, [open, start, stop])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90">
      {/* 关闭按钮 */}
      <button
        onClick={onClose}
        className="absolute top-4 right-4 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 transition-colors"
      >
        <X className="h-5 w-5" />
      </button>

      <div className="relative w-full max-w-md mx-4">
        {/* 标题 */}
        <div className="text-center mb-4">
          <div className="inline-flex items-center gap-2 text-white/90 text-sm">
            <Camera className="h-4 w-4" />
            将条形码对准摄像头
          </div>
        </div>

        {/* 视频预览 */}
        <div className="relative aspect-square w-full overflow-hidden rounded-lg bg-black">
          <video
            ref={videoRef}
            className="h-full w-full object-cover"
            playsInline
            muted
          />

          {/* 扫描框 */}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="relative w-3/4 h-3/5 border-2 border-white/80 rounded-lg">
              {/* 四个角的标记 */}
              <div className="absolute -top-1 -left-1 w-6 h-6 border-t-4 border-l-4 border-green-400 rounded-tl-lg" />
              <div className="absolute -top-1 -right-1 w-6 h-6 border-t-4 border-r-4 border-green-400 rounded-tr-lg" />
              <div className="absolute -bottom-1 -left-1 w-6 h-6 border-b-4 border-l-4 border-green-400 rounded-bl-lg" />
              <div className="absolute -bottom-1 -right-1 w-6 h-6 border-b-4 border-r-4 border-green-400 rounded-br-lg" />
              {/* 扫描线动画 */}
              {scanning && (
                <div
                  className="absolute left-0 right-0 h-0.5 bg-green-400 shadow-[0_0_8px_rgba(74,222,128,0.8)]"
                  style={{
                    animation: 'scanner-line 2s ease-in-out infinite',
                  }}
                />
              )}
            </div>
          </div>

          {/* 错误提示 */}
          {error && (
            <div className="absolute inset-0 flex items-center justify-center p-6 bg-black/80">
              <div className="text-center text-white">
                <AlertCircle className="h-10 w-10 mx-auto mb-3 text-amber-400" />
                <p className="text-sm mb-4">{error}</p>
                <Button size="sm" onClick={start} variant="secondary">
                  重试
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* 状态 */}
        <div className="mt-4 flex items-center justify-center gap-2 text-white/70 text-xs">
          <ScanLine className={`h-3 w-3 ${scanning ? 'animate-pulse text-green-400' : ''}`} />
          {scanning ? '扫描中...' : error ? '已停止' : '准备中...'}
        </div>
      </div>

      <style>{`
        @keyframes scanner-line {
          0% { top: 0; }
          50% { top: calc(100% - 2px); }
          100% { top: 0; }
        }
      `}</style>
    </div>
  )
}
