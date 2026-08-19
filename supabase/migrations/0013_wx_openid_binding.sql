-- ========== 新增 profiles.wx_openid 字段：微信小程序登录绑定 ==========
-- 允许一条绑定：每个微信 openid 唯一对应一个用户

alter table public.profiles
  add column if not exists wx_openid text;

-- 唯一索引，避免同一微信绑定多人
drop index if exists profiles_wx_openid_idx;
create unique index profiles_wx_openid_idx
  on public.profiles(wx_openid)
  where wx_openid is not null;

-- 让前端 service/anon（service_role 忽略RLS，但RLS本身也要允许写）
-- profiles 已有 "profiles: auth read all" 读策略，写策略需要自改自己的资料：
drop policy if exists "profiles: user update self" on public.profiles;
create policy "profiles: user update self"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);
