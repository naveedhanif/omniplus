import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-database-schema',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="space-y-6">
      <div class="bg-amber-50 dark:bg-amber-900/10 border-l-4 border-amber-500 p-4 rounded-r-xl">
        <div class="flex items-center gap-3">
          <span class="material-symbols-rounded text-amber-600">warning</span>
          <div class="text-sm">
            <p class="font-bold text-amber-800 dark:text-amber-200">Developer Tools Only</p>
            <p class="text-amber-700 dark:text-amber-300 opacity-80">Scripts below are for direct Supabase SQL Editor execution. Use with caution.</p>
          </div>
        </div>
      </div>

      <div class="grid grid-cols-1 gap-6">
        <!-- STOCK MANAGEMENT MIGRATION (NEW - PRIORITY) -->
        <div class="bg-gradient-to-r from-blue-50 to-purple-50 dark:from-blue-900/20 dark:to-purple-900/20 rounded-xl shadow-lg border-2 border-blue-300 dark:border-blue-700 overflow-hidden">
          <div class="p-4 border-b border-blue-300 dark:border-blue-700 flex justify-between items-center bg-blue-100 dark:bg-blue-900/30">
            <div>
              <h3 class="font-bold text-base text-blue-900 dark:text-blue-100 flex items-center gap-2">
                <span class="material-symbols-rounded">warehouse</span>
                Stock Management System - Complete Migration
              </h3>
              <p class="text-xs text-blue-700 dark:text-blue-300 mt-1">⭐ Run this first! Includes products table prep + all stock tables</p>
            </div>
            <button (click)="copyToClipboard(stockManagementScript)" class="px-4 py-2 bg-blue-600 text-white rounded-lg font-bold hover:bg-blue-700 flex items-center gap-2 shadow-lg">
              <span class="material-symbols-rounded text-base">content_copy</span> Copy Script
            </button>
          </div>
          <div class="p-4 bg-slate-900 overflow-x-auto max-h-96">
             <pre class="text-[10px] text-blue-400 font-mono"><code>{{ stockManagementScript }}</code></pre>
          </div>
          <div class="p-3 bg-blue-50 dark:bg-blue-900/20 border-t border-blue-200 dark:border-blue-800">
            <p class="text-xs text-blue-800 dark:text-blue-200">
              <strong>✅ Safe to run multiple times</strong> • Creates: stock_locations, stock_ledger, stock_levels, stock_transfers, stock_reservations, stock_reorder_rules
            </p>
          </div>
        </div>

        <!-- STOCK MOCK DATA (RUN AFTER MIGRATION) -->
        <div class="bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20 rounded-xl shadow-lg border-2 border-green-300 dark:border-green-700 overflow-hidden">
          <div class="p-4 border-b border-green-300 dark:border-green-700 flex justify-between items-center bg-green-100 dark:bg-green-900/30">
            <div>
              <h3 class="font-bold text-base text-green-900 dark:text-green-100 flex items-center gap-2">
                <span class="material-symbols-rounded">inventory_2</span>
                Stock Management - Mock Data
              </h3>
              <p class="text-xs text-green-700 dark:text-green-300 mt-1">🎯 Run this AFTER the migration to add test data</p>
            </div>
            <button (click)="copyToClipboard(stockMockDataScript)" class="px-4 py-2 bg-green-600 text-white rounded-lg font-bold hover:bg-green-700 flex items-center gap-2 shadow-lg">
              <span class="material-symbols-rounded text-base">content_copy</span> Copy Script
            </button>
          </div>
          <div class="p-4 bg-slate-900 overflow-x-auto max-h-96">
             <pre class="text-[10px] text-green-400 font-mono"><code>{{ stockMockDataScript }}</code></pre>
          </div>
          <div class="p-3 bg-green-50 dark:bg-green-900/20 border-t border-green-200 dark:border-green-800">
            <p class="text-xs text-green-800 dark:text-green-200">
              <strong>📦 Creates:</strong> 2 stock locations (Main Floor, Warehouse) • Initial stock for 10 products • 5 reorder rules
            </p>
          </div>
        </div>

        <!-- EXISTING MIGRATIONS -->
        <div class="bg-[var(--card-bg)] rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden">
          <div class="p-4 border-b border-slate-200 dark:border-slate-700 flex justify-between items-center bg-slate-50 dark:bg-slate-800/50">
            <h3 class="font-bold text-sm">Product & Store Enhancement Migration</h3>
            <button (click)="copyToClipboard(migrationScript)" class="text-xs font-bold text-[var(--primary-color)] hover:underline flex items-center gap-1">
              <span class="material-symbols-rounded text-base">content_copy</span> Copy
            </button>
          </div>
          <div class="p-4 bg-slate-900 overflow-x-auto max-h-64">
             <pre class="text-[10px] text-green-400 font-mono"><code>{{ migrationScript }}</code></pre>
          </div>
        </div>

        <div class="bg-[var(--card-bg)] rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden">
          <div class="p-4 border-b border-slate-200 dark:border-slate-700 flex justify-between items-center bg-slate-50 dark:bg-slate-800/50">
            <h3 class="font-bold text-sm text-red-500">Database Reset Script (DANGEROUS)</h3>
            <button (click)="copyToClipboard(resetScript)" class="text-xs font-bold text-red-500 hover:underline flex items-center gap-1">
              <span class="material-symbols-rounded text-base">content_copy</span> Copy
            </button>
          </div>
          <div class="p-4 bg-slate-900 overflow-x-auto">
             <pre class="text-[10px] text-red-400 font-mono"><code>{{ resetScript }}</code></pre>
          </div>
        </div>
      </div>
    </div>
  `,
  styleUrls: []
})
// Updated: 2026-02-12 - Added stock mock data script
export class DatabaseSchemaComponent {
  stockManagementScript = `-- =====================================================
