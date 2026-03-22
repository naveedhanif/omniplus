-- ====================================================
--  FIX RLS POLICIES FOR MARKETING TABLES
--  Run this in your Supabase SQL Editor to fix the
--  "new row violates row-level security policy" error
-- ====================================================

-- Drop existing restrictive policies
DROP POLICY IF EXISTS "Allow all for authenticated users" ON marketing_rules;
DROP POLICY IF EXISTS "Allow all for authenticated users" ON promotions;

-- Create permissive policies that allow the anon key (used by frontend)
-- This matches the pattern used by other tables in the app (products, transactions, etc.)

CREATE POLICY "Allow full access for all"
  ON marketing_rules
  FOR ALL
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Allow full access for all"
  ON promotions
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Confirm
SELECT 'RLS Policies fixed for marketing_rules and promotions.' AS status;
