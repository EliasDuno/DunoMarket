-- Migration Script: Add total_base_usd and total_iva_usd to ventas
-- To be executed on all tenant databases explicitly.

ALTER TABLE ventas 
ADD COLUMN IF NOT EXISTS total_base_usd DECIMAL(12, 2) DEFAULT 0.00,
ADD COLUMN IF NOT EXISTS total_iva_usd DECIMAL(12, 2) DEFAULT 0.00;
