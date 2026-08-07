-- 0010: 新建物料管理表 materials 及 RLS 策略
-- 在 Supabase Dashboard -> SQL Editor 中执行

create table if not exists public.materials (
  id uuid default gen_random_uuid() primary key,
  name text not null,
  spec text,
  is_out_of_stock_marked boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.materials enable row level security;

-- 读取：所有登录用户可读
drop policy if exists "materials_select_policy" on public.materials;
create policy "materials_select_policy" on public.materials
  for select using (auth.role() = 'authenticated');

-- 插入：warehouse_manager 及以上（非 staff）
drop policy if exists "materials_insert_policy" on public.materials;
create policy "materials_insert_policy" on public.materials
  for insert with check (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and role in ('super_admin', 'admin', 'warehouse_manager')
    )
  );

-- 更新：warehouse_manager 及以上
drop policy if exists "materials_update_policy" on public.materials;
create policy "materials_update_policy" on public.materials
  for update using (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and role in ('super_admin', 'admin', 'warehouse_manager')
    )
  ) with check (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and role in ('super_admin', 'admin', 'warehouse_manager')
    )
  );

-- 删除：warehouse_manager 及以上
drop policy if exists "materials_delete_policy" on public.materials;
create policy "materials_delete_policy" on public.materials
  for delete using (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and role in ('super_admin', 'admin', 'warehouse_manager')
    )
  );

select pg_sleep(1);
