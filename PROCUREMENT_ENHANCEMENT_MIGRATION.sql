-- ====================================================
--  OMNIPLUS: Procurement Enhancement Migration
--  Phase 1 — Invoices, Claims & Order Numbering
--  Run this ONCE in your Supabase SQL Editor
-- ====================================================

-- 1. Add structured order number and invoice fields to purchase_orders
ALTER TABLE purchase_orders
  ADD COLUMN IF NOT EXISTS order_number      TEXT,
  ADD COLUMN IF NOT EXISTS invoice_number    TEXT,
  ADD COLUMN IF NOT EXISTS invoice_date      DATE,
  ADD COLUMN IF NOT EXISTS payment_status   TEXT DEFAULT 'UNPAID'
    CHECK (payment_status IN ('UNPAID','PARTIAL','PAID')),
  ADD COLUMN IF NOT EXISTS payment_due_date  DATE;

-- 2. Create a sequence for human-readable PO numbers
CREATE SEQUENCE IF NOT EXISTS po_number_seq START 1;
CREATE SEQUENCE IF NOT EXISTS inv_number_seq START 1;
CREATE SEQUENCE IF NOT EXISTS clm_number_seq START 1;

-- 3. Backfill existing purchase_orders with order numbers (CTE required — window funcs not allowed in UPDATE directly)
WITH numbered AS (
  SELECT id,
         'PO-' || TO_CHAR(created_at, 'YYYY') || '-' || LPAD(ROW_NUMBER() OVER (ORDER BY created_at)::TEXT, 4, '0') AS new_order_number
  FROM purchase_orders
  WHERE order_number IS NULL
)
UPDATE purchase_orders
SET order_number = numbered.new_order_number
FROM numbered
WHERE purchase_orders.id = numbered.id;

-- 4. Create supplier_invoices table
CREATE TABLE IF NOT EXISTS supplier_invoices (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id        UUID        NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  po_id           UUID        NOT NULL REFERENCES purchase_orders(id) ON DELETE RESTRICT,
  supplier_id     UUID        NOT NULL REFERENCES suppliers(id) ON DELETE RESTRICT,
  invoice_number  TEXT        NOT NULL UNIQUE,
  status          TEXT        NOT NULL DEFAULT 'DRAFT'
    CHECK (status IN ('DRAFT','FINALISED','PAID','DISPUTED')),
  subtotal        NUMERIC(12,2) NOT NULL DEFAULT 0,
  tax_amount      NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_amount    NUMERIC(12,2) NOT NULL DEFAULT 0,
  payment_status  TEXT        NOT NULL DEFAULT 'UNPAID'
    CHECK (payment_status IN ('UNPAID','PARTIAL','PAID')),
  issued_date     DATE        NOT NULL DEFAULT CURRENT_DATE,
  due_date        DATE,
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. Create supplier_invoice_items (mirrors PO items at time of invoicing)
CREATE TABLE IF NOT EXISTS supplier_invoice_items (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id      UUID        NOT NULL REFERENCES supplier_invoices(id) ON DELETE CASCADE,
  product_id      UUID        REFERENCES products(id) ON DELETE SET NULL,
  description     TEXT        NOT NULL,
  quantity        NUMERIC(10,3) NOT NULL,
  unit_cost       NUMERIC(12,2) NOT NULL,
  line_total      NUMERIC(12,2) NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 6. Create supplier_claims table
CREATE TABLE IF NOT EXISTS supplier_claims (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id            UUID        NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  po_id               UUID        REFERENCES purchase_orders(id) ON DELETE SET NULL,
  supplier_id         UUID        NOT NULL REFERENCES suppliers(id) ON DELETE RESTRICT,
  claim_number        TEXT        NOT NULL UNIQUE,
  claim_type          TEXT        NOT NULL
    CHECK (claim_type IN ('DAMAGED','SHORT_DELIVERED','WRONG_ITEM','DEFECTIVE','OVERCHARGED')),
  product_id          UUID        REFERENCES products(id) ON DELETE SET NULL,
  quantity_affected   NUMERIC(10,3) NOT NULL DEFAULT 1,
  description         TEXT        NOT NULL,
  status              TEXT        NOT NULL DEFAULT 'OPEN'
    CHECK (status IN ('OPEN','ACKNOWLEDGED','RESOLVED','REJECTED')),
  resolution_type     TEXT
    CHECK (resolution_type IN ('CREDIT_NOTE','REPLACEMENT','REFUND','NONE')),
  resolution_amount   NUMERIC(12,2),
  resolution_notes    TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at         TIMESTAMPTZ
);

-- 7. Enable RLS and set permissive policies (matching other tables in app)
ALTER TABLE supplier_invoices      ENABLE ROW LEVEL SECURITY;
ALTER TABLE supplier_invoice_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE supplier_claims        ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow full access for all" ON supplier_invoices
  FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Allow full access for all" ON supplier_invoice_items
  FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Allow full access for all" ON supplier_claims
  FOR ALL USING (true) WITH CHECK (true);

-- 8. Performance indexes
CREATE INDEX IF NOT EXISTS idx_supplier_invoices_store    ON supplier_invoices (store_id, status);
CREATE INDEX IF NOT EXISTS idx_supplier_invoices_po       ON supplier_invoices (po_id);
CREATE INDEX IF NOT EXISTS idx_supplier_invoice_items_inv ON supplier_invoice_items (invoice_id);
CREATE INDEX IF NOT EXISTS idx_supplier_claims_store      ON supplier_claims (store_id, status);
CREATE INDEX IF NOT EXISTS idx_supplier_claims_supplier   ON supplier_claims (supplier_id);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_number     ON purchase_orders (order_number);

-- Done!
SELECT 'Migration complete: supplier_invoices, supplier_invoice_items, supplier_claims tables created.' AS status;
