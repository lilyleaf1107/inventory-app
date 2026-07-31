-- 0006 补丁：确保 products 表包含 is_material_area 列
-- 解决 "Could not find the 'is_material_area' column of 'products' in the schema cache" 错误
-- 在 Supabase Dashboard -> SQL Editor 中执行

-- 幂等添加 is_material_area 列（若已存在则跳过）
alter table public.products
  add column if not exists is_material_area boolean not null default false;

-- min_stock 列保留（虽已不再使用输入框，但类型定义和历史数据仍引用）
alter table public.products
  add column if not exists min_stock numeric(12,2) not null default 0;

-- 等待 1 秒，确保 Supabase schema cache 自动刷新后再返回
select pg_sleep(1);
