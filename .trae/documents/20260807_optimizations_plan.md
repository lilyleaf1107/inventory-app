# 8月7日 五项优化计划

## 一、需求背景与研究结论

对照用户5项需求 + 现有代码现状，总结关键差异如下：

### 1.1 桌面端 vs 移动端 功能入口对照

| 桌面端侧边栏菜单项 | 路由 | 移动端是否有入口（底部Tab/主页/我的） | 本次动作 |
|---|---|---|---|
| 工作台 | /dashboard | ✅ 底部Tab「首页」| 无需改动 |
| 产品管理 | /products | ✅ 主页管理区已有 | 无需改动 |
| 物料管理 | /materials | ✅ 主页管理区已有 | 无需改动 |
| 分类管理 | /categories | ❌ 仅在「我的」页面 | **移到主页管理区** |
| 仓库管理 | /warehouses | ✅ 主页管理区已有 | 无需改动 |
| 入库 | /stock-in | ✅ 功能区「扫码入库」 | 管理区再加文字入口 |
| 出库 | /stock-out | ✅ 功能区「扫码出库」 | 管理区再加文字入口 |
| 库存查询 | /inventory | ✅ 功能区「查库存」+ 底部Tab | 管理区再加文字入口 |
| 缺货提醒 | /out-of-stock | ✅ 主页管理区已有 | 无需改动 |
| 低库存预警 | /low-stock | ✅ 主页管理区已有 | 无需改动 |
| 进出库记录 | /moves | ✅ 底部Tab「记录」 | 管理区再加文字入口 |
| 用户管理（管理员） | /users | ❌ 仅在「我的」页面 | **移到主页管理区（仅管理员可见）** |
| 设置（管理员，disabled） | /settings | ❌ | 因功能 disabled，暂不加入口 |

结论：需在「主页管理区」**补齐 分类管理 / 入库 / 出库 / 库存查询 / 进出库记录 / 用户管理（管理员）** 共6项；「我的」页面**移除所有管理功能和"切换到电脑端"**，仅保留用户信息 + 退出登录。

### 1.2 成本字段权限现状
- 权限判断函数 `isAdminAbove()` 已在 `src/lib/permissions.ts` 定义
- 桌面端 `Products.tsx`：表格成本列（~Line 647）、编辑表单成本输入（~Line 794）均**未做权限隐藏**
- 移动端 `Products.tsx`：列表卡片成本显示（~Line 609）、编辑表单成本输入（~Line 790）均**未做权限隐藏**

### 1.3 仓库管理分层展示现状
桌面端 `Warehouses.tsx` 当前分层结构是 **zone → rack → locations(level+position 平铺)**。用户要求"延伸到货架层一栏进行调整"，实际是把每个 rack 下再按 **level（层）** 分组，形成 **zone → rack → level → locations** 三级分层，每层 level 可折叠/展开。

### 1.4 移动端库存页现状
缺少 3 项桌面端的可视化元素：① 统计卡片（SKU 数 / 总数量 / 仓库数）；② 仓库下拉筛选；③ 分类下拉筛选。需补齐。

### 1.5 移动端白屏可能原因
- 所有页面用 `React.lazy + Suspense` 懒加载，**无 ErrorBoundary 兜底**，懒加载失败（网络/缓存）时直接白屏
- `ProtectedRoute` 中 Suspense 仅显示转圈 Loading，无错误提示
- PWA Service Worker 可能缓存旧版本资源
- `useDevice` 判断时序与路由互斥可能有竞态

---

## 二、具体修改步骤与对应文件

### 步骤 1：成本字段权限控制（双端同步）
**目标：** super_admin 和 admin 可见+可修改成本；warehouse_manager 和 staff 完全看不到

| # | 文件 | 修改内容 |
|---|---|---|
| 1.1 | `src/pages/desktop/Products.tsx` | - 表格成本列 `<TableCell>` 外包裹 `{canManageUsers() && (...)}`（或 `isAdminAbove(profile)` 等价判断）<br>- 编辑表单中成本 `<div className="space-y-2"><Label>成本</Label>...</div>` 外同样包裹权限判断 |
| 1.2 | `src/pages/mobile/Products.tsx` | - 列表卡片详情中 `{p.cost != null && <span>成本...</span>}` 外包裹权限判断<br>- 编辑表单中成本 Input 块包裹权限判断 |
| 1.3 | `src/store/auth.ts` | 新增 `canViewCost()` 方法（复用 `isAdminAbove` 逻辑，保持与 store 其他方法风格一致，便于统一调用） |

### 步骤 2：仓库管理库位分层 → 三级（zone → rack → level → locations）
**目标：** 在每个 rack 内再按 level 聚合展示，level 可折叠

