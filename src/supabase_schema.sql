-- ⚠️ WARNING: Running this will delete existing data.
-- This is a "World Class" Professional Inventory Schema
-- Features: Multi-Location, Supply Chain (PO), Audit Trails, serialized tracking.

-- 1. CLEANUP (Drop All)
DROP TABLE IF EXISTS public.stock_ledger CASCADE;
DROP TABLE IF EXISTS public.stock_levels CASCADE;
DROP TABLE IF EXISTS public.stock_locations CASCADE;
DROP TABLE IF EXISTS public.stock_movements CASCADE; -- Legacy
DROP TABLE IF EXISTS public.inventory_transfer_items CASCADE;
DROP TABLE IF EXISTS public.inventory_transfers CASCADE;
DROP TABLE IF EXISTS public.purchase_order_items CASCADE;
DROP TABLE IF EXISTS public.purchase_orders CASCADE;
DROP TABLE IF EXISTS public.suppliers CASCADE;
DROP TABLE IF EXISTS public.transaction_items CASCADE;
DROP TABLE IF EXISTS public.transactions CASCADE;
DROP TABLE IF EXISTS public.composite_products CASCADE;
DROP TABLE IF EXISTS public.serial_numbers CASCADE;
DROP TABLE IF EXISTS public.product_images CASCADE;
DROP TABLE IF EXISTS public.products CASCADE;
DROP TABLE IF EXISTS public.sub_categories CASCADE;
DROP TABLE IF EXISTS public.categories CASCADE;
DROP TABLE IF EXISTS public.tax_profiles CASCADE;
DROP TABLE IF EXISTS public.brands CASCADE;
DROP TABLE IF EXISTS public.customer_ledger CASCADE;
DROP TABLE IF EXISTS public.customers CASCADE;
DROP TABLE IF EXISTS public.staff CASCADE;
DROP TABLE IF EXISTS public.activity_logs CASCADE;
DROP TABLE IF EXISTS public.store_profiles CASCADE;
DROP TABLE IF EXISTS public.stores CASCADE;

-- Drop Types
DROP TYPE IF EXISTS public.store_type_enum CASCADE;
DROP TYPE IF EXISTS public.payment_method_enum CASCADE;
DROP TYPE IF EXISTS public.serial_status_enum CASCADE;
DROP TYPE IF EXISTS public.po_status_enum CASCADE;
DROP TYPE IF EXISTS public.transfer_status_enum CASCADE;
DROP TYPE IF EXISTS public.location_type_enum CASCADE;
DROP TYPE IF EXISTS public.activity_type_enum CASCADE;

-- 2. ENUMS & TYPES
CREATE TYPE store_type_enum AS ENUM ('HARDWARE', 'MEDICAL', 'RESTAURANT', 'RETAIL');
CREATE TYPE payment_method_enum AS ENUM ('CASH', 'CARD', 'SPLIT', 'ON_ACCOUNT');
CREATE TYPE serial_status_enum AS ENUM ('IN_STOCK', 'SOLD', 'RETURNED', 'DAMAGED', 'LOST', 'TRANSIT');
CREATE TYPE po_status_enum AS ENUM ('DRAFT', 'SENT', 'PARTIAL', 'RECEIVED', 'CANCELLED');
CREATE TYPE transfer_status_enum AS ENUM ('PENDING', 'APPROVED', 'IN_TRANSIT', 'COMPLETED', 'CANCELLED');
CREATE TYPE location_type_enum AS ENUM ('SHOP', 'WAREHOUSE', 'TRANSIT', 'SUPPLIER_VIRTUAL', 'CUSTOMER_VIRTUAL', 'LOSS_VIRTUAL');

-- 3. CORE HIERARCHY

