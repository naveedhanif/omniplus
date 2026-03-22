-- =====================================================
-- 🛡️ SECURITY UPDATE: Secure Additional Tables
-- =====================================================

-- This script will attempt to standardise security on tables you mentioned:
-- brands, product_images, stock_levels, stock_movements, sub_categories, warehouse
--
-- It uses "IF EXISTS" so it won't fail if a table doesn't actually exist.

BEGIN;

-- 1. BRANDS
ALTER TABLE IF EXISTS "public"."brands" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow anonymous access" ON "public"."brands";
DROP POLICY IF EXISTS "Enable all for authenticated users" ON "public"."brands";
DO $$ BEGIN
    CREATE POLICY "Enable all for authenticated users" ON "public"."brands" FOR ALL USING (auth.role() = 'authenticated');
EXCEPTION WHEN undefined_table THEN NULL; END $$;

-- 2. PRODUCT_IMAGES
ALTER TABLE IF EXISTS "public"."product_images" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow anonymous access" ON "public"."product_images";
DROP POLICY IF EXISTS "Enable all for authenticated users" ON "public"."product_images";
DO $$ BEGIN
    CREATE POLICY "Enable all for authenticated users" ON "public"."product_images" FOR ALL USING (auth.role() = 'authenticated');
EXCEPTION WHEN undefined_table THEN NULL; END $$;

-- 3. STOCK_MOVEMENTS (If it's a table)
ALTER TABLE IF EXISTS "public"."stock_movements" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow anonymous access" ON "public"."stock_movements";
DROP POLICY IF EXISTS "Enable all for authenticated users" ON "public"."stock_movements";
DO $$ BEGIN
    CREATE POLICY "Enable all for authenticated users" ON "public"."stock_movements" FOR ALL USING (auth.role() = 'authenticated');
EXCEPTION WHEN undefined_table THEN NULL; END $$;

-- 4. SUB_CATEGORIES (If it's a table)
ALTER TABLE IF EXISTS "public"."sub_categories" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow anonymous access" ON "public"."sub_categories";
DROP POLICY IF EXISTS "Enable all for authenticated users" ON "public"."sub_categories";
DO $$ BEGIN
    CREATE POLICY "Enable all for authenticated users" ON "public"."sub_categories" FOR ALL USING (auth.role() = 'authenticated');
EXCEPTION WHEN undefined_table THEN NULL; END $$;

-- 5. WAREHOUSE (If it's a table)
ALTER TABLE IF EXISTS "public"."warehouse" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow anonymous access" ON "public"."warehouse";
DROP POLICY IF EXISTS "Enable all for authenticated users" ON "public"."warehouse";
DO $$ BEGIN
    CREATE POLICY "Enable all for authenticated users" ON "public"."warehouse" FOR ALL USING (auth.role() = 'authenticated');
EXCEPTION WHEN undefined_table THEN NULL; END $$;

-- 6. STOCK_LEVELS (Materialized View or Table)
-- If it's a table, we enable RLS.
-- If it's a view/materialized view, we deny anon access via GRANTs.

-- Try table approach (will be ignored if it's a view)
DO $$ BEGIN
    ALTER TABLE "public"."stock_levels" ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "Allow anonymous access" ON "public"."stock_levels";
    DROP POLICY IF EXISTS "Enable all for authenticated users" ON "public"."stock_levels";
    CREATE POLICY "Enable all for authenticated users" ON "public"."stock_levels" FOR ALL USING (auth.role() = 'authenticated');
EXCEPTION 
    WHEN undefined_table THEN NULL; 
    WHEN wrong_object_type THEN NULL; -- In case it IS a view
END $$;

-- Secure View approach (works for Views/Mat Views)
-- Revoke from public/anon
REVOKE ALL ON "public"."stock_levels" FROM anon;
REVOKE ALL ON "public"."stock_levels" FROM public;
-- Grant to authenticated
GRANT SELECT ON "public"."stock_levels" TO authenticated;
GRANT SELECT ON "public"."stock_levels" TO service_role;

COMMIT;

DO $$
BEGIN
    RAISE NOTICE '✅ Additional tables secured successfully (if they existed).';
    RAISE NOTICE '🔒 RLS enabled for: brands, product_images, stock_movements, sub_categories, warehouse';
    RAISE NOTICE '🔒 Access restricted for: stock_levels';
END $$;