-- SIMPLE Stock Management Migration (Single-Tenant)
-- Version: 1.0 - Simplified for Single-Tenant Setup
-- Date: 2026-02-12
-- =====================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =====================================================
-- STEP 1: Prepare Products Table
-- =====================================================

-- Add missing columns to products table
ALTER TABLE products ADD COLUMN IF NOT EXISTS sku TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS barcode TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS description TEXT;

-- Create indexes
CREATE UNIQUE INDEX IF NOT EXISTS idx_products_sku ON products(sku) WHERE sku IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_products_barcode ON products(barcode) WHERE barcode IS NOT NULL;

-- Generate SKUs for existing products
UPDATE products 
SET sku = 'SKU-' || SUBSTRING(id::text, 1, 8)
WHERE sku IS NULL OR sku = '';

-- Generate barcodes for existing products
UPDATE products 
SET barcode = '000' || SUBSTRING(id::text, 1, 10)
WHERE barcode IS NULL OR barcode = '';

-- =====================================================
-- STEP 2: Create Suppliers Table (if not exists)
-- =====================================================

CREATE TABLE IF NOT EXISTS suppliers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    contact_person TEXT,
    email TEXT,
    phone TEXT,
    address TEXT,
    notes TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- =====================================================
-- STEP 3: Stock Locations
-- =====================================================

CREATE TABLE IF NOT EXISTS stock_locations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    store_id UUID REFERENCES stores(id) ON DELETE CASCADE,
    
    name TEXT NOT NULL UNIQUE,
    location_type TEXT NOT NULL CHECK (location_type IN ('STORE', 'WAREHOUSE', 'TRANSIT')),
    
    address TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    
    allows_sales BOOLEAN DEFAULT TRUE,
    allows_receiving BOOLEAN DEFAULT TRUE,
    
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_stock_locations_store ON stock_locations(store_id);
CREATE INDEX IF NOT EXISTS idx_stock_locations_type ON stock_locations(location_type) WHERE is_active = TRUE;

