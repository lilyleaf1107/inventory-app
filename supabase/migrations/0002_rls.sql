-- RLS 行级安全策略
-- 在 Supabase Dashboard -> SQL Editor 中执行（在 0001_init.sql 之后执行）

-- 启用所有表的 RLS
alter table public.products enable row level security;
alter table public.warehouses enable row level security;
alter table public.locations enable row level security;
alter table public.inventory enable row level security;
alter table public.stock_moves enable row level security;
alter table public.profiles enable row level security;

-- 辅助函数：获取当前用户角色
create or replace function public.current_user_role()
returns text
language plpgsql
stable
security definer set search_path = public
as $$
declare
  v_role text;
begin
  select role into v_role
  from public.profiles
  where id = auth.uid();
  return coalesce(v_role, 'staff');
end;
$$;

-- ========== products 表策略 ==========
-- 所有登录用户可读
drop policy if exists "products: read authenticated" on public.products;
create policy "products: read authenticated"
  on public.products for select
  using (auth.role() = 'authenticated');

-- 管理员可写
drop policy if exists "products: admin write" on public.products;
create policy "products: admin write"
  on public.products for all
  using (public.current_user_role() = 'admin')
  with check (public.current_user_role() = 'admin');

-- ========== warehouses 表策略 ==========
drop policy if exists "warehouses: read authenticated" on public.warehouses;
create policy "warehouses: read authenticated"
  on public.warehouses for select
  using (auth.role() = 'authenticated');

drop policy if exists "warehouses: admin write" on public.warehouses;
create policy "warehouses: admin write"
  on public.warehouses for all
  using (public.current_user_role() = 'admin')
  with check (public.current_user_role() = 'admin');

-- ========== locations 表策略 ==========
drop policy if exists "locations: read authenticated" on public.locations;
create policy "locations: read authenticated"
  on public.locations for select
  using (auth.role() = 'authenticated');

drop policy if exists "locations: admin write" on public.locations;
create policy "locations: admin write"
  on public.locations for all
  using (public.current_user_role() = 'admin')
  with check (public.current_user_role() = 'admin');

-- ========== inventory 表策略 ==========
drop policy if exists "inventory: read authenticated" on public.inventory;
create policy "inventory: read authenticated"
  on public.inventory for select
  using (auth.role() = 'authenticated');

-- 所有登录用户可通过 RPC 函数修改（函数里有自己的校验）
drop policy if exists "inventory: authenticated write via rpc" on public.inventory;
create policy "inventory: authenticated write via rpc"
  on public.inventory for all
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

-- ========== stock_moves 表策略 ==========
drop policy if exists "stock_moves: read own or admin" on public.stock_moves;
create policy "stock_moves: read own or admin"
  on public.stock_moves for select
  using (
    public.current_user_role() = 'admin'
    or operator_id = auth.uid()
  );

drop policy if exists "stock_moves: authenticated insert" on public.stock_moves;
create policy "stock_moves: authenticated insert"
  on public.stock_moves for insert
  with check (auth.role() = 'authenticated');

-- ========== profiles 表策略 ==========
drop policy if exists "profiles: read own or admin" on public.profiles;
create policy "profiles: read own or admin"
  on public.profiles for select
  using (
    public.current_user_role() = 'admin'
    or id = auth.uid()
  );

drop policy if exists "profiles: update own" on public.profiles;
create policy "profiles: update own"
  on public.profiles for update
  using (id = auth.uid())
  with check (id = auth.uid());

drop policy if exists "profiles: admin all" on public.profiles;
create policy "profiles: admin all"
  on public.profiles for all
  using (public.current_user_role() = 'admin')
  with check (public.current_user_role() = 'admin');
