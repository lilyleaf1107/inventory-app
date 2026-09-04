-- ============================================================
-- 0019: 重写 stock_in / stock_out RPC
--   - 删除所有 unallocated_quantity 逻辑
--   - 无库位时 product_id + quantity 有值 → 落到 DEFAULT-LOC 默认库位
--   - 新增 operator_name 参数，支持自定义出库/入库人姓名
--   - 对 track_qty=false 的产品：允许 quantity 直接更新不做精确保留校验
-- 0018 执行完后再跑这段
-- ============================================================

-- -------- stock_in --------
create or replace function public.stock_in(
  p_product_id uuid,
  p_location_id uuid,
  p_quantity numeric,
  p_scan_mode text default 'manual',
  p_batch_no text default null,
  p_remark text default null,
  p_operator_id uuid default null,
  p_tracking_no text default null,
  p_is_offline boolean default false,
  p_operator_name text default null
) returns void language plpgsql as $$
declare
  v_loc uuid;
  v_exists boolean;
begin
  -- 无库位 → 用系统默认库位
  if p_location_id is null then
    select id into v_loc from public.locations where code = 'DEFAULT-LOC' limit 1;
    if v_loc is null then
      raise exception '未配置默认库位，请先在库位管理中创建 code=DEFAULT-LOC 的库位';
    end if;
  else
    v_loc := p_location_id;
  end if;

  select exists (
    select 1 from public.inventory
     where product_id = p_product_id and location_id = v_loc
  ) into v_exists;

  if v_exists then
    update public.inventory
       set quantity = quantity + p_quantity,
           batch_no = coalesce(p_batch_no, batch_no, public.inventory.batch_no),
           updated_at = now()
     where product_id = p_product_id and location_id = v_loc;
  else
    insert into public.inventory (product_id, location_id, quantity, batch_no)
    values (p_product_id, v_loc, p_quantity, p_batch_no);
  end if;

  insert into public.stock_moves (
    product_id, location_id, move_type, quantity,
    batch_no, scan_mode, remark, operator_id,
    tracking_no, is_offline, operator_name
  ) values (
    p_product_id, v_loc, 'in', p_quantity,
    p_batch_no, p_scan_mode, p_remark, p_operator_id,
    p_tracking_no, p_is_offline, p_operator_name
  );
end $$;

-- -------- stock_out --------
create or replace function public.stock_out(
  p_product_id uuid,
  p_location_id uuid,
  p_quantity numeric,
  p_scan_mode text default 'manual',
  p_batch_no text default null,
  p_remark text default null,
  p_operator_id uuid default null,
  p_tracking_no text default null,
  p_is_offline boolean default false,
  p_operator_name text default null
) returns void language plpgsql as $$
declare
  v_current numeric;
  v_loc uuid;
  v_track boolean;
begin
  -- 无库位 → 默认库位
  if p_location_id is null then
    select id into v_loc from public.locations where code = 'DEFAULT-LOC' limit 1;
    if v_loc is null then
      raise exception '未配置默认库位，请先在库位管理中创建 code=DEFAULT-LOC 的库位';
    end if;
  else
    v_loc := p_location_id;
  end if;

  -- 产品是否追踪具体库存
  select coalesce(track_qty, true) into v_track
    from public.products where id = p_product_id;

  if v_track is null then v_track := true; end if;

  select coalesce(quantity, 0) into v_current
    from public.inventory
   where product_id = p_product_id and location_id = v_loc
     for update;

  -- 没库存记录时：追踪产品报错，不计数量允许出库（先补一个0库存记录再扣，允许负数也无所谓，由 manual_status 显示）
  if v_current is null or v_current < p_quantity then
    if v_track then
      if v_current is null then
        raise exception '该产品在此库位不存在库存';
      else
        raise exception '库存不足，当前库存 %，请求出库 %', v_current, p_quantity;
      end if;
    else
      -- 不计数量产品：保证至少有一行库存记录可扣（允许临时先写后补回）
      if v_current is null then
        insert into public.inventory (product_id, location_id, quantity)
        values (p_product_id, v_loc, 0);
        v_current := 0;
      end if;
    end if;
  end if;

  insert into public.stock_moves (
    product_id, location_id, move_type, quantity,
    batch_no, scan_mode, remark, operator_id,
    tracking_no, is_offline, operator_name
  ) values (
    p_product_id, v_loc, 'out', p_quantity,
    p_batch_no, p_scan_mode, p_remark, p_operator_id,
    p_tracking_no, p_is_offline, p_operator_name
  );

  update public.inventory
     set quantity = quantity - p_quantity,
         updated_at = now()
   where product_id = p_product_id and location_id = v_loc;
end $$;
