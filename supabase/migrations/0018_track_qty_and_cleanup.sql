-- ============================================================
-- 0018: 产品不计数量开关 + 手动状态 + 删除未入库数量 + 默认库位
--       + 出库流水加 operator_name 列
--       + 物料状态列升级为枚举（正常/低库存/缺货）
--       + 分类"零件"批量合并到"零配件"
-- 直接在 Supabase SQL Editor 粘贴整段执行
-- ============================================================

-- -------- 1. products 列改造 --------

-- 加「是否追踪具体库存数量」开关
alter table public.products
  add column if not exists track_qty boolean not null default true;

-- 加「手动状态」覆盖：不计数量产品使用这个字段显示状态
alter table public.products
  add column if not exists manual_status text
  check (manual_status is null or manual_status in ('normal', 'low_stock', 'out_of_stock'));

-- 删「未入库数量」字段（冗余）
alter table public.products
  drop column if exists unallocated_quantity;

drop index if exists idx_products_unallocated;

-- -------- 2. 默认仓库 + 默认库位（无库位入库时使用） --------

-- 如果还没默认仓库，先建一个（code = DEFAULT-WH）
do $$
begin
  if not exists (select 1 from public.warehouses where code = 'DEFAULT-WH') then
    insert into public.warehouses (code, name, description)
    values ('DEFAULT-WH', '默认仓库', '无库位入库时自动使用的默认仓库')
    on conflict (code) do nothing;
  end if;
end $$;

-- 默认库位（code = DEFAULT-LOC，挂在 DEFAULT-WH 下）
do $$
declare
  v_wh uuid;
begin
  select id into v_wh from public.warehouses where code = 'DEFAULT-WH' limit 1;
  if v_wh is not null
     and not exists (select 1 from public.locations where code = 'DEFAULT-LOC') then
    insert into public.locations (warehouse_id, code, description)
    values (v_wh, 'DEFAULT-LOC', '默认库位（无库位入库时使用）')
    on conflict (code) do nothing;
  end if;
end $$;

-- -------- 3. stock_moves 加 operator_name（多出库人自定义名称） --------

alter table public.stock_moves
  add column if not exists operator_name text;

comment on column public.stock_moves.operator_name is '实际出库/入库人姓名，允许自定义输入，展示优先于此字段';

-- -------- 4. materials 升级：is_out_of_stock_marked 改为 status 枚举 --------

alter table public.materials
  add column if not exists status text
  not null
  default 'normal'
  check (status in ('normal', 'low_stock', 'out_of_stock'));

-- 把历史缺货标记迁移到 status
update public.materials
   set status = case when is_out_of_stock_marked = true then 'out_of_stock' else 'normal' end
 where status is null or status = 'normal';

-- 旧列可选保留不再使用（若需彻底删除，取消下一行注释）：
-- alter table public.materials drop column if exists is_out_of_stock_marked;

-- updated_at 触发器挂一下（避免点选状态不更新时间）
drop trigger if exists set_materials_updated_at on public.materials;
create trigger set_materials_updated_at
  before update on public.materials
  for each row execute function public.trigger_set_updated_at();

-- -------- 5. 分类：零件 → 零配件 --------

update public.products
   set category = '零配件'
 where category = '零件';
