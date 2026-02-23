-- =====================================================
-- 🛡️ SECURITY UPDATE: Enable RLS & Authenticated Access
-- =====================================================

-- This script will:
-- 1. Enable Row Level Security (RLS) on ALL tables
-- 2. Remove any insecure "anonymous access" policies
-- 3. Add a "Safety Net" policy allowing FULL access to logged-in users
-- 4. Secure Materialized Views

BEGIN;

-- =====================================================
-- 1. CORE TABLES (From original schema)
-- =====================================================

-- Stores
ALTER TABLE IF EXISTS "public"."stores" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow anonymous users full access to stores" ON "public"."stores";
DROP POLICY IF EXISTS "Enable all for authenticated users" ON "public"."stores";
CREATE POLICY "Enable all for authenticated users" ON "public"."stores" FOR ALL USING (auth.role() = 'authenticated');

-- Categories
ALTER TABLE IF EXISTS "public"."categories" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow anonymous users full access to categories" ON "public"."categories";
DROP POLICY IF EXISTS "Enable all for authenticated users" ON "public"."categories";
CREATE POLICY "Enable all for authenticated users" ON "public"."categories" FOR ALL USING (auth.role() = 'authenticated');

-- Products
ALTER TABLE IF EXISTS "public"."products" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow anonymous users full access to products" ON "public"."products";
DROP POLICY IF EXISTS "Enable all for authenticated users" ON "public"."products";
CREATE POLICY "Enable all for authenticated users" ON "public"."products" FOR ALL USING (auth.role() = 'authenticated');

-- Customers
ALTER TABLE IF EXISTS "public"."customers" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow anonymous users full access to customers" ON "public"."customers";
DROP POLICY IF EXISTS "Enable all for authenticated users" ON "public"."customers";
CREATE POLICY "Enable all for authenticated users" ON "public"."customers" FOR ALL USING (auth.role() = 'authenticated');

-- Transactions
ALTER TABLE IF EXISTS "public"."transactions" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow anonymous users full access to transactions" ON "public"."transactions";
DROP POLICY IF EXISTS "Enable all for authenticated users" ON "public"."transactions";
CREATE POLICY "Enable all for authenticated users" ON "public"."transactions" FOR ALL USING (auth.role() = 'authenticated');

-- Transaction Items
ALTER TABLE IF EXISTS "public"."transaction_items" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow anonymous users full access to transaction items" ON "public"."transaction_items";
DROP POLICY IF EXISTS "Enable all for authenticated users" ON "public"."transaction_items";
CREATE POLICY "Enable all for authenticated users" ON "public"."transaction_items" FOR ALL USING (auth.role() = 'authenticated');

-- Serial Numbers
ALTER TABLE IF EXISTS "public"."serial_numbers" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow anonymous users full access to serial_numbers" ON "public"."serial_numbers";
DROP POLICY IF EXISTS "Enable all for authenticated users" ON "public"."serial_numbers";
CREATE POLICY "Enable all for authenticated users" ON "public"."serial_numbers" FOR ALL USING (auth.role() = 'authenticated');

-- Composite Products
ALTER TABLE IF EXISTS "public"."composite_products" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow anonymous users full access to composite_products" ON "public"."composite_products";
DROP POLICY IF EXISTS "Enable all for authenticated users" ON "public"."composite_products";
CREATE POLICY "Enable all for authenticated users" ON "public"."composite_products" FOR ALL USING (auth.role() = 'authenticated');

-- Customer Ledger
ALTER TABLE IF EXISTS "public"."customer_ledger" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow anonymous users full access to customer_ledger" ON "public"."customer_ledger";
DROP POLICY IF EXISTS "Enable all for authenticated users" ON "public"."customer_ledger";
CREATE POLICY "Enable all for authenticated users" ON "public"."customer_ledger" FOR ALL USING (auth.role() = 'authenticated');

-- =====================================================
-- 2. NEW FEATURE TABLES
-- =====================================================

-- Suppliers
ALTER TABLE IF EXISTS "public"."suppliers" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Enable all for authenticated users" ON "public"."suppliers";
CREATE POLICY "Enable all for authenticated users" ON "public"."suppliers" FOR ALL USING (auth.role() = 'authenticated');

