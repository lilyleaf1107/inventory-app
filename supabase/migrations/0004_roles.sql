-- 0004 四层角色权限体系
-- 在 Supabase Dashboard -> SQL Editor 中执行

-- ========== 1. 扩展 profiles.role 约束，支持 4 种角色 ==========
-- 先删除原约束，再添加新约束
alter table public.profiles
  drop constraint if exists profiles_role_check;

alter table public.profiles
  add constraint profiles_role_check
  check (role in ('super_admin', 'admin', 'warehouse_manager', 'staff'));

-- ========== 2. 角色映射迁移 ==========
-- 现有 'admin' 中的超管邮箱 → 'super_admin'
-- 其他 'admin' 保持 'admin'
-- 现有 'staff' → 'warehouse_manager'（保留原操作权限）
update public.profiles
  set role = 'super_admin'
  where role = 'admin'
    and id in (
      select id from auth.users
      where email = '2871116075@qq.com'
    );

-- 现有 'staff' → 'warehouse_manager'
update public.profiles
  set role = 'warehouse_manager'
  where role = 'staff';

-- ========== 3. 更新新用户注册时的默认角色 ==========
-- 触发器：新用户默认 'staff'（只读）
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  -- 超管邮箱注册时自动赋 super_admin
  if new.email = '2871116075@qq.com' then
    insert into public.profiles (id, name, role)
    values (
      new.id,
      coalesce(new.raw_user_meta_data ->> 'name', split_part(new.email, '@', 1)),
      'super_admin'
    );
  else
    insert into public.profiles (id, name, role)
    values (
      new.id,
      coalesce(new.raw_user_meta_data ->> 'name', split_part(new.email, '@', 1)),
      'staff'
    );
  end if;
  return new;
end;
$$;

-- ========== 4. 更新 RLS 策略 ==========
-- 更新辅助函数（不变，仍返回当前用户角色）

-- products 表：库管及以上可写
drop policy if exists "products: admin write" on public.products;
create policy "products: manager write"
  on public.products for all
  using (
    public.current_user_role() in ('super_admin', 'admin', 'warehouse_manager')
  )
  with check (
    public.current_user_role() in ('super_admin', 'admin', 'warehouse_manager')
  );

-- warehouses 表：库管及以上可写
drop policy if exists "warehouses: admin write" on public.warehouses;
create policy "warehouses: manager write"
  on public.warehouses for all
  using (
    public.current_user_role() in ('super_admin', 'admin', 'warehouse_manager')
  )
  with check (
    public.current_user_role() in ('super_admin', 'admin', 'warehouse_manager')
  );

-- locations 表：库管及以上可写
drop policy if exists "locations: admin write" on public.locations;
create policy "locations: manager write"
  on public.locations for all
  using (
    public.current_user_role() in ('super_admin', 'admin', 'warehouse_manager')
  )
  with check (
    public.current_user_role() in ('super_admin', 'admin', 'warehouse_manager')
  );

-- stock_moves 表：库管及以上可查看全部，员工只能看自己的
drop policy if exists "stock_moves: read own or admin" on public.stock_moves;
create policy "stock_moves: read own or manager"
  on public.stock_moves for select
  using (
    public.current_user_role() in ('super_admin', 'admin', 'warehouse_manager')
    or operator_id = auth.uid()
  );

-- profiles 表：管理员及以上可管理
drop policy if exists "profiles: admin all" on public.profiles;
create policy "profiles: admin above all"
  on public.profiles for all
  using (
    public.current_user_role() in ('super_admin', 'admin')
  )
  with check (
    public.current_user_role() in ('super_admin', 'admin')
  );

-- ========== 5. 防止超管被降级（数据库层保护） ==========
-- 通过触发器：禁止把 super_admin 改成其他角色（除非操作者也是 super_admin）
-- 实际上前端已经控制了，这里加一层保险
create or replace function public.prevent_super_admin_demotion()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  -- 如果当前用户不是 super_admin，不能修改 super_admin 的记录
  if old.role = 'super_admin' and new.role <> 'super_admin' then
    if public.current_user_role() <> 'super_admin' then
      raise exception '无权修改超级管理员角色';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists prevent_super_admin_demotion on public.profiles;
create trigger prevent_super_admin_demotion
  before update on public.profiles
  for each row execute function public.prevent_super_admin_demotion();
