-- 修正 stock_moves.operator_id 外键：原指向 auth.users(id)，导致前端
-- `operator:profiles!stock_moves_operator_id_fkey` 嵌套查询失败
-- （PostgREST 找不到 stock_moves → profiles 的外键关联），
-- 进出库记录页面查询整段报错，记录不显示。
-- profiles.id 本就 references auth.users(id)，值相同，改外键引用不破坏数据。

-- 1. 清理无效引用（operator_id 不在 profiles 中的设为 null，避免加约束失败）
update public.stock_moves
  set operator_id = null
  where operator_id is not null
    and operator_id not in (select id from public.profiles);

-- 2. 删除原外键约束（指向 auth.users）
alter table public.stock_moves
  drop constraint if exists stock_moves_operator_id_fkey;

-- 3. 添加新外键约束指向 profiles
alter table public.stock_moves
  add constraint stock_moves_operator_id_fkey
    foreign key (operator_id) references public.profiles(id) on delete set null;