| # | 文件 | 修改内容 |
|---|---|---|
| 2.1 | `src/pages/desktop/Warehouses.tsx` | - **新增函数 `groupByLevel(locations[])`**：把 rack 下的 locations 按 `level` 字段（空值归为「未分层」）分组，返回 `{ level, locations[] }`<br>- **新增 `collapsedLevels` state**：`Set<string>`，key 用 `${zone}-${rack}-${level}`<br>- **新增 `toggleLevel(zone, rack, level)`** 函数 |
| 2.2 | 同上 | - 分层模式 JSX 渲染：在 rack 区块内，先调用 `groupByLevel(rack.locations)` 得到 level 组数组<br>- 每个 level 组渲染一个可折叠的小标题条（显示"X层 · 已占用Y/总数Z"），点击箭头切换折叠<br>- level 未折叠时再渲染里面的库位网格（和原 locations 网格样式一致） |
| 2.3 | `src/pages/mobile/Warehouses.tsx` | - 同步桌面端 2.1 / 2.2 逻辑：新增 `groupByLevel` 函数、`collapsedLevels` state、`toggleLevel` 函数<br>- 移动端三级折叠交互适配（行内箭头 + 紧凑 padding） |

### 步骤 3：移动端主页补全功能入口 + 精简「我的」页面
**目标：** 桌面端侧边栏全部功能在主页可见；「我的」页面只剩用户信息 + 退出登录

| # | 文件 | 修改内容 |
|---|---|---|
| 3.1 | `src/pages/mobile/Home.tsx` | - **管理区 `manageEntries` 数组追加**：<br>　{ to:'/m/categories', label:'分类管理', desc:'维护产品分类', icon:FolderOpen, iconClass, bgClass }<br>　{ to:'/m/stock-in', label:'入库', desc:'扫码/手动入库操作', icon:ArrowDownToLine, requireWrite:true, ... }<br>　{ to:'/m/stock-out', label:'出库', desc:'扫码/手动出库操作', icon:ArrowUpFromLine, requireWrite:true, ... }<br>　{ to:'/m/inventory', label:'库存查询', desc:'搜索库存及分布', icon:Search, ... }<br>　{ to:'/m/moves', label:'进出库记录', desc:'最近出入库流水', icon:List, requireWrite:true, ... }<br>　{ to:'/m/users', label:'用户管理', desc:'团队成员与权限', icon:Users, requireAdmin:true, ... }<br>- 新增图标 `FolderOpen / List / Users` 从 lucide-react 导入<br>- `manageEntries` 过滤条件：除了 requireWrite 再处理 requireAdmin（调用 `canManageUsers()`）<br>- 检查排序合理性：管理高频操作靠前 |
| 3.2 | 同上 | - 新增路由检查：当前 `App.tsx` 中 `/m/*` 路由**缺少 `/m/stock-in` 和 `/m/stock-out`**，需在 App.tsx 补上并指向对应移动端页面 |
| 3.3 | `src/pages/mobile/Profile.tsx` | - **删除 `menuItems` 数组及整个「管理功能」Card**<br>- **删除「切换到电脑端」Card**（含 Monitor 图标导入移除）<br>- 保留内容：顶部用户信息 Card + 底部退出登录 Button<br>- 可选：如果页面太空，可加一句文案如「功能入口请在首页查看」或留空 |
| 3.4 | `src/App.tsx` | - 补充懒加载声明：`const MobileStockIn = lazy(...)`、`const MobileStockOut = lazy(...)`<br>- 在 `/m/*` 路由下增加：`<Route path="stock-in" element={<MobileStockIn />} />`、`<Route path="stock-out" element={<MobileStockOut />} />`<br>- 检查 `src/pages/mobile/` 目录下是否已有 StockIn/StockOut 页面，若没有则基于桌面端页面做移动端适配（参考桌面端 StockIn/StockOut 简化版） |

### 步骤 4：移动端库存页 → 增加统计卡片 + 仓库/分类筛选
**目标：** 与桌面端结构对齐，信息层次清晰

| # | 文件 | 修改内容 |
|---|---|---|
| 4.1 | `src/pages/mobile/Inventory.tsx` | - 新增 `warehouseFilter`、`categoryFilter` 两个 state<br>- 新增 warehouses、categories 两个 useQuery（从 Supabase 拉取，与桌面端一致）<br>- 查询参数 `queryKey` 增加 `[..., warehouseFilter, categoryFilter]`<br>- 查询逻辑：先查产品 ID 时，除了 search 再叠加 `categoryFilter` 条件；然后在内存过滤中再叠加 `warehouseFilter` |
| 4.2 | 同上 | - 顶部统计卡片：在搜索框**上方**加 `grid grid-cols-3 gap-2` 三张卡片（或两张 cols-2，按宽度自适应）：库存SKU数 / 库存总数量 / 仓库数<br>- 计算逻辑 `totalQty = reduce`，`totalSku = length`，`warehouseCount = warehouses?.length` |
| 4.3 | 同上 | - 搜索框**下方**加 `flex gap-2` 两个 select：仓库下拉（全部仓库 + 各仓库名）、分类下拉（全部分类 + 各分类名）<br>- select 样式复用桌面端的 `h-10 w-full rounded-md border...` 类名，移动端缩短高度为 `h-9` |
| 4.4 | 同上 | - JSX 中库存卡片展示逻辑不变，但加上颜色标签"物料区/缺货/低库存"保持桌面端一致的视觉区分（当前已有，无需改动，仅验证） |

