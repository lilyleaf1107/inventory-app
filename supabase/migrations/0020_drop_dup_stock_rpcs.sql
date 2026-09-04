-- ============================================================
-- 0020: 删除 stock_in / stock_out 重复的 9 参数签名
--   歧义成因：0019 的 CREATE OR REPLACE 不能覆盖掉参数列表类型/顺序完全相同的旧签名
--   结果：PG 报错 "Could not choose the best candidate function"
--   0019 已建 10 参数签名（含 p_operator_name，所有 non-default 可兼容旧调用）
--   本脚本删除所有旧的 9 参数签名，仅保留 10 参数签名
-- 在 Supabase 控制台 SQL Editor 里执行（不要只本地提交不跑）
-- ============================================================

-- 按参数类型顺序匹配（uuid, uuid, numeric, text, text, text, uuid, text, boolean）
-- 对应：p_product_id, p_location_id, p_quantity, p_scan_mode, p_batch_no, p_remark, p_operator_id, p_tracking_no, p_is_offline
DROP FUNCTION IF EXISTS public.stock_in(uuid, uuid, numeric, text, text, text, uuid, text, boolean);
DROP FUNCTION IF EXISTS public.stock_out(uuid, uuid, numeric, text, text, text, uuid, text, boolean);
