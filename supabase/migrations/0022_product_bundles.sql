-- ============================================================
-- 0022: 出货组合（预设组合，扫组合码一次性出库多个产品）
-- ============================================================

-- 组合表
create table if not exists public.product_bundles (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  code text not null unique,
  remark text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 组合明细表
create table if not exists public.product_bundle_items (
  id uuid primary key default gen_random_uuid(),
  bundle_id uuid not null references public.product_bundles(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  quantity numeric not null default 1 check (quantity > 0),
  created_at timestamptz not null default now(),
  unique (bundle_id, product_id)
);

create index if not exists idx_bundle_items_bundle on public.product_bundle_items(bundle_id);

-- 自动更新 updated_at
create or replace function public.touch_bundle_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists trg_bundle_updated on public.product_bundles;
create trigger trg_bundle_updated
  before update on public.product_bundles
  for each row execute function public.touch_bundle_updated_at();

-- RLS
alter table public.product_bundles enable row level security;
alter table public.product_bundle_items enable row level security;

-- product_bundles：所有登录用户可读，库管及以上可写
drop policy if exists bundles_select on public.product_bundles;
create policy bundles_select on public.product_bundles
  for select using (auth.role() = 'authenticated');

drop policy if exists bundles_write on public.product_bundles;
create policy bundles_write on public.product_bundles
  for all using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.role in ('super_admin', 'admin', 'warehouse_manager')
    )
  ) with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.role in ('super_admin', 'admin', 'warehouse_manager')
    )
  );

-- product_bundle_items：同上
drop policy if exists bundle_items_select on public.product_bundle_items;
create policy bundle_items_select on public.product_bundle_items
  for select using (auth.role() = 'authenticated');

drop policy if exists bundle_items_write on public.product_bundle_items;
create policy bundle_items_write on public.product_bundle_items
  for all using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.role in ('super_admin', 'admin', 'warehouse_manager')
    )
  ) with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.role in ('super_admin', 'admin', 'warehouse_manager')
    )
  );
