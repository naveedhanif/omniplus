-- Migration: Add Global Tax Settings for POs and Invoices
-- This makes POs and Invoices respect global store tax configurations

-- Add subtotal, tax_amount, and tax_enabled explicitly to purchase_orders
-- This freezes the global state at the time of order creation
ALTER TABLE public.purchase_orders
ADD COLUMN IF NOT EXISTS subtotal numeric,
ADD COLUMN IF NOT EXISTS tax_amount numeric,
ADD COLUMN IF NOT EXISTS tax_enabled boolean DEFAULT false;

-- Backfill existing data to make existing total_amount mathematically valid
-- Assuming existing POs were created without tax
UPDATE public.purchase_orders
SET subtotal = total_amount, 
    tax_amount = 0, 
    tax_enabled = false
WHERE subtotal IS NULL;
