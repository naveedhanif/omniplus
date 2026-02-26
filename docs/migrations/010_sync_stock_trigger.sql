-- Migration: Secure Materialized View and Fix Valuation
-- Date: 2026-02-26

-- 1. Ensure any old table/view is gone (Handles the "is not a materialized view" error)
DROP TABLE IF EXISTS public.stock_levels CASCADE;
DROP MATERIALIZED VIEW IF EXISTS public.stock_levels CASCADE;

-- 2. Create the Materialized View with fix for Transfers (using quantity_change)
CREATE MATERIALIZED VIEW public.stock_levels AS
SELECT 
    sl.product_id,
    sl.location_id,
    
    SUM(CASE 
        WHEN sl.reason NOT IN ('RESERVATION', 'DAMAGE_WRITE_OFF') 
        THEN sl.quantity_change 
        ELSE 0 
    END) AS available_quantity,
    
    SUM(CASE 
        WHEN sl.reason = 'RESERVATION' 
        THEN ABS(sl.quantity_change) 
        ELSE 0 
    END) AS reserved_quantity,
    
    SUM(CASE 
        WHEN sl.reason = 'DAMAGE_WRITE_OFF' 
        THEN ABS(sl.quantity_change) 
        ELSE 0 
    END) AS damaged_quantity,
    
    SUM(CASE 
        WHEN sl.reason NOT IN ('RESERVATION') 
        THEN sl.quantity_change 
        ELSE 0 
    END) AS physical_quantity,
    
    SUM(sl.quantity_change * COALESCE(p.cost_price, 0)) AS stock_value,
    
    MAX(sl.created_at) AS last_movement_at
    
FROM public.stock_ledger sl
JOIN public.products p ON sl.product_id = p.id
GROUP BY sl.product_id, sl.location_id;

-- 3. Restore Indexes
CREATE UNIQUE INDEX idx_stock_levels_unique ON public.stock_levels(product_id, location_id);
CREATE INDEX idx_stock_levels_product ON public.stock_levels(product_id);

-- 4. Initial Refresh
REFRESH MATERIALIZED VIEW public.stock_levels;