-- =====================================================
-- STEP 4: Stock Ledger (Immutable Event Log)
-- =====================================================

CREATE TABLE IF NOT EXISTS stock_ledger (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    movement_type TEXT NOT NULL CHECK (movement_type IN (
        'INITIAL_STOCK',
        'PURCHASE_RECEIVE',
        'SALE',
        'RETURN_IN',
        'RETURN_OUT',
        'TRANSFER_OUT',
        'TRANSFER_IN',
        'ADJUSTMENT_IN',
        'ADJUSTMENT_OUT',
        'DAMAGE_WRITE_OFF',
        'RESERVATION',
        'RESERVATION_RELEASE'
    )),
    
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
    location_id UUID NOT NULL REFERENCES stock_locations(id) ON DELETE RESTRICT,
    
    quantity NUMERIC NOT NULL,
    
    unit_cost NUMERIC,
    total_cost NUMERIC GENERATED ALWAYS AS (ABS(quantity) * COALESCE(unit_cost, 0)) STORED,
    
    reference_type TEXT,
    reference_id UUID,
    
    from_location_id UUID REFERENCES stock_locations(id),
    to_location_id UUID REFERENCES stock_locations(id),
    transfer_id UUID,
    
    performed_by UUID,
    reason TEXT,
    notes TEXT,
    
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    CHECK (
        (movement_type IN ('TRANSFER_OUT', 'TRANSFER_IN') AND transfer_id IS NOT NULL)
        OR
        (movement_type NOT IN ('TRANSFER_OUT', 'TRANSFER_IN'))
    )
);

CREATE INDEX IF NOT EXISTS idx_stock_ledger_product_location ON stock_ledger(product_id, location_id);
CREATE INDEX IF NOT EXISTS idx_stock_ledger_location ON stock_ledger(location_id);
CREATE INDEX IF NOT EXISTS idx_stock_ledger_created ON stock_ledger(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_stock_ledger_reference ON stock_ledger(reference_type, reference_id);
CREATE INDEX IF NOT EXISTS idx_stock_ledger_transfer ON stock_ledger(transfer_id) WHERE transfer_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_stock_ledger_movement_type ON stock_ledger(movement_type);

-- =====================================================
-- STEP 5: Stock Levels (Materialized View)
-- =====================================================

DROP MATERIALIZED VIEW IF EXISTS stock_levels CASCADE;

CREATE MATERIALIZED VIEW stock_levels AS
SELECT 
    sl.product_id,
    sl.location_id,
    
    SUM(CASE 
        WHEN sl.movement_type NOT IN ('RESERVATION', 'DAMAGE_WRITE_OFF') 
        THEN sl.quantity 
        ELSE 0 
    END) AS available_quantity,
    
    SUM(CASE 
        WHEN sl.movement_type = 'RESERVATION' 
        THEN ABS(sl.quantity) 
        ELSE 0 
    END) AS reserved_quantity,
    
    SUM(CASE 
        WHEN sl.movement_type = 'DAMAGE_WRITE_OFF' 
        THEN ABS(sl.quantity) 
        ELSE 0 
    END) AS damaged_quantity,
    
    SUM(CASE 
        WHEN sl.movement_type NOT IN ('RESERVATION') 
        THEN sl.quantity 
        ELSE 0 
    END) AS physical_quantity,
    
    SUM(sl.total_cost) AS stock_value,
    
    MAX(sl.created_at) AS last_movement_at
    
FROM stock_ledger sl
GROUP BY sl.product_id, sl.location_id;

CREATE UNIQUE INDEX IF NOT EXISTS idx_stock_levels_unique ON stock_levels(product_id, location_id);
CREATE INDEX IF NOT EXISTS idx_stock_levels_product ON stock_levels(product_id);
CREATE INDEX IF NOT EXISTS idx_stock_levels_location ON stock_levels(location_id);
CREATE INDEX IF NOT EXISTS idx_stock_levels_low_stock ON stock_levels(available_quantity) WHERE available_quantity < 10;

-- =====================================================
-- STEP 6: Stock Reorder Rules
-- =====================================================

CREATE TABLE IF NOT EXISTS stock_reorder_rules (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    location_id UUID NOT NULL REFERENCES stock_locations(id) ON DELETE CASCADE,
    
    minimum_quantity NUMERIC NOT NULL DEFAULT 0,
    reorder_quantity NUMERIC NOT NULL DEFAULT 0,
    maximum_quantity NUMERIC,
    
    preferred_supplier_id UUID REFERENCES suppliers(id),
    supplier_lead_time_days INTEGER DEFAULT 7,
    
    is_active BOOLEAN DEFAULT TRUE,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    UNIQUE(product_id, location_id)
);

CREATE INDEX IF NOT EXISTS idx_reorder_rules_product ON stock_reorder_rules(product_id);
CREATE INDEX IF NOT EXISTS idx_reorder_rules_location ON stock_reorder_rules(location_id);

-- =====================================================
-- STEP 7: Stock Transfers
-- =====================================================

CREATE TABLE IF NOT EXISTS stock_transfers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    transfer_number TEXT NOT NULL UNIQUE,
    
    from_location_id UUID NOT NULL REFERENCES stock_locations(id),
    to_location_id UUID NOT NULL REFERENCES stock_locations(id),
    
    status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN (
        'PENDING',
        'APPROVED',
        'IN_TRANSIT',
        'RECEIVED',
        'CANCELLED'
    )),
    
    requested_by UUID,
    approved_by UUID,
    shipped_by UUID,
    received_by UUID,
    
    requested_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    approved_at TIMESTAMP WITH TIME ZONE,
    shipped_at TIMESTAMP WITH TIME ZONE,
    received_at TIMESTAMP WITH TIME ZONE,
    
    notes TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    CHECK (from_location_id != to_location_id)
);

