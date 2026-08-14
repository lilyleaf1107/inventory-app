-- ========== stock_moves：补 update / delete RLS 策略 ==========
-- 0002 / 0004 只配置了 select 和 insert，缺少 update/delete，导致前端删改 stock_moves 时被 RLS 静默拒绝

drop policy if exists "stock_moves: manager write" on public.stock_moves;
create policy "stock_moves: manager write"
  on public.stock_moves for all
  using (
    public.current_user_role() in ('super_admin', 'admin', 'warehouse_manager')
  )
  with check (
    public.current_user_role() in ('super_admin', 'admin', 'warehouse_manager')
  );

-- 保留普通 staff 的 insert 权限（进出库扫码场景需要）
drop policy if exists "stock_moves: authenticated insert" on public.stock_moves;
create policy "stock_moves: authenticated insert"
  on public.stock_moves for insert
  with check (auth.role() = 'authenticated');

-- ========== stock_moves.product_id 外键：restrict -> cascade ==========
-- 删除产品时自动清理关联流水，避免 FK 冲突

alter table public.stock_moves
  drop constraint if exists stock_moves_product_id_fkey;

alter table public.stock_moves
  add constraint stock_moves_product_id_fkey
  foreign key (product_id)
  references public.products(id)
  on delete cascade;
