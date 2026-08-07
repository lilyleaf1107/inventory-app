-- 0009: products 表新增 cost 和 on_shelf 列
-- 在 Supabase Dashboard -> SQL Editor 中执行

alter table public.products add column if not exists cost numeric(12,2);
alter table public.products add column if not exists on_shelf boolean default true;

-- 给已有数据补 on_shelf=true（安全起见）
update public.products set on_shelf = true where on_shelf is null;

select pg_sleep(1);
