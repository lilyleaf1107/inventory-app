-- 0007 补丁：SKU 改为可空
-- 项目约定：SKU 不是必填字段，允许留空
-- 在 Supabase Dashboard -> SQL Editor 中执行

-- 移除 not null 约束（保留 unique 约束，允许 NULL）
-- 注意：PostgreSQL 中 unique 约束允许多个 NULL 值，不会冲突
alter table public.products
  alter column sku drop not null;
