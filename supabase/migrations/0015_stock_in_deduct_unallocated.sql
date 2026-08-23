-- 入库时自动扣减暂未入仓数量（unallocated_quantity）
-- 场景：暂未入仓 75，入库 70 到库位 → 暂未入仓剩 5，库位上 +70
-- 入库数量超过暂未入仓时，暂未入仓清零，不会变负

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

  -- 扣减暂未入仓数量（入库到具体库位后，从暂未入仓池子减去，不低于 0）
  update public.products
  set unallocated_quantity = greatest(unallocated_quantity - p_quantity, 0)
  where id = p_product_id and unallocated_quantity > 0;
end;
$$;