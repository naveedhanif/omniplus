-- Migration: Add missing permissions and fix location type naming
-- Description: Adds allows_receiving and allows_sales columns to stock_locations.
-- Also renames 'type' to 'location_type' for consistency with the application code.

ALTER TABLE public.stock_locations 
ADD COLUMN IF NOT EXISTS allows_receiving BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS allows_sales BOOLEAN DEFAULT true;

-- Add 'STORE' to location_type_enum if it doesn't exist
ALTER TYPE public.location_type_enum ADD VALUE IF NOT EXISTS 'STORE' AFTER 'SHOP';

-- Rename 'type' to 'location_type' if it exists as 'type'
-- This avoids "column does not exist" errors in the app which expects 'location_type'
DO $$ 
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='stock_locations' AND column_name='type') THEN
    ALTER TABLE public.stock_locations RENAME COLUMN "type" TO location_type;
  END IF;
END $$;
