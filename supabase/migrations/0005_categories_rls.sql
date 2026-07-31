-- 0005 categories / tags 表 RLS 策略
-- 解决创建分类时 "new row violates row-level security policy for table 'categories'" 错误
-- 在 Supabase Dashboard -> SQL Editor 中执行

-- ========== 启用 RLS ==========
alter table public.categories enable row level security;
alter table public.tags enable row level security;

-- ========== categories 表策略 ==========
-- 所有登录用户可读
drop policy if exists "categories: read authenticated" on public.categories;
create policy "categories: read authenticated"
  on public.categories for select
  using (auth.role() = 'authenticated');

-- 管理员/库管可写（与 products 表权限保持一致）
drop policy if exists "categories: manager write" on public.categories;
create policy "categories: manager write"
  on public.categories for all
  using (
    public.current_user_role() in ('super_admin', 'admin', 'warehouse_manager')
  )
  with check (
    public.current_user_role() in ('super_admin', 'admin', 'warehouse_manager')
  );

-- ========== tags 表策略 ==========
-- 所有登录用户可读
drop policy if exists "tags: read authenticated" on public.tags;
create policy "tags: read authenticated"
  on public.tags for select
  using (auth.role() = 'authenticated');

-- 管理员/库管可写
drop policy if exists "tags: manager write" on public.tags;
create policy "tags: manager write"
  on public.tags for all
  using (
    public.current_user_role() in ('super_admin', 'admin', 'warehouse_manager')
  )
  with check (
    public.current_user_role() in ('super_admin', 'admin', 'warehouse_manager')
  );

-- ========== product_tags 关联表策略 ==========
-- 所有登录用户可读
alter table public.product_tags enable row level security;
drop policy if exists "product_tags: read authenticated" on public.product_tags;
create policy "product_tags: read authenticated"
  on public.product_tags for select
  using (auth.role() = 'authenticated');

drop policy if exists "product_tags: manager write" on public.product_tags;
create policy "product_tags: manager write"
  on public.product_tags for all
  using (
    public.current_user_role() in ('super_admin', 'admin', 'warehouse_manager')
  )
  with check (
    public.current_user_role() in ('super_admin', 'admin', 'warehouse_manager')
  );