CREATE INDEX IF NOT EXISTS idx_stock_transfers_from ON stock_transfers(from_location_id);
CREATE INDEX IF NOT EXISTS idx_stock_transfers_to ON stock_transfers(to_location_id);
CREATE INDEX IF NOT EXISTS idx_stock_transfers_status ON stock_transfers(status);
CREATE INDEX IF NOT EXISTS idx_stock_transfers_created ON stock_transfers(created_at DESC);

-- =====================================================
-- STEP 8: Stock Transfer Items
-- =====================================================

CREATE TABLE IF NOT EXISTS stock_transfer_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    transfer_id UUID NOT NULL REFERENCES stock_transfers(id) ON DELETE CASCADE,
    
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
    
    quantity_requested NUMERIC NOT NULL,
    quantity_shipped NUMERIC DEFAULT 0,
    quantity_received NUMERIC DEFAULT 0,
    
    unit_cost NUMERIC,
    
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    CHECK (quantity_requested > 0),
    CHECK (quantity_shipped >= 0 AND quantity_shipped <= quantity_requested),
    CHECK (quantity_received >= 0 AND quantity_received <= quantity_shipped)
);

CREATE INDEX IF NOT EXISTS idx_transfer_items_transfer ON stock_transfer_items(transfer_id);
CREATE INDEX IF NOT EXISTS idx_transfer_items_product ON stock_transfer_items(product_id);

-- =====================================================
-- STEP 9: Stock Reservations
-- =====================================================