### 步骤 5：白屏问题修复 → 增加 ErrorBoundary + 降级提示 + 缓存策略
**目标：** 任何懒加载/运行时错误都不会白屏，会显示友好提示并提供刷新按钮

| # | 文件 | 修改内容 |
|---|---|---|
| 5.1 | 新建 `src/components/ErrorBoundary.tsx` | - React Class 组件 `ErrorBoundary`（函数组件无法实现，必须 class）<br>- state: `hasError: boolean`, `errorMessage?: string`<br>- `getDerivedStateFromError` 捕获错误<br>- `componentDidCatch` 打印到 console 便于排查<br>- render：出错时显示全屏居中卡片（标题"页面加载失败"、错误详情小字、两个按钮：「刷新重试」调用 `window.location.reload()`、「回首页」`navigate('/m' or '/dashboard')`）；正常时渲染 children |
| 5.2 | `src/App.tsx` | - 导入 ErrorBoundary<br>- `ProtectedRoute` 中的 `<Suspense>` 外层再包裹一层 `<ErrorBoundary>`<br>- `useEffect(() => checkAuth().finally(...))` 外面可加 try-catch 避免 checkAuth 抛错直接白屏 |
| 5.3 | 同上 + `index.html` / PWA 配置 | - 检查 `vite.config.ts` 中 PWA 插件配置：`workbox` / `registerSW` 版本号策略（例如 `globPatterns` 包含版本号、skipWaiting: true、clientsClaim: true，确保新版本立即激活）<br>- `public/manifest.json`（如有）无需改动<br>- 可选：在 `Loading` 组件里加一句小字「长时间加载中请尝试刷新页面」，超过 3 秒自动显示该提示（用 `useState + setTimeout` 实现） |
| 5.4 | `src/hooks/useDevice.ts`（若存在） | - 检查 isMobile 初始值策略：如果是 `undefined` 可能造成首次渲染走了桌面端再切到移动端，路由抖动。改为首屏用 `typeof window !== 'undefined' ? window.innerWidth <= 768 : false` 同步判断一次；再加 resize observer。避免白屏期的路由来回切换 |

---

## 三、构建与验证

| 阶段 | 操作 | 预期结果 |
|---|---|---|
| 类型检查 | `npx tsc --noEmit` | 0 errors 0 warnings |
| 生产构建 | `npm run build` | 构建成功，dist 目录生成 |
| 手动验证-成本权限 | 用库管账号登录 → 产品管理页（双端） | 表格/卡片看不到成本列；新建/编辑弹窗没有成本输入框；切回管理员又能看到 |
| 手动验证-库位三级分层 | 仓库管理 → 选有数据的仓库 → 分层模式 | 点开 A 区 → 看到 01 架 → 看到 01 层 / 02 层小标题 → 点 01 层箭头折叠 → 01 层库位隐藏 |
| 手动验证-主页功能入口 | 移动端首页「管理」区滚动 | 能看到「产品/物料/分类/仓库/入库/出库/库存查询/进出库记录/缺货提醒/低库存预警/用户管理（管理员可见）」全部 11 项 |
| 手动验证-我的页面精简 | 切到底部 Tab「我的」 | 仅显示头像+姓名+角色 + 退出登录按钮；没有管理菜单和切换电脑端按钮 |
| 手动验证-库存页 | 移动端库存页 | 顶部 3 张统计卡 + 仓库/分类下拉筛选 + 列表；筛选实际生效（选某个分类只显示该分类库存） |
| 手动验证-白屏兜底 | 打开浏览器 DevTools → Network → 勾选 "Slow 3G" + 禁用缓存 → 刷新 | 不会长时间白屏；显示 Loading 组件；若故意触发某页面错误（可临时 throw Error 测试），会显示「加载失败 + 刷新 + 回首页」卡片 |

---

## 四、部署方式

完成后走标准 GitHub → Netlify 自动部署流程：
```
git add .
git commit -m "feat: 5项优化(成本权限/三级库位/移动端功能入口/库存可视化/白屏兜底)"
git push origin main
```
等 Netlify 自动构建完成，刷新浏览器（必要时清缓存）。

---

## 五、风险与回滚

| 风险 | 影响 | 应对 |
|---|---|---|
| 新增 `/m/stock-in` `/m/stock-out` 路由但页面未实现 | 点击后报错 | 先基于桌面端 StockIn/StockOut 提取简化移动端专用组件（`src/pages/mobile/StockIn.tsx` 等），复用现有扫码 + 手动入库逻辑，UI 改成移动端单列布局 |
| ErrorBoundary class 组件与 TS 严格模式冲突 | 编译报错 | 在 class 顶部加上 `any` 兜底 state 类型，或使用 `react-error-boundary` 库（若项目已安装则直接用；未装则手写 class 最简版） |
| 三级分层后库位数据量大时渲染卡顿 | 长列表性能 | 每个 level 折叠默认**展开**，对大量数据的仓库（>1000库位）建议用户用平铺模式；暂不引入虚拟滚动 |
| PWA 旧版 Service Worker 缓存 | 用户浏览器仍白屏/看到旧版 | 告知用户：手机浏览器打开设置 → 清除该站点数据/缓存，或开无痕模式访问 |
