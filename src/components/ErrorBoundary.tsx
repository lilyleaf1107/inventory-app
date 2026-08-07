import React from 'react'
import { AlertTriangle, RotateCcw, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface Props {
  children: React.ReactNode
  /** 可选的页面/模块名称，用于提示 */
  name?: string
}

interface State {
  hasError: boolean
  error: Error | null
}

export class ErrorBoundary extends React.Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  }

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  public componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    // eslint-disable-next-line no-console
    console.error('[ErrorBoundary]', error, errorInfo)
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null })
  }

  private handleReload = () => {
    window.location.reload()
  }

  public render() {
    if (this.state.hasError) {
      const msg = this.state.error?.message || '页面加载出错'
      return (
        <div className="min-h-screen w-full flex items-center justify-center p-4 bg-background">
          <div className="max-w-sm w-full border rounded-lg p-6 space-y-4 bg-card shadow-sm">
            <div className="flex flex-col items-center text-center space-y-2">
              <div className="h-12 w-12 rounded-full bg-red-100 text-red-600 flex items-center justify-center">
                <AlertTriangle className="h-6 w-6" />
              </div>
              <div className="font-semibold text-lg">
                {this.props.name ? `${this.props.name} 出错` : '页面出了点问题'}
              </div>
              <p className="text-sm text-muted-foreground break-all">{msg}</p>
            </div>
            <div className="grid grid-cols-2 gap-2 pt-2">
              <Button variant="outline" onClick={this.handleReset}>
                <RotateCcw className="mr-1.5 h-4 w-4" />
                重试
              </Button>
              <Button onClick={this.handleReload}>
                <RefreshCw className="mr-1.5 h-4 w-4" />
                刷新页面
              </Button>
            </div>
            <p className="text-[11px] text-center text-muted-foreground pt-1">
              问题持续出现请尝试清空缓存或联系管理员
            </p>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}

export default ErrorBoundary
