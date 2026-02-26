-- Phase 5: FIFO / Batch Inventory Tracking Transition

-- 1. Create the stock_batches table
CREATE TABLE IF NOT EXISTS public.stock_batches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID REFERENCES public.stores(id) ON DELETE CASCADE,
    product_id UUID REFERENCES public.products(id) ON DELETE CASCADE,
    supplier_id UUID REFERENCES public.suppliers(id) ON DELETE SET NULL,
    po_id UUID REFERENCES public.purchase_orders(id) ON DELETE SET NULL,
    unit_cost NUMERIC(10, 2) NOT NULL DEFAULT 0,
    initial_quantity INTEGER NOT NULL DEFAULT 0,
    remaining_quantity INTEGER NOT NULL DEFAULT 0,
    received_date TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    expiry_date DATE,
    batch_number TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for fast FIFO queries (oldest remaining batch first)
CREATE INDEX IF NOT EXISTS idx_stock_batches_fifo ON public.stock_batches(product_id, received_date) WHERE remaining_quantity > 0;

-- 2. Due to the transition to the new stock_levels table in Phase 3,
-- migrating aggregate stock here requires joining against stock_levels.
-- We will migrate currently active stock_levels into batches.
INSERT INTO public.stock_batches (
    store_id, 
    product_id, 
    unit_cost, 
    initial_quantity, 
    remaining_quantity, 
    received_date, 
    batch_number
)
SELECT 
    p.store_id, 
    sl.product_id, 
    p.cost_price, 
    sl.quantity, 
    sl.quantity, 
    NOW(), 
    'INIT-MIGRATION'
FROM public.stock_levels sl
JOIN public.products p ON p.id = sl.product_id
WHERE sl.quantity > 0;

-- 3. Create FIFO Deduction RPC
-- This safely deducts stock from the oldest available batches first
CREATE OR REPLACE FUNCTION deduct_stock_fifo(p_product_id UUID, p_quantity INTEGER)
RETURNS VOID AS $$
DECLARE
    v_remaining INTEGER := p_quantity;
    v_batch RECORD;
BEGIN
    -- Handle Restocks (Negative Quantity)
    IF p_quantity < 0 THEN
        -- Insert a new "RETURN/RESTOCK" batch with the most recently known unit cost
        INSERT INTO public.stock_batches (
            store_id, product_id, unit_cost, initial_quantity, remaining_quantity, received_date, batch_number
        )
        SELECT 
            store_id, id, cost_price, ABS(p_quantity), ABS(p_quantity), NOW(), 'RETURN-RESTOCK'
        FROM public.products
        WHERE id = p_product_id;

        -- In Phase 3, stock is tracked in stock_levels, not on products.
        -- We will not attempt to update a legacy aggregate column.
        -- Instead, a real return would also insert into stock_levels/stock_ledger.
        RETURN;
    END IF;

    -- Handle Deductions (Positive Quantity)
    -- Loop through available batches ordered by oldest date
    FOR v_batch IN 
        SELECT id, remaining_quantity 
        FROM public.stock_batches
        WHERE product_id = p_product_id AND remaining_quantity > 0
        ORDER BY received_date ASC
        FOR UPDATE
    LOOP
        IF v_remaining <= 0 THEN
            EXIT;
        END IF;

        IF v_batch.remaining_quantity >= v_remaining THEN
            -- This batch can fulfill the rest of the requirement
            UPDATE public.stock_batches
            SET remaining_quantity = remaining_quantity - v_remaining
            WHERE id = v_batch.id;
            
            v_remaining := 0;
        ELSE
            -- Consume this entire batch and continue
            UPDATE public.stock_batches
            SET remaining_quantity = 0
            WHERE id = v_batch.id;
            
            v_remaining := v_remaining - v_batch.remaining_quantity;
        END IF;
    END LOOP;

    -- Note: We no longer update legacy stock variables on the 'products' table
    -- because Phase 3 migrated inventory tracking to the 'stock_levels' and 'stock_ledger' tables.
    
END;
$$ LANGUAGE plpgsql;
