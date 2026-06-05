-- Migration Script: Add costo_unitario_usd to detalle_ventas
-- To be executed on all tenant databases explicitly.

ALTER TABLE detalle_ventas ADD COLUMN IF NOT EXISTS costo_unitario_usd DECIMAL(12, 2) DEFAULT 0.00;
