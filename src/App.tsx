import { useEffect, useState } from 'react'
import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { useAuthStore } from '@/store/auth'
import { useDevice } from '@/hooks/useDevice'
import LoginPage from '@/pages/auth/Login'
import DesktopLayout from '@/pages/desktop/Layout'
import ProductsPage from '@/pages/desktop/Products'
import WarehousesPage from '@/pages/desktop/Warehouses'
import StockInPage from '@/pages/desktop/StockIn'
import StockOutPage from '@/pages/desktop/StockOut'
import InventoryPage from '@/pages/desktop/Inventory'
import StockMovesPage from '@/pages/desktop/StockMoves'
import DashboardPage from '@/pages/desktop/Dashboard'
import UsersPage from '@/pages/desktop/Users'
import CategoriesPage from '@/pages/desktop/Categories'
import MobileLayout from '@/pages/mobile/Layout'
import MobileHome from '@/pages/mobile/Home'
import MobileScan from '@/pages/mobile/Scan'
import MobileInventory from '@/pages/mobile/Inventory'
import MobileMoves from '@/pages/mobile/Moves'
import MobileProfile from '@/pages/mobile/Profile'
import MobileProducts from '@/pages/mobile/Products'
import MobileWarehouses from '@/pages/mobile/Warehouses'
import MobileCategories from '@/pages/mobile/Categories'
import MobileUsers from '@/pages/mobile/Users'
import OutOfStockPage from '@/pages/desktop/OutOfStock'
import MobileOutOfStock from '@/pages/mobile/OutOfStock'

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuthStore()
  const location = useLocation()

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    )
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />
  }

  return <>{children}</>
}

export default function App() {
  const { checkAuth, loading } = useAuthStore()
  const { isMobile } = useDevice()
  const [init, setInit] = useState(false)

  useEffect(() => {
    checkAuth().finally(() => setInit(true))
  }, [checkAuth])

  if (!init && loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    )
  }

  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />

      {/* 移动端路由 */}
      {isMobile && (
        <Route
          path="/m/*"
          element={
            <ProtectedRoute>
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
          <Route path="warehouses" element={<MobileWarehouses />} />
          <Route path="categories" element={<MobileCategories />} />
          <Route path="users" element={<MobileUsers />} />
        </Route>
      )}

      {/* 桌面端路由（默认） */}
      <Route
        path="/*"
        element={
          <ProtectedRoute>
            <DesktopLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<Navigate to={isMobile ? '/m' : '/dashboard'} replace />} />
        <Route path="dashboard" element={<DashboardPage />} />
        <Route path="m" element={<Navigate to="/m" replace />} />
        <Route path="products" element={<ProductsPage />} />
        <Route path="categories" element={<CategoriesPage />} />
        <Route path="warehouses" element={<WarehousesPage />} />
        <Route path="stock-in" element={<StockInPage />} />
        <Route path="stock-out" element={<StockOutPage />} />
        <Route path="inventory" element={<InventoryPage />} />
        <Route path="moves" element={<StockMovesPage />} />
        <Route path="users" element={<UsersPage />} />
        <Route path="out-of-stock" element={<OutOfStockPage />} />
      </Route>
    </Routes>
  )
}
