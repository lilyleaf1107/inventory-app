-- 0001 初始化数据库表结构
-- 在 Supabase Dashboard -> SQL Editor 中执行

-- 启用 uuid 扩展
create extension if not exists "pgcrypto";

-- ========== 产品表 ==========
create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  sku text unique not null,
  name text not null,
  barcode text,
  category text,
  spec text,
  unit text not null default '个',
  image_path text,
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_products_name on public.products (name);
create index if not exists idx_products_barcode on public.products (barcode);
create index if not exists idx_products_category on public.products (category);

-- ========== 仓库表 ==========
create table if not exists public.warehouses (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  name text not null,
  address text,
  created_at timestamptz not null default now()
);

-- ========== 库位表 ==========
create table if not exists public.locations (
  id uuid primary key default gen_random_uuid(),
  warehouse_id uuid not null references public.warehouses(id) on delete cascade,
  code text not null,
  description text,
  unique (warehouse_id, code)
);

create index if not exists idx_locations_warehouse on public.locations (warehouse_id);

-- ========== 库存表 ==========
create table if not exists public.inventory (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  location_id uuid not null references public.locations(id) on delete restrict,
  quantity numeric(12,2) not null default 0,
  batch_no text,
  updated_at timestamptz not null default now(),
  unique (product_id, location_id)
);

create index if not exists idx_inventory_product on public.inventory (product_id);
create index if not exists idx_inventory_location on public.inventory (location_id);

-- ========== 进出库流水表 ==========
create table if not exists public.stock_moves (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete restrict,
  location_id uuid not null references public.locations(id) on delete restrict,
  move_type text not null check (move_type in ('in', 'out')),
  quantity numeric(12,2) not null,
  scan_mode text not null default 'manual' check (scan_mode in ('manual', 'scan')),
  batch_no text,
  remark text,
  operator_id uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create index if not exists idx_stock_moves_product on public.stock_moves (product_id);
create index if not exists idx_stock_moves_created on public.stock_moves (created_at desc);
create index if not exists idx_stock_moves_operator on public.stock_moves (operator_id);
create index if not exists idx_stock_moves_type on public.stock_moves (move_type);

-- ========== 用户扩展信息表 ==========
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text,
  role text not null default 'staff' check (role in ('admin', 'staff')),
  created_at timestamptz not null default now()
);

-- ========== 触发器：自动创建 profile ==========
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, name, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'name', split_part(new.email, '@', 1)),
    'staff'
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ========== 触发器：updated_at 自动更新 ==========
create or replace function public.trigger_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_products_updated_at on public.products;
create trigger set_products_updated_at
  before update on public.products
  for each row execute function public.trigger_set_updated_at();

drop trigger if exists set_inventory_updated_at on public.inventory;
create trigger set_inventory_updated_at
  before update on public.inventory
  for each row execute function public.trigger_set_updated_at();

-- ========== 入库函数（事务封装） ==========
create or replace function public.stock_in(
  p_product_id uuid,
  p_location_id uuid,
  p_quantity numeric,
  p_batch_no text default null,
  p_scan_mode text default 'manual',
  p_remark text default null,
  p_operator_id uuid default null
)
returns void
language plpgsql
as $$
begin
  -- 插入流水
  insert into public.stock_moves (
    product_id, location_id, move_type, quantity,
    batch_no, scan_mode, remark, operator_id
  ) values (
    p_product_id, p_location_id, 'in', p_quantity,
    p_batch_no, p_scan_mode, p_remark, p_operator_id
  );

  -- 更新库存
  insert into public.inventory (product_id, location_id, quantity, batch_no)
  values (p_product_id, p_location_id, p_quantity, p_batch_no)
  on conflict (product_id, location_id) do update
  set quantity = public.inventory.quantity + p_quantity,
      batch_no = coalesce(excluded.batch_no, public.inventory.batch_no),
      updated_at = now();
end;
$$;

-- ========== 出库函数（事务封装） ==========
create or replace function public.stock_out(
  p_product_id uuid,
  p_location_id uuid,
  p_quantity numeric,
  p_batch_no text default null,
  p_scan_mode text default 'manual',
  p_remark text default null,
  p_operator_id uuid default null
)
returns void
language plpgsql
as $$
declare
  v_current_qty numeric;
begin
  -- 检查库存
  select quantity into v_current_qty
  from public.inventory
  where product_id = p_product_id
    and location_id = p_location_id
  for update;

  if v_current_qty is null or v_current_qty < p_quantity then
    raise exception '库存不足，当前库存：%，出库数量：%', coalesce(v_current_qty, 0), p_quantity;
  end if;

  -- 插入流水
  insert into public.stock_moves (
    product_id, location_id, move_type, quantity,
    batch_no, scan_mode, remark, operator_id
  ) values (
    p_product_id, p_location_id, 'out', p_quantity,
    p_batch_no, p_scan_mode, p_remark, p_operator_id
  );

  -- 扣减库存
  update public.inventory
  set quantity = quantity - p_quantity,
      updated_at = now()
  where product_id = p_product_id
    and location_id = p_location_id;
end;
$$;