-- Stores (Tenants)
CREATE TABLE public.stores (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name TEXT NOT NULL,
    type store_type_enum NOT NULL,
    currency TEXT DEFAULT '$',
    config JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Store Profiles (Details)
CREATE TABLE public.store_profiles (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
    address TEXT,
    phone TEXT,
    email TEXT,
    business_hours JSONB DEFAULT '{}'::jsonb,
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT store_profiles_store_id_unique UNIQUE (store_id)
);

-- Locations (The Physical Places)
-- Every Store requires at least one SHOP and one WAREHOUSE location by default.
CREATE TABLE public.stock_locations (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    type location_type_enum NOT NULL,
    is_active BOOLEAN DEFAULT true,
    address TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Staff
CREATE TABLE public.staff (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    role TEXT DEFAULT 'CASHIER', -- 'ADMIN', 'MANAGER', 'CASHIER'
    pin_code TEXT,
    active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. PRODUCT CATALOG (The "What")

-- Brands
CREATE TABLE public.brands (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Categories
CREATE TABLE public.categories (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    parent_id UUID REFERENCES public.categories(id) ON DELETE SET NULL, -- Hierarchy
    color TEXT DEFAULT '#3b82f6',
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Suppliers
CREATE TABLE public.suppliers (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    contact_person TEXT,
    email TEXT,
    phone TEXT,
    lead_time_days INTEGER DEFAULT 7,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tax Profiles
CREATE TABLE public.tax_profiles (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    rate NUMERIC(5,4) NOT NULL, -- 0.20 = 20%
    is_default BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Products (Master Data)
CREATE TABLE public.products (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
    
    -- Identity
    name TEXT NOT NULL,
    description TEXT,
    category_id UUID REFERENCES public.categories(id) ON DELETE SET NULL,
    brand_id UUID REFERENCES public.brands(id) ON DELETE SET NULL,
    supplier_id UUID REFERENCES public.suppliers(id) ON DELETE SET NULL,
    
    -- Identifiers
    barcode TEXT,
    supplier_sku TEXT,
    
    -- Pricing
    price NUMERIC(10,2) NOT NULL CHECK (price >= 0),
    cost_price NUMERIC(10,2) DEFAULT 0.00,
    tax_profile_id UUID REFERENCES public.tax_profiles(id) ON DELETE SET NULL,
    
    -- Configuration
    is_serialized BOOLEAN DEFAULT false NOT NULL,
    unit_type TEXT DEFAULT 'PIECE', -- 'PIECE', 'KG', 'BOX'
    
    -- Inventory Settings
    reorder_point INTEGER DEFAULT 5, -- Global Alert Level
    
    -- Assets
    image_url TEXT,
    
    -- Metadata
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    
    CONSTRAINT products_barcode_unique UNIQUE (store_id, barcode)
);

-- Composite / Recipe
CREATE TABLE public.composite_products (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    parent_product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
    ingredient_product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
    quantity_required NUMERIC(10,4) NOT NULL
);

-- 5. INVENTORY ENGINE (The "Where" & "How Much")

-- Stock Levels (Snapshots)
-- This allows precise tracking: Store X has 5, Warehouse Y has 50.
CREATE TABLE public.stock_levels (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
    location_id UUID NOT NULL REFERENCES public.stock_locations(id) ON DELETE CASCADE,
    quantity INTEGER NOT NULL DEFAULT 0,
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    CONSTRAINT stock_levels_unique UNIQUE (product_id, location_id)
);

-- Serial Numbers (Detail for Serialized items)
CREATE TABLE public.serial_numbers (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
    current_location_id UUID REFERENCES public.stock_locations(id) ON DELETE SET NULL,
    
    serial_number TEXT NOT NULL,
    status serial_status_enum DEFAULT 'IN_STOCK',
    
    -- Warranty
    warranty_expires_at TIMESTAMPTZ,
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    CONSTRAINT serial_numbers_unique UNIQUE (store_id, product_id, serial_number)
);

-- Stock Ledger (Audit Trail)
-- EVERYTHING that changes stock must insert here.
CREATE TABLE public.stock_ledger (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
    
    -- Movement Details
    location_id UUID NOT NULL REFERENCES public.stock_locations(id), -- Where did it happen?
    quantity_change INTEGER NOT NULL, -- +5 or -2
    balance_after INTEGER NOT NULL, -- Snapshot of balance after logic
    
    -- Context
    reason TEXT NOT NULL, -- 'SALE', 'RECEIVE_PO', 'TRANSFER_IN', 'TRANSFER_OUT', 'DAMAGE'
    reference_id UUID, -- ID of the Transaction, PO, or Transfer
    notes TEXT,
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    created_by UUID -- Staff ID
);

-- 6. SUPPLY CHAIN (Procurement)

CREATE TABLE public.purchase_orders (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
    supplier_id UUID NOT NULL REFERENCES public.suppliers(id),
    status po_status_enum DEFAULT 'DRAFT',
    
    -- Info
    total_amount NUMERIC(10,2) DEFAULT 0,
    expected_arrival DATE,
    notes TEXT,
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE public.purchase_order_items (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    po_id UUID NOT NULL REFERENCES public.purchase_orders(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
    
    quantity_ordered INTEGER NOT NULL CHECK (quantity_ordered > 0),
    quantity_received INTEGER DEFAULT 0,
    unit_cost NUMERIC(10,2) NOT NULL DEFAULT 0
);

-- 7. LOGISTICS (Transfers)

CREATE TABLE public.inventory_transfers (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
    
    from_location_id UUID NOT NULL REFERENCES public.stock_locations(id),
    to_location_id UUID NOT NULL REFERENCES public.stock_locations(id),
    
    status transfer_status_enum DEFAULT 'PENDING',
    notes TEXT,
    
    created_by UUID,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ
);

CREATE TABLE public.inventory_transfer_items (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    transfer_id UUID NOT NULL REFERENCES public.inventory_transfers(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
    quantity_requested INTEGER NOT NULL,
    quantity_shipped INTEGER DEFAULT 0,
    quantity_received INTEGER DEFAULT 0
);

-- 8. SALES & CUSTOMERS

CREATE TABLE public.customers (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
    full_name TEXT NOT NULL,
    phone TEXT,
    email TEXT,
    current_balance NUMERIC(10,2) DEFAULT 0,
    is_vip BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE public.transactions (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
    customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL,
    
    total_amount NUMERIC(10,2) NOT NULL,
    tax_amount NUMERIC(10,2) NOT NULL,
    payment_method payment_method_enum NOT NULL, -- Primary method
    
    payments JSONB DEFAULT '[]'::jsonb, -- Support Split Payments detailed
    
    metadata JSONB DEFAULT '{}'::jsonb, -- Void status, etc.
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE public.transaction_items (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    transaction_id UUID NOT NULL REFERENCES public.transactions(id) ON DELETE CASCADE,
    product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
    
    quantity INTEGER NOT NULL,
    price_at_sale NUMERIC(10,2) NOT NULL,
    cost_at_sale NUMERIC(10,2), -- Capture margin at moment of sale
    
    serial_number_id UUID REFERENCES public.serial_numbers(id) ON DELETE SET NULL
);

CREATE TABLE public.customer_ledger (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
    customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
    transaction_id UUID REFERENCES public.transactions(id) ON DELETE SET NULL,
    
    type TEXT NOT NULL, -- 'SALE', 'PAYMENT', 'REFUND'
    amount NUMERIC(10,2) NOT NULL,
    notes TEXT,
    
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE public.activity_logs (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
    staff_id UUID, -- Link to Public.Staff if possible, or just text
    action TEXT NOT NULL,
    entity_type TEXT,
    entity_id UUID,
    metadata JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 9. SECURITY (RLS)
-- Enable RLS on All Tables
ALTER TABLE public.stores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.store_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.brands ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tax_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.composite_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_levels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.serial_numbers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_transfers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_transfer_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transaction_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;

-- 10. POLICIES (Open for Demo)
CREATE POLICY "Public Access" ON public.stores FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public Access" ON public.store_profiles FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public Access" ON public.stock_locations FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public Access" ON public.staff FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public Access" ON public.brands FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public Access" ON public.categories FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public Access" ON public.suppliers FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public Access" ON public.tax_profiles FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public Access" ON public.products FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public Access" ON public.composite_products FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public Access" ON public.stock_levels FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public Access" ON public.serial_numbers FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public Access" ON public.stock_ledger FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public Access" ON public.purchase_orders FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public Access" ON public.purchase_order_items FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public Access" ON public.inventory_transfers FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public Access" ON public.inventory_transfer_items FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public Access" ON public.customers FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public Access" ON public.transactions FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public Access" ON public.transaction_items FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public Access" ON public.customer_ledger FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public Access" ON public.activity_logs FOR ALL USING (true) WITH CHECK (true);

-- 11. REALTIME
ALTER PUBLICATION supabase_realtime ADD TABLE public.stores;
ALTER PUBLICATION supabase_realtime ADD TABLE public.products;
ALTER PUBLICATION supabase_realtime ADD TABLE public.stock_levels;
ALTER PUBLICATION supabase_realtime ADD TABLE public.transactions;
ALTER PUBLICATION supabase_realtime ADD TABLE public.purchase_orders;
ALTER PUBLICATION supabase_realtime ADD TABLE public.inventory_transfers;

-- 12. RPC Functions
CREATE OR REPLACE FUNCTION decrement_stock(p_id uuid, p_quantity integer)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  -- Decrement Shop Stock (Primary for POS)
  UPDATE public.products
  SET 
    stock_shop = stock_shop - p_quantity,
    stock_quantity = stock_quantity - p_quantity
  WHERE id = p_id;
END;
$$;

-- Receive stock into Warehouse logic (Advanced + Simple sync)
CREATE OR REPLACE FUNCTION receive_stock_warehouse(
    p_store_id UUID,
    p_product_id UUID, 
    p_location_id UUID,
    p_quantity INTEGER
)
RETURNS VOID AS $$
BEGIN
    -- 1. Update simple product stock (for legacy/simple views)
    UPDATE public.products
    SET stock_warehouse = COALESCE(stock_warehouse, 0) + p_quantity,
        stock_quantity = COALESCE(stock_quantity, 0) + p_quantity
    WHERE id = p_product_id;

    -- 2. Update advanced stock level (for Stock Management view)
    INSERT INTO public.stock_levels (store_id, product_id, location_id, quantity)
    VALUES (p_store_id, p_product_id, p_location_id, p_quantity)
    ON CONFLICT (product_id, location_id)
    DO UPDATE SET 
        quantity = public.stock_levels.quantity + EXCLUDED.quantity,
        updated_at = NOW();
END;
$$ LANGUAGE plpgsql;

-- Helper to ensure basic locations exist for a store
CREATE OR REPLACE FUNCTION ensure_default_locations(p_store_id UUID)
RETURNS TABLE (warehouse_id UUID, shop_id UUID) AS $$
DECLARE
    v_warehouse_id UUID;
    v_shop_id UUID;
BEGIN
    -- Ensure Warehouse
    SELECT id INTO v_warehouse_id FROM public.stock_locations 
    WHERE store_id = p_store_id AND location_type = 'WAREHOUSE' LIMIT 1;
    
    IF v_warehouse_id IS NULL THEN
        INSERT INTO public.stock_locations (store_id, name, location_type, allows_receiving, allows_sales)
        VALUES (p_store_id, 'Main Warehouse', 'WAREHOUSE', true, false)
        RETURNING id INTO v_warehouse_id;
    END IF;

    -- Ensure Shop Floor
    SELECT id INTO v_shop_id FROM public.stock_locations 
    WHERE store_id = p_store_id AND location_type = 'STORE' LIMIT 1;
    
    IF v_shop_id IS NULL THEN
        INSERT INTO public.stock_locations (store_id, name, location_type, allows_receiving, allows_sales)
        VALUES (p_store_id, 'Shop Floor', 'STORE', true, true)
        RETURNING id INTO v_shop_id;
    END IF;

    -- NEW: Backfill stock_levels for products that have stock in warehouse/shop
    -- but no row in stock_levels yet.
    
    -- Warehouse backfill
    INSERT INTO public.stock_levels (store_id, product_id, location_id, quantity)
    SELECT p_store_id, id, v_warehouse_id, COALESCE(stock_warehouse, 0)
    FROM public.products
    WHERE store_id = p_store_id AND stock_warehouse > 0
    ON CONFLICT (product_id, location_id) DO NOTHING;

    -- Shop Floor backfill
    INSERT INTO public.stock_levels (store_id, product_id, location_id, quantity)
    SELECT p_store_id, id, v_shop_id, COALESCE(stock_shop, 0)
    FROM public.products
    WHERE store_id = p_store_id AND stock_shop > 0
    ON CONFLICT (product_id, location_id) DO NOTHING;

    RETURN QUERY SELECT v_warehouse_id, v_shop_id;
END;
$$ LANGUAGE plpgsql;