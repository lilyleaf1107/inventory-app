# 系统优化方案与 BUG 修复计划

## 一、调研结论

### 当前架构
- **前端**：React 18 + TypeScript + Vite，响应式设计（≤768px 移动端 Tab 导航 / >768px 桌面端侧边栏导航）
- **状态管理**：React Query（数据层）+ Zustand（auth）
- **后端**：Supabase（PostgreSQL + Auth），使用 RPC 函数 `stock_in` / `stock_out` 处理出入库事务
- **路由**：App.tsx 中按 isMobile 分发 `/m/*`（移动端）和根路由（桌面端）
- **角色权限**：super_admin / admin / warehouse_manager / staff 四级，由 `lib/permissions.ts` 和 `store/auth.ts` 控制

### 需修改的核心模块

| 模块 | 现状 | 需要变更 |
|------|------|----------|
| useLowStock.ts | 阈值 50/30/10 | 改为 30/15/5 |
| products 表 | 有 is_material_area 列 | 增加 cost（numeric,可空）、on_shelf（boolean,默认true）；移除 is_material_area 相关 UI |
| 物料管理 | 无此模块 | 新增 materials 表 + 桌面/移动端页面 + 导航入口 |
| 产品管理 | 无上架/成本列 | 加「上架」按钮列 + 「成本」列 + 编辑表单加成本输入 |
| 入库页面 | 选择产品后库位空 | 自动预设产品最近一次入库库位 |
| 仓库管理 | 库位列表不显示产品 | 库位表格加「占位产品」列 |
| 工作台统计 | productCount 用错误字段读取 | 改为正确读取 count |
| 库存查询 | 搜索条件可能有嵌套过滤问题 | 修复 SQL 查询方式 |

---

## 二、数据库迁移（0009 ~ 0011）

### 0009_products_extra_columns.sql
```
products 表：
  - cost: numeric(12,2) DEFAULT NULL（成本，可空）
  - on_shelf: boolean DEFAULT true（上架状态）
  - DROP 策略中 is_material_area 相关（如有）
```

### 0010_materials_table.sql
```
materials 表：
  - id: uuid DEFAULT gen_random_uuid() PRIMARY KEY
  - name: text NOT NULL（物料名称）
  - spec: text（规格）
  - is_out_of_stock_marked: boolean DEFAULT false（是否手动缺货标红）
  - created_at: timestamptz DEFAULT now()
  - updated_at: timestamptz DEFAULT now()
  - RLS 策略：
    - select: authenticated + 所有角色可读
    - insert/update/delete: warehouse_manager 及以上
```

### 0011_reset_material_flag.sql（可选，按需执行）
```
-- 如用户不再需要 is_material_area 字段，可保留列但隐藏 UI
-- （本计划不删除列，只隐藏 UI，避免历史数据丢失）
```

---

## 三、代码变更清单

### 1. 低库存阈值调整

**文件**：`src/hooks/useLowStock.ts`
- LOW_STOCK_THRESHOLD_WARNING: 50 → **30**
- LOW_STOCK_THRESHOLD_DANGER: 30 → **15**
- LOW_STOCK_THRESHOLD_CRITICAL: 10 → **5**
- 颜色映射不变

**影响文件**（引用阈值常量的）：
- `src/pages/desktop/LowStock.tsx`（标题、统计卡片文案、ratioPercent 计算分母）
- `src/pages/mobile/LowStock.tsx`（同上）

---

### 2. 物料管理模块（新增）

#### 2.1 类型定义
**文件**：`src/types/index.ts`
```ts
export interface Material {
  id: string
  name: string
  spec: string | null
  is_out_of_stock_marked: boolean
  created_at: string
  updated_at: string
}
```

#### 2.2 桌面端页面
**新建**：`src/pages/desktop/Materials.tsx`
- 结构参考 Products.tsx
- 顶部：搜索框 + 新增物料按钮
- 新增弹窗：name（必填）、spec（可空）
- 表格列：
  - 物料名称
  - 规格
  - 状态按钮列（标红 / 取消标红 toggle 按钮；标红时整行 bg-red-50）
  - 创建时间
  - 操作（编辑 / 删除）

