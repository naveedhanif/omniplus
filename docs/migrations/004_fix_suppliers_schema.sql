-- Migration Script: Fix Suppliers & Products Schema
-- Description: Add missing columns to suppliers and products tables to match the application interface.

BEGIN;

-- 1. Fix Suppliers
ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS address TEXT;
ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS whatsapp TEXT;
ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS notes TEXT;

-- 2. Fix Products
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS reorder_quantity INTEGER DEFAULT 0;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS units_per_package INTEGER DEFAULT 1;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS warehouse_location TEXT;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS alert_on_expiry BOOLEAN DEFAULT false;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS expiry_date DATE;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS batch_number TEXT;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS wholesale_price NUMERIC(10,2) DEFAULT 0.00;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS brand TEXT;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS compatible_models TEXT[];
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS voltage TEXT;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS oem_aftermarket TEXT;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS warranty_period TEXT;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS tags TEXT[] DEFAULT '{}';
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS stock_quantity INTEGER DEFAULT 0;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS stock_shop INTEGER DEFAULT 0;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS stock_warehouse INTEGER DEFAULT 0;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS tax_rate NUMERIC(10,2) DEFAULT 0.00;

COMMIT;
