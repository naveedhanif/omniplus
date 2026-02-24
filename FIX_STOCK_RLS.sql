-- Fix RLS policies to allow the mock frontend client (anon role) to update stock management tables.
-- Run this in your Supabase SQL Editor.

BEGIN;

-- Allow anonymous access for the stock_transfers table
DROP POLICY IF EXISTS "Allow anon full access" ON "public"."stock_transfers";
CREATE POLICY "Allow anon full access" ON "public"."stock_transfers" FOR ALL USING (true);

-- Allow anonymous access for the stock_transfer_items table
DROP POLICY IF EXISTS "Allow anon full access" ON "public"."stock_transfer_items";
CREATE POLICY "Allow anon full access" ON "public"."stock_transfer_items" FOR ALL USING (true);

-- Allow anonymous access for the stock_ledger table
DROP POLICY IF EXISTS "Allow anon full access" ON "public"."stock_ledger";
CREATE POLICY "Allow anon full access" ON "public"."stock_ledger" FOR ALL USING (true);

-- Allow anonymous access for the stock_locations table
DROP POLICY IF EXISTS "Allow anon full access" ON "public"."stock_locations";
CREATE POLICY "Allow anon full access" ON "public"."stock_locations" FOR ALL USING (true);

-- Materialized View / Table Permissions for stock_levels
GRANT ALL ON "public"."stock_levels" TO anon;
GRANT ALL ON "public"."stock_levels" TO public;

COMMIT;