#### 2.3 移动端页面
**新建**：`src/pages/mobile/Materials.tsx`
- 结构参考 mobile/Products.tsx
- 卡片列表展示：标题 + 规格；标红时卡片边框红
- 顶部 FAB 新增物料；长按/点击右侧操作区可标红/取消

#### 2.4 导航入口
- **桌面端 Layout.tsx**：`navItems` 中插入 `{ to: '/materials', label: '物料管理', icon: Boxes }`（放在分类管理和仓库管理之间或仓库管理之后）
- **移动端 Home.tsx**：功能区加入「物料管理」入口；Layout.tsx Tab 栏加入对应图标 Tab + Route
- **App.tsx**：添加 MaterialsPage（桌面/MobileMaterials 移动）懒加载与路由

---

### 3. 产品管理 - 上架按钮列 + 成本列 + 移除物料相关

**文件**：`src/pages/desktop/Products.tsx`
- 表格列调整：
  - 移除「物料区」标签（不展示 `is_material_area`）
  - 编辑弹窗移除「标记为物料」复选框
  - ProductForm 移除 `isMaterialArea` 字段 + 相关上传/读取逻辑
  - 新增「成本」列：空则显示空白（`''` 或 `'-'`），不为空显示 `¥${cost}`
  - 新增「状态」列：按钮 `<Button variant="outline" size="sm">` 显示「已上架」（green）/ 「未上架」（gray），点击 toggle 调用 update 接口
- 产品查询 select 中加入 cost 和 on_shelf
- 新增/更新 mutations 中加入 cost（numeric 或 null）和 on_shelf（不传时保持默认 true）

**文件**：`src/pages/mobile/Products.tsx`
- 同步移除物料标签和标记按钮
- 产品卡片显示成本（有则显示，无则不展示）
- 卡片右上或详情加「上架/下架」切换

**文件**：`src/types/index.ts` - Product 接口增加 `cost: number | null` 和 `on_shelf: boolean`

**文件**：产品编辑弹窗（两个平台的 Form）
- 新增 Input「成本」，type="number"，非必填，留空不提交
- 展示时 `form.cost` 初始化为 `product.cost ?? ''`，提交时 `cost: form.cost ? Number(form.cost) : null`

---

### 4. 入库页面 - 默认当前库位

**文件**：`src/pages/desktop/StockIn.tsx`
- 当 `product` 变化（选中产品）时，额外发送一次 query：
  - 从 `stock_moves` 取该产品最近 move_type='in' 的 location_id
  - 或从 `inventory` 取该产品库存数量最多的库位 location_id
- 将查询到的 location_id 自动填入 `setLocationId`
- 若该库位所在 warehouse 与当前 warehouseId 不同，自动切换 warehouseId

**文件**：`src/pages/mobile/Scan.tsx`（移动端入库场景）
- 扫出产品后，同样逻辑预设库位

推荐使用 `inventory` 表取该产品有库存的库位（按数量降序取第一个），比 `stock_moves` 更快且更符合「当前已入库库位」语义：
```sql
select location_id, quantity from inventory
where product_id = 'xxx'
order by quantity desc, updated_at desc
limit 1
```

---

### 5. 仓库管理 - 库位显示占位产品

**文件**：`src/pages/desktop/Warehouses.tsx`
- 库位表格中新增一列「占位产品」
- 位置详情查询改为同时关联 inventory.products
- 显示内容：
  - 有 1 个产品：产品名（+数量）
  - 多个产品：「产品A x2 产品B x5 ...」或折叠显示（超 2 个显示前 2 个 + "等 N 种"）
  - 无产品：显示「空」文字（灰色）
- 查询：对每个 warehouse 的 locations，一次 join inventory + products，或用已有的 inventory 数据 map 按 location_id 聚合（推荐后者，复用 `products-locations-map` 类似缓存）

**文件**：`src/pages/mobile/Warehouses.tsx`
- 同步：库位卡片/列表加入占位产品文本

---

### 6. BUG 修复

#### 6.1 工作台产品总数为 0

