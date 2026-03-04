-- ====================================================
--  OMNIPLUS: Marketing Automation & Promotions Schema
--  Run this ONCE in your Supabase SQL Editor
-- ====================================================

-- 1. Add missing columns to customers table
ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS last_purchase_date TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS engaged_date        TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS lifetime_spend      NUMERIC(12, 2) DEFAULT 0;

-- 2. Create marketing_rules table
CREATE TABLE IF NOT EXISTS marketing_rules (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id            UUID        NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  name                TEXT        NOT NULL,
  trigger_days        INTEGER     NOT NULL DEFAULT 30,
  discount_percentage NUMERIC(5,2) NOT NULL DEFAULT 10,
  message_template    TEXT        NOT NULL DEFAULT 'Hi [Name], we miss you! Use code [Code] for [Discount]% off. Valid for [Days] days.',
  is_active           BOOLEAN     NOT NULL DEFAULT false,
  validity_days       INTEGER     NOT NULL DEFAULT 7,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Create promotions table
CREATE TABLE IF NOT EXISTS promotions (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id            UUID        NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  customer_id         UUID        REFERENCES customers(id) ON DELETE SET NULL,
  campaign_id         UUID        REFERENCES marketing_rules(id) ON DELETE SET NULL,
  code                TEXT        NOT NULL UNIQUE,
  discount_percentage NUMERIC(5,2) NOT NULL,
  validity_start      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  validity_end        TIMESTAMPTZ NOT NULL,
  is_used             BOOLEAN     NOT NULL DEFAULT false,
  used_at             TIMESTAMPTZ,
  transaction_id      UUID        REFERENCES transactions(id) ON DELETE SET NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. Enable Row Level Security (RLS)
ALTER TABLE marketing_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE promotions       ENABLE ROW LEVEL SECURITY;

-- 5. RLS Policies - allow full access for authenticated users (adjust as needed for multi-tenant)
CREATE POLICY "Allow all for authenticated users" ON marketing_rules
  FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Allow all for authenticated users" ON promotions
  FOR ALL USING (auth.role() = 'authenticated');

-- 6. Indexes for performance
CREATE INDEX IF NOT EXISTS idx_marketing_rules_store ON marketing_rules (store_id, is_active);
CREATE INDEX IF NOT EXISTS idx_promotions_code       ON promotions (code);
CREATE INDEX IF NOT EXISTS idx_promotions_store      ON promotions (store_id, is_used);
CREATE INDEX IF NOT EXISTS idx_customers_last_purchase ON customers (last_purchase_date);

-- Done!
SELECT 'Migration complete. Tables marketing_rules, promotions created.' AS status;
