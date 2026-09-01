-- =====================================================
-- 0017: 进出库记录增加快递单号与线下交易标记
-- 执行时间：部署后立刻在 Supabase SQL Editor 运行
-- =====================================================

-- 1. 加列（可空，兼容已有数据）
alter table public.stock_moves
  add column if not exists tracking_no text,
  add column if not exists is_offline boolean default false;

-- 2. 约束：线上单号和线下不能同时填
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'stock_moves_tracking_or_offline_check'
  ) then
    alter table public.stock_moves
      add constraint stock_moves_tracking_or_offline_check
      check (
        (tracking_no is null and is_offline is false) or
        (tracking_no is not null and is_offline is false) or
        (tracking_no is null and is_offline is true)
      );
  end if;
end $$;

-- 3. 索引（按单号/线下标记搜索统计用）
create index if not exists idx_stock_moves_tracking_no
  on public.stock_moves(tracking_no);
create index if not exists idx_stock_moves_is_offline
  on public.stock_moves(is_offline);
create index if not exists idx_stock_moves_created_at_type
  on public.stock_moves(created_at desc, move_type);

-- 4. 升级 stock_out RPC：接受 tracking_no 和 is_offline 参数
create or replace function public.stock_out(
  p_product_id uuid,
  p_location_id uuid,
  p_quantity numeric,
  p_scan_mode text default 'manual',
  p_batch_no text default null,
  p_remark text default null,
  p_operator_id uuid default null,
  p_tracking_no text default null,
  p_is_offline boolean default false
) returns void language plpgsql as $$
declare
  v_current numeric;
begin
  -- 检查库存
  select coalesce(quantity, 0) into v_current
    from public.inventory
   where product_id = p_product_id and location_id = p_location_id
     for update;

  if v_current is null then
    raise exception '该产品在此库位不存在库存';
  end if;
  if v_current < p_quantity then
    raise exception '库存不足，当前库存 %，请求出库 %', v_current, p_quantity;
  end if;

  -- 写进出库记录
  insert into public.stock_moves (
    product_id, location_id, move_type, quantity,
    batch_no, scan_mode, remark, operator_id,
    tracking_no, is_offline
  ) values (
    p_product_id, p_location_id, 'out', p_quantity,
    p_batch_no, p_scan_mode, p_remark, p_operator_id,
    p_tracking_no, p_is_offline
  );

  -- 更新库存
  update public.inventory
     set quantity = quantity - p_quantity,
         updated_at = now()
   where product_id = p_product_id and location_id = p_location_id;

  -- 扣到 0 不删行（保持库位关联）
end $$;

-- 5. 升级 stock_in RPC：同样支持 tracking_no / is_offline（入库一般用不到，但保持接口一致）
create or replace function public.stock_in(
  p_product_id uuid,
  p_location_id uuid,
  p_quantity numeric,
  p_scan_mode text default 'manual',
  p_batch_no text default null,
  p_remark text default null,
  p_operator_id uuid default null,
  p_tracking_no text default null,
  p_is_offline boolean default false
) returns void language plpgsql as $$
declare
  v_exists boolean;
  v_unalloc numeric;
begin
  -- 定位产品当前的暂未入仓数量
  select coalesce(unallocated_quantity, 0) into v_unalloc
    from public.products
   where id = p_product_id;

  -- 入库扣减暂未入仓（不能变负）
  if v_unalloc > 0 then
    update public.products
       set unallocated_quantity = greatest(v_unalloc - p_quantity, 0),
           updated_at = now()
     where id = p_product_id;
  end if;

  select exists (
    select 1 from public.inventory
     where product_id = p_product_id and location_id = p_location_id
  ) into v_exists;

  if v_exists then
    update public.inventory
       set quantity = quantity + p_quantity,
           updated_at = now()
     where product_id = p_product_id and location_id = p_location_id;
  else
    insert into public.inventory (product_id, location_id, quantity)
    values (p_product_id, p_location_id, p_quantity);
  end if;

  insert into public.stock_moves (
    product_id, location_id, move_type, quantity,
    batch_no, scan_mode, remark, operator_id,
    tracking_no, is_offline
  ) values (
    p_product_id, p_location_id, 'in', p_quantity,
    p_batch_no, p_scan_mode, p_remark, p_operator_id,
    p_tracking_no, p_is_offline
  );
end $$;