**位置**：`src/pages/desktop/Dashboard.tsx` 第 77 行、`src/pages/mobile/Home.tsx` 第 33 行
- 现状：`supabase.from('products').select('id', { count: 'exact', head: true })` → 响应是**没有 data 数组，只有 count 字段**
- 但代码读取 `products?.length ?? 0`，当 head:true 时 data 为 undefined，所以 `?? 0` → 0
- 修复：用解构 `{ count }` 或 `error` 取 count
```ts
// Dashboard 修复：
const { count: productCount } = await supabase
  .from('products').select('*', { count: 'exact', head: true })
// 替代 products?.length
```

同步修复 `warehouses?.length`（同一模式）。

#### 6.2 库存查询查不到产品

**位置**：`src/pages/desktop/Inventory.tsx` 第 130-145 行
- 现状：`.or('product.name.ilike.xxx')` 使用 `product.xxx` 是**嵌套字段过滤**，Supabase PostgREST 可能不支持（取决于外键关系），导致过滤条件永远为 false → 查不到
- 同时 `.limit(200)` 可能限制了（若库存多）最新的不出现
- 修复方向：先查 products 表匹配名称/SKU/条码，得到 product_ids，再用 inventory 表 `in` 过滤
```ts
// 两步查询更可靠：
let productIds: string[] | null = null
if (search) {
  const { data: prods } = await supabase.from('products')
    .select('id')
    .or(`name.ilike.%${search}%,sku.ilike.%${search}%,barcode.ilike.%${search}%`)
  productIds = prods?.map(p => p.id) || []
  if (productIds.length === 0) return [] // 搜不到直接返回空
}
// 然后 inventory 查询时加 product_id in productIds
```

同步修复 `src/pages/mobile/Inventory.tsx`（同类查询模式）。

---

## 四、迁移与部署顺序

1. 提交代码（含页面/hooks/路由/类型）
2. 在 Supabase SQL Editor **按顺序**执行迁移：
   - 0009_products_extra_columns.sql（products 加 cost/on_shelf）
   - 0010_materials_table.sql（物料表 + RLS）
3. 触发 Netlify 部署
4. 验证各页面

---

## 五、风险与注意项

| 风险 | 影响 | 处理 |
|------|------|------|
| 0009 添加列时 data migrations 失败 | 不影响生产数据 | DDL 用 `add column if not exists` 幂等 |
| 低库存阈值 50→30 后黄色预警数量骤降 | 业务展示变化 | 提前告知用户 |
| 入库自动填库位时用户仍想改 | 体验冲突 | 保留手动切换能力，只做默认值 |
| 库存查询改成两步查询后性能略降 | 延迟增加 | 可接受（search 非空时才走两步，量在数百级不显著） |
| 物料管理手动标红 vs 自动缺货 | 语义重复 | 手动标记优先（视觉红 + 独立 boolean），不自动覆盖 |

---

## 六、文件变更清单（汇总）

### 新建
- `supabase/migrations/0009_products_extra_columns.sql`
- `supabase/migrations/0010_materials_table.sql`
- `src/pages/desktop/Materials.tsx`
- `src/pages/mobile/Materials.tsx`

### 修改
- `src/hooks/useLowStock.ts`（阈值常量）
- `src/types/index.ts`（Product 加 cost/on_shelf、新增 Material）
- `src/pages/desktop/LowStock.tsx`（文案 + 分母）
- `src/pages/mobile/LowStock.tsx`（文案 + 分母）
- `src/pages/desktop/Products.tsx`（列调整、Form 调整）
- `src/pages/mobile/Products.tsx`（同步）
- `src/pages/desktop/StockIn.tsx`（自动填库位）
- `src/pages/mobile/Scan.tsx`（同步）
- `src/pages/desktop/Warehouses.tsx`（库位列加占位产品）
- `src/pages/mobile/Warehouses.tsx`（同步）
- `src/pages/desktop/Dashboard.tsx`（修复 productCount 读取）
- `src/pages/mobile/Home.tsx`（修复 productCount 读取）
- `src/pages/desktop/Inventory.tsx`（修复搜索查不到）
- `src/pages/mobile/Inventory.tsx`（同步）
- `src/pages/desktop/Layout.tsx`（新增物料管理导航）
- `src/pages/mobile/Layout.tsx`（同步）
- `src/pages/mobile/Home.tsx`（功能区加入物料管理）
- `src/App.tsx`（路由 + 懒加载）
