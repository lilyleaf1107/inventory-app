import { useEffect, useState, lazy, Suspense } from 'react'
import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { useAuthStore } from '@/store/auth'
import { useDevice } from '@/hooks/useDevice'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { Loading } from '@/components/Loading'
import LoginPage from '@/pages/auth/Login'

// 懒加载所有页面组件，减小初始包体积
const DesktopLayout = lazy(() => import('@/pages/desktop/Layout'))
const ProductsPage = lazy(() => import('@/pages/desktop/Products'))
const WarehousesPage = lazy(() => import('@/pages/desktop/Warehouses'))
const StockInPage = lazy(() => import('@/pages/desktop/StockIn'))
const StockOutPage = lazy(() => import('@/pages/desktop/StockOut'))
const InventoryPage = lazy(() => import('@/pages/desktop/Inventory'))
const StockMovesPage = lazy(() => import('@/pages/desktop/StockMoves'))
const DashboardPage = lazy(() => import('@/pages/desktop/Dashboard'))
const UsersPage = lazy(() => import('@/pages/desktop/Users'))
const CategoriesPage = lazy(() => import('@/pages/desktop/Categories'))
const OutOfStockPage = lazy(() => import('@/pages/desktop/OutOfStock'))
const LowStockPage = lazy(() => import('@/pages/desktop/LowStock'))
const MaterialsPage = lazy(() => import('@/pages/desktop/Materials'))

const MobileLayout = lazy(() => import('@/pages/mobile/Layout'))
const MobileHome = lazy(() => import('@/pages/mobile/Home'))
const MobileScan = lazy(() => import('@/pages/mobile/Scan'))
const MobileInventory = lazy(() => import('@/pages/mobile/Inventory'))
const MobileMoves = lazy(() => import('@/pages/mobile/Moves'))
const MobileProfile = lazy(() => import('@/pages/mobile/Profile'))
const MobileProducts = lazy(() => import('@/pages/mobile/Products'))
const MobileWarehouses = lazy(() => import('@/pages/mobile/Warehouses'))
const MobileCategories = lazy(() => import('@/pages/mobile/Categories'))
const MobileUsers = lazy(() => import('@/pages/mobile/Users'))
const MobileOutOfStock = lazy(() => import('@/pages/mobile/OutOfStock'))
const MobileLowStock = lazy(() => import('@/pages/mobile/LowStock'))
const MobileMaterials = lazy(() => import('@/pages/mobile/Materials'))
const MobileStockIn = lazy(() => import('@/pages/mobile/StockIn'))
const MobileStockOut = lazy(() => import('@/pages/mobile/StockOut'))

function ProtectedRoute({ children, name }: { children: React.ReactNode; name?: string }) {
  const { user, loading } = useAuthStore()
  const location = useLocation()

  if (loading) return <Loading />

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />
  }

  return (
    <ErrorBoundary name={name}>
      <Suspense fallback={<Loading />}>{children}</Suspense>
    </ErrorBoundary>
  )
}

export default function App() {
  const { checkAuth, loading } = useAuthStore()
  const { isMobile } = useDevice()
  const [init, setInit] = useState(false)

  useEffect(() => {
    checkAuth().finally(() => setInit(true))
  }, [checkAuth])

  if (!init && loading) {
    return <Loading text="正在初始化..." />
  }

  return (
    <ErrorBoundary name="应用">
      <Routes>
        <Route
          path="/login"
          element={
            <ErrorBoundary name="登录">
              <LoginPage />
            </ErrorBoundary>
          }
        />

        {/* 移动端路由 */}
        {isMobile && (
          <Route
            path="/m/*"
            element={
              <ProtectedRoute name="移动端">
                <MobileLayout />
              </ProtectedRoute>
            }
          >
            <Route index element={<MobileHome />} />
            <Route path="scan" element={<MobileScan />} />
            <Route path="inventory" element={<MobileInventory />} />
            <Route path="moves" element={<MobileMoves />} />
            <Route path="profile" element={<MobileProfile />} />
            <Route path="products" element={<MobileProducts />} />
            <Route path="materials" element={<MobileMaterials />} />
            <Route path="warehouses" element={<MobileWarehouses />} />
            <Route path="categories" element={<MobileCategories />} />
            <Route path="users" element={<MobileUsers />} />
            <Route path="out-of-stock" element={<MobileOutOfStock />} />
            <Route path="low-stock" element={<MobileLowStock />} />
            <Route path="stock-in" element={<MobileStockIn />} />
            <Route path="stock-out" element={<MobileStockOut />} />
          </Route>
        )}

        {/* 桌面端路由（默认） */}
        <Route
          path="/*"
          element={
            <ProtectedRoute name="桌面端">
              <DesktopLayout />
            </ProtectedRoute>
          }
        >
          <Route index element={<Navigate to={isMobile ? '/m' : '/dashboard'} replace />} />
          <Route path="dashboard" element={<DashboardPage />} />
          <Route path="m" element={<Navigate to="/m" replace />} />
          <Route path="products" element={<ProductsPage />} />
          <Route path="materials" element={<MaterialsPage />} />
          <Route path="categories" element={<CategoriesPage />} />
          <Route path="warehouses" element={<WarehousesPage />} />
          <Route path="stock-in" element={<StockInPage />} />
          <Route path="stock-out" element={<StockOutPage />} />
          <Route path="inventory" element={<InventoryPage />} />
          <Route path="moves" element={<StockMovesPage />} />
          <Route path="users" element={<UsersPage />} />
          <Route path="out-of-stock" element={<OutOfStockPage />} />
          <Route path="low-stock" element={<LowStockPage />} />
        </Route>
      </Routes>
    </ErrorBoundary>
  )
}
