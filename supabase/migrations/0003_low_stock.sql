-- 添加低库存预警字段到 products 表
alter table public.products
  add column if not exists min_stock numeric(12,2) not null default 0,
  add column if not exists is_material_area boolean not null default false;
