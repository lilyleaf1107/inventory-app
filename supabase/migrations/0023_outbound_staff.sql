-- 出库人快捷名单：存到 profiles 表，换电脑登录也能看到
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS outbound_staff text[] DEFAULT '{}';
