-- Migration Script: Migrate Product Attributes
-- Date: 2026-02-26
-- Description: Safely migrate legacy JSONB metadata into the new attribute_data column and dedicated columns.

BEGIN;

-- 1. Ensure columns exist (Safeguard)
DO $$ 
BEGIN
    BEGIN
        ALTER TABLE public.products ADD COLUMN is_variant BOOLEAN DEFAULT false;
    EXCEPTION
        WHEN duplicate_column THEN null;
    END;
    
    BEGIN
        ALTER TABLE public.products ADD COLUMN parent_product_id UUID REFERENCES public.products(id) ON DELETE CASCADE;
    EXCEPTION
        WHEN duplicate_column THEN null;
    END;
    
    BEGIN
        ALTER TABLE public.products ADD COLUMN manufacturer_part_number TEXT;
    EXCEPTION
        WHEN duplicate_column THEN null;
    END;
    
    BEGIN
        ALTER TABLE public.products ADD COLUMN attribute_data JSONB DEFAULT '{}'::jsonb;
    EXCEPTION
        WHEN duplicate_column THEN null;
    END;
END $$;


-- 2. Migrate data
-- Move legacy attributes (voltage, oem, warranty) from metadata JSON into attribute_data
-- Move mpn into manufacturer_part_number

UPDATE public.products
SET 
    -- Merge specific keys from metadata into attribute_data
    attribute_data = COALESCE(attribute_data, '{}'::jsonb) 
        || COALESCE((
            SELECT jsonb_object_agg(key, value)
            FROM jsonb_each(metadata)
            WHERE key IN ('voltage', 'oem_aftermarket', 'warranty_period', 'batch_number')
        ), '{}'::jsonb),
    -- Move MPN if it's there
    manufacturer_part_number = COALESCE(manufacturer_part_number, metadata->>'mpn', metadata->>'manufacturer_part_number'),
    -- Safely remove migrated keys from metadata so they aren't duplicated
    metadata = metadata - 'voltage' - 'oem_aftermarket' - 'warranty_period' - 'batch_number' - 'mpn' - 'manufacturer_part_number'
WHERE metadata IS NOT NULL AND jsonb_typeof(metadata) = 'object';

-- 3. Update existing records with default attribute_data if null
UPDATE public.products
SET attribute_data = '{}'::jsonb
WHERE attribute_data IS NULL;

COMMIT;
