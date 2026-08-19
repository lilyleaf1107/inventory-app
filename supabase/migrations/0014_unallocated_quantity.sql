-- 新增产品暂未入仓数量字段（有数量但暂时没库位的场景）
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS unallocated_quantity NUMERIC(18,2) NOT NULL DEFAULT 0;

-- 给现有行补上默认值（已有数据的产品默认 0）
UPDATE products SET unallocated_quantity = 0 WHERE unallocated_quantity IS NULL;

-- 备注：
--  总库存 = inventory.quantity 聚合 + products.unallocated_quantity
--  当用户选择具体库位后，应把 unallocated_quantity 扣减，写入 inventory 表
