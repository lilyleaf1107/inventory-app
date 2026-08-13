-- 0011: 修复 products.sku 空字符串唯一约束冲突
-- 背景：PostgreSQL 的 UNIQUE 约束对空字符串 '' 也会做“唯一值”检查
--       （只有 NULL 允许多条），所以如果有两条产品 sku='',
--       编辑其中任意一条保存时就会报：
--       duplicate key value violates unique constraint "products_sku_key"
--       Key (sku)=('') already exists.
--
-- 操作：1) 把现有 sku 为空串 / 全空白的记录归一化成 NULL；
--       2) 前端已配合：提交前 form.sku.trim()||null 写入。
--
-- 在 Supabase Dashboard -> SQL Editor 中执行。

update public.products
  set sku = null
  where sku is not null
    and btrim(sku) = '';

select pg_sleep(1);
