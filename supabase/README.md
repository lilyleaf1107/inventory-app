# Supabase 配置步骤

1. 注册账号并创建项目：https://supabase.com/
2. 在 SQL Editor 中依次执行：
   - `migrations/0001_init.sql`（建表 + 函数）
   - `migrations/0002_rls.sql`（RLS 策略）
3. 在 Storage 中创建一个 bucket，名称为 `product-images`，设为 public
4. 复制项目 URL 和 anon key 到 `.env` 文件

## 提升第一个用户为管理员

注册第一个账号后，在 SQL Editor 执行（把邮箱换成你的）：

```sql
update public.profiles
set role = 'admin'
where id = (select id from auth.users where email = 'your@email.com');
```