-- Store Profiles
ALTER TABLE IF EXISTS "public"."store_profiles" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Enable all for authenticated users" ON "public"."store_profiles";
CREATE POLICY "Enable all for authenticated users" ON "public"."store_profiles" FOR ALL USING (auth.role() = 'authenticated');

-- Staff
ALTER TABLE IF EXISTS "public"."staff" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Enable all for authenticated users" ON "public"."staff";
CREATE POLICY "Enable all for authenticated users" ON "public"."staff" FOR ALL USING (auth.role() = 'authenticated');

-- Tax Profiles
ALTER TABLE IF EXISTS "public"."tax_profiles" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Enable all for authenticated users" ON "public"."tax_profiles";
CREATE POLICY "Enable all for authenticated users" ON "public"."tax_profiles" FOR ALL USING (auth.role() = 'authenticated');

-- Activity Logs
ALTER TABLE IF EXISTS "public"."activity_logs" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Enable all for authenticated users" ON "public"."activity_logs";
CREATE POLICY "Enable all for authenticated users" ON "public"."activity_logs" FOR ALL USING (auth.role() = 'authenticated');

-- =====================================================
-- 3. STOCK MANAGEMENT TABLES
-- =====================================================

-- Stock Locations
ALTER TABLE IF EXISTS "public"."stock_locations" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Enable all for authenticated users" ON "public"."stock_locations";
CREATE POLICY "Enable all for authenticated users" ON "public"."stock_locations" FOR ALL USING (auth.role() = 'authenticated');

-- Stock Ledger
ALTER TABLE IF EXISTS "public"."stock_ledger" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Enable all for authenticated users" ON "public"."stock_ledger";
CREATE POLICY "Enable all for authenticated users" ON "public"."stock_ledger" FOR ALL USING (auth.role() = 'authenticated');

-- Stock Reorder Rules
ALTER TABLE IF EXISTS "public"."stock_reorder_rules" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Enable all for authenticated users" ON "public"."stock_reorder_rules";
CREATE POLICY "Enable all for authenticated users" ON "public"."stock_reorder_rules" FOR ALL USING (auth.role() = 'authenticated');

-- Stock Transfers
ALTER TABLE IF EXISTS "public"."stock_transfers" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Enable all for authenticated users" ON "public"."stock_transfers";
CREATE POLICY "Enable all for authenticated users" ON "public"."stock_transfers" FOR ALL USING (auth.role() = 'authenticated');

-- Stock Transfer Items
ALTER TABLE IF EXISTS "public"."stock_transfer_items" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Enable all for authenticated users" ON "public"."stock_transfer_items";
CREATE POLICY "Enable all for authenticated users" ON "public"."stock_transfer_items" FOR ALL USING (auth.role() = 'authenticated');

-- Stock Reservations
ALTER TABLE IF EXISTS "public"."stock_reservations" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Enable all for authenticated users" ON "public"."stock_reservations";
CREATE POLICY "Enable all for authenticated users" ON "public"."stock_reservations" FOR ALL USING (auth.role() = 'authenticated');

-- =====================================================
-- 4. VIEWS & MATERIALIZED VIEWS
-- =====================================================
-- For views, we manage permissions via GRANTs, as RLS is on the underlying tables
-- or requires 'security_invoker'. Here we secure access.

-- Revoke public access to stock_levels view
REVOKE ALL ON "public"."stock_levels" FROM anon;
REVOKE ALL ON "public"."stock_levels" FROM public; -- 'public' role includes anon

-- Grant access only to authenticated users
GRANT SELECT ON "public"."stock_levels" TO authenticated;
GRANT SELECT ON "public"."stock_levels" TO service_role;

COMMIT;

DO $$
BEGIN
    RAISE NOTICE '✅ SECURITY UPDATE COMPLETE: All tables are now protected by RLS.';
    RAISE NOTICE '🔒 Anonymous access has been BLOCKED.';
    RAISE NOTICE '🔓 Authenticated users (staff) retain FULL ACCESS.';
END $$;
