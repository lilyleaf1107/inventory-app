export type UserRole = 'super_admin' | 'admin' | 'warehouse_manager' | 'staff'

export interface Profile {
  id: string
  name: string | null
  role: UserRole
  created_at: string
}

export interface Product {
  id: string
  sku: string | null
  name: string
  barcode: string | null
  category: string | null
  spec: string | null
  unit: string
  image_path: string | null
  description: string | null
  min_stock: number
  is_material_area: boolean
  cost: number | null
  on_shelf: boolean
  created_at: string
  updated_at: string
}

export interface Material {
  id: string
  name: string
  spec: string | null
  is_out_of_stock_marked: boolean
  created_at: string
  updated_at: string
}

export interface Warehouse {
  id: string
  code: string
  name: string | null
  address: string | null
  sort_order: number
  created_at: string
}

export interface Location {
  id: string
  warehouse_id: string
  code: string
  zone: string | null
  rack: string | null
  level: string | null
  position: string | null
  description: string | null
}

export interface Inventory {
  id: string
  product_id: string
  location_id: string
  quantity: number
  batch_no: string | null
  updated_at: string
}

export interface StockMove {
  id: string
  product_id: string
  location_id: string
  move_type: 'in' | 'out'
  quantity: number
  scan_mode: 'manual' | 'scan'
  batch_no: string | null
  remark: string | null
  operator_id: string
  created_at: string
}

export interface Category {
  id: string
  name: string
  parent_id: string | null
  sort_order: number
  created_at: string
}

export interface Tag {
  id: string
  name: string
  color: string | null
  created_at: string
}

export interface ProductTag {
  product_id: string
  tag_id: string
}
