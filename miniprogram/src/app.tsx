// 必须第一行加载：小程序 Web 标准兼容补丁（早于 Taro / Supabase 初始化）
import './lib/polyfill'
import { Component } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import './app.scss'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60 * 1000,
      gcTime: 5 * 60 * 1000,
      // ★ 关键：小程序环境没有 navigator.onLine，
      // React Query v5 默认 networkMode:'online' 会认为离线，
      // 导致所有 useQuery 查询被暂停（不发请求）
      networkMode: 'always',
      retry: 1,
    },
    mutations: {
      networkMode: 'always',
    },
  },
})

class App extends Component {
  componentDidMount() {}
  componentDidShow() {}
  componentDidHide() {}

  render() {
    return (
      <QueryClientProvider client={queryClient}>
        {this.props.children}
      </QueryClientProvider>
    )
  }
}

export default App