CREATE TABLE IF NOT EXISTS stock_reservations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
    location_id UUID NOT NULL REFERENCES stock_locations(id) ON DELETE RESTRICT,
    
    quantity NUMERIC NOT NULL,
    
    reservation_type TEXT NOT NULL CHECK (reservation_type IN (
        'QUOTE',
        'PENDING_ORDER',
        'TECHNICIAN_BOOKING',
        'MANUAL'
    )),
    
    reference_id UUID,
    
    reserved_by UUID,
    reserved_for TEXT,
    
    expires_at TIMESTAMP WITH TIME ZONE,
    
    status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'FULFILLED', 'RELEASED', 'EXPIRED')),
    
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    released_at TIMESTAMP WITH TIME ZONE,
    
    CHECK (quantity > 0)
);

CREATE INDEX IF NOT EXISTS idx_reservations_product_location ON stock_reservations(product_id, location_id);
CREATE INDEX IF NOT EXISTS idx_reservations_status ON stock_reservations(status) WHERE status = 'ACTIVE';
CREATE INDEX IF NOT EXISTS idx_reservations_expires ON stock_reservations(expires_at) WHERE status = 'ACTIVE' AND expires_at IS NOT NULL;

-- =====================================================
-- STEP 10: Helper Functions
-- =====================================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create triggers for updated_at
DROP TRIGGER IF EXISTS update_stock_locations_updated_at ON stock_locations;
CREATE TRIGGER update_stock_locations_updated_at
    BEFORE UPDATE ON stock_locations
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_stock_transfers_updated_at ON stock_transfers;
CREATE TRIGGER update_stock_transfers_updated_at
    BEFORE UPDATE ON stock_transfers
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_stock_reorder_rules_updated_at ON stock_reorder_rules;
CREATE TRIGGER update_stock_reorder_rules_updated_at
    BEFORE UPDATE ON stock_reorder_rules
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- STEP 11: Create Default Locations for Existing Stores
-- =====================================================

-- Insert default stock location for each store (if not exists)
INSERT INTO stock_locations (store_id, name, location_type, allows_sales, allows_receiving)
SELECT 
    s.id,
    s.name || ' - Main Floor',
    'STORE',
    TRUE,
    TRUE
FROM stores s
WHERE NOT EXISTS (
    SELECT 1 FROM stock_locations sl 
    WHERE sl.store_id = s.id AND sl.location_type = 'STORE'
);

-- =====================================================
-- MIGRATION COMPLETE
-- =====================================================

-- Verify the setup
SELECT 
    'Products with SKU' as check_name,
    COUNT(*) as count
FROM products
WHERE sku IS NOT NULL

UNION ALL

SELECT 
    'Stock Locations' as check_name,
    COUNT(*) as count
FROM stock_locations

UNION ALL

SELECT 
    'Stock Ledger Entries' as check_name,
    COUNT(*) as count
FROM stock_ledger;

-- Success message
DO $$
BEGIN
    RAISE NOTICE '✅ Stock Management System migration completed successfully!';
    RAISE NOTICE '📦 Tables created: stock_locations, stock_ledger, stock_levels, stock_transfers, stock_reservations';
    RAISE NOTICE '🎯 Next step: Start tracking inventory movements!';
END $$;
`.trim();

  migrationScript = `
-- Migration: Add Metadata and Unit Type
ALTER TABLE products ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;
ALTER TABLE products ADD COLUMN IF NOT EXISTS unit_type TEXT DEFAULT 'PIECE';
CREATE INDEX IF NOT EXISTS idx_products_metadata ON products USING gin (metadata);

-- Migration: Create Store Profiles Table
CREATE TABLE IF NOT EXISTS store_profiles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    store_id UUID REFERENCES stores(id) ON DELETE CASCADE,
    address TEXT,
    phone TEXT,
    email TEXT,
    business_hours JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_store_profiles_store_id ON store_profiles(store_id);

-- Migration: Create Staff Table
CREATE TABLE IF NOT EXISTS staff (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    store_id UUID REFERENCES stores(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    role TEXT CHECK (role IN ('ADMIN', 'MANAGER', 'CASHIER')),
    pin_code TEXT NOT NULL,
    active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Migration: Create Tax Profiles Table
CREATE TABLE IF NOT EXISTS tax_profiles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    store_id UUID REFERENCES stores(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    rate NUMERIC NOT NULL,
    is_default BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Migration: Create Activity Logs Table
CREATE TABLE IF NOT EXISTS activity_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    store_id UUID REFERENCES stores(id) ON DELETE CASCADE,
    staff_id UUID REFERENCES staff(id) ON DELETE SET NULL,
    action TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id UUID,
    device_info TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Migration: Add Pro-Grade Fields to Products
ALTER TABLE products ADD COLUMN IF NOT EXISTS wholesale_price NUMERIC;
ALTER TABLE products ADD COLUMN IF NOT EXISTS tax_profile_id UUID REFERENCES tax_profiles(id);
ALTER TABLE products ADD COLUMN IF NOT EXISTS tags TEXT[];
ALTER TABLE products ADD COLUMN IF NOT EXISTS batch_number TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS expiry_date DATE;
ALTER TABLE products ADD COLUMN IF NOT EXISTS alert_on_expiry BOOLEAN DEFAULT FALSE;
ALTER TABLE products ADD COLUMN IF NOT EXISTS brand TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS compatible_models TEXT[];
ALTER TABLE products ADD COLUMN IF NOT EXISTS voltage TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS oem_aftermarket TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS warranty_period TEXT;

-- Migration: Add Hierarchy to Categories
ALTER TABLE categories ADD COLUMN IF NOT EXISTS parent_id UUID REFERENCES categories(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_categories_parent_id ON categories(parent_id);

-- Migration: Add payments and metadata to transactions
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS payments JSONB DEFAULT '[]'::jsonb;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;
CREATE INDEX IF NOT EXISTS idx_transactions_metadata ON transactions USING gin (metadata);

CREATE INDEX IF NOT EXISTS idx_products_sku ON products(sku);
CREATE INDEX IF NOT EXISTS idx_products_barcode ON products(barcode);
CREATE INDEX IF NOT EXISTS idx_products_compatible_models ON products USING GIN (compatible_models);
CREATE INDEX IF NOT EXISTS idx_products_expiry ON products(expiry_date) WHERE expiry_date IS NOT NULL;
  `.trim();

  stockMockDataScript = `-- =====================================================
-- Stock Management - Mock Data for Testing
-- Run this AFTER the main migration
-- =====================================================

-- Get the first store ID (you can replace this with your actual store ID)
DO $$
DECLARE
    v_store_id UUID;
    v_location_main UUID;
    v_location_warehouse UUID;
    v_product_1 UUID;
    v_product_2 UUID;
    v_product_3 UUID;
BEGIN
    -- Get first store
    SELECT id INTO v_store_id FROM stores LIMIT 1;
    
    IF v_store_id IS NULL THEN
        RAISE EXCEPTION 'No stores found! Please create a store first.';
    END IF;
    
    RAISE NOTICE 'Using store ID: %', v_store_id;
    
    -- Create stock locations (if they don't exist)
    INSERT INTO stock_locations (store_id, name, location_type, allows_sales, allows_receiving)
    VALUES 
        (v_store_id, 'Main Floor', 'STORE', TRUE, TRUE),
        (v_store_id, 'Back Warehouse', 'WAREHOUSE', FALSE, TRUE)
    ON CONFLICT (name) DO NOTHING;
    
    -- Get location IDs
    SELECT id INTO v_location_main FROM stock_locations WHERE name = 'Main Floor' LIMIT 1;
    SELECT id INTO v_location_warehouse FROM stock_locations WHERE name = 'Back Warehouse' LIMIT 1;
    
    RAISE NOTICE 'Main Floor Location ID: %', v_location_main;
    RAISE NOTICE 'Warehouse Location ID: %', v_location_warehouse;
    
    -- Get some product IDs (or create test products)
    SELECT id INTO v_product_1 FROM products LIMIT 1 OFFSET 0;
    SELECT id INTO v_product_2 FROM products LIMIT 1 OFFSET 1;
    SELECT id INTO v_product_3 FROM products LIMIT 1 OFFSET 2;
    
    IF v_product_1 IS NULL THEN
        RAISE NOTICE 'No products found. Creating test products...';
        
        -- Create test products
        INSERT INTO products (name, price, category_id, sku, barcode)
        SELECT 
            'Test Product ' || i,
            (10 + i * 5)::NUMERIC,
            (SELECT id FROM categories LIMIT 1),
            'SKU-TEST-' || i,
            'BAR-' || i
        FROM generate_series(1, 10) i
        RETURNING id INTO v_product_1;
        
        SELECT id INTO v_product_2 FROM products WHERE name LIKE 'Test Product%' LIMIT 1 OFFSET 1;
        SELECT id INTO v_product_3 FROM products WHERE name LIKE 'Test Product%' LIMIT 1 OFFSET 2;
    END IF;
    
    -- Add initial stock to Main Floor
    INSERT INTO stock_ledger (movement_type, product_id, location_id, quantity, unit_cost, reason)
    SELECT 
        'INITIAL_STOCK',
        id,
        v_location_main,
        (50 + (random() * 100)::int)::NUMERIC,
        price * 0.6,
        'Initial stock setup'
    FROM products
    LIMIT 10;
    
    -- Add initial stock to Warehouse
    INSERT INTO stock_ledger (movement_type, product_id, location_id, quantity, unit_cost, reason)
    SELECT 
        'INITIAL_STOCK',
        id,
        v_location_warehouse,
        (100 + (random() * 200)::int)::NUMERIC,
        price * 0.6,
        'Initial warehouse stock'
    FROM products
    LIMIT 10;
    
    -- Refresh the materialized view
    REFRESH MATERIALIZED VIEW stock_levels;
    
    -- Create some reorder rules
    INSERT INTO stock_reorder_rules (product_id, location_id, minimum_quantity, reorder_quantity, supplier_lead_time_days)
    SELECT 
        id,
        v_location_main,
        10,
        50,
        7
    FROM products
    LIMIT 5
    ON CONFLICT (product_id, location_id) DO NOTHING;
    
    RAISE NOTICE '✅ Mock data created successfully!';
    RAISE NOTICE '📦 Stock locations: Main Floor, Back Warehouse';
    RAISE NOTICE '📊 Initial stock added for up to 10 products';
    RAISE NOTICE '🔔 Reorder rules created for 5 products';
END $$;

-- Verify the data
SELECT 
    'Stock Locations' as item,
    COUNT(*) as count
FROM stock_locations

UNION ALL

SELECT 
    'Stock Movements' as item,
    COUNT(*) as count
FROM stock_ledger

UNION ALL

SELECT 
    'Stock Levels (Current)' as item,
    COUNT(*) as count
FROM stock_levels

UNION ALL

SELECT 
    'Reorder Rules' as item,
    COUNT(*) as count
FROM stock_reorder_rules;

-- Show sample stock levels
SELECT 
    p.name as product_name,
    p.sku,
    sl.name as location,
    stk.available_quantity,
    stk.physical_quantity,
    stk.stock_value
FROM stock_levels stk
JOIN products p ON p.id = stk.product_id
JOIN stock_locations sl ON sl.id = stk.location_id
ORDER BY sl.name, p.name
LIMIT 20;
`.trim();

  resetScript = `
--IMPORTANT: This will delete all your local mock data!
TRUNCATE TABLE products CASCADE;
TRUNCATE TABLE categories CASCADE;
TRUNCATE TABLE stores CASCADE;
TRUNCATE TABLE customers CASCADE;
TRUNCATE TABLE transactions CASCADE;
`.trim();

  copyToClipboard(text: string) {
    navigator.clipboard.writeText(text);
    alert('Copied to clipboard!');
  }
}
