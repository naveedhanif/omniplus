-- Migration Script: Pre-load HVAC Smart Templates
-- Description: Creates HVAC categories and defines their specific technical attribute fields.

BEGIN;

-- 1. Helper variable to get the current store
DO $$ 
DECLARE 
    v_store_id UUID;
    v_spare_parts_id UUID;
    v_compressor_id UUID;
    v_gas_id UUID;
    v_capacitor_id UUID;
BEGIN
    -- Get the first available store
    SELECT id INTO v_store_id FROM public.stores LIMIT 1;
    
    IF v_store_id IS NULL THEN
        RAISE NOTICE 'No store found. Please create a store first.';
        RETURN;
    END IF;

    -- 2. Create Master Categories (Robust Insert)
    
    -- Parent: AC Spare Parts
    SELECT id INTO v_spare_parts_id FROM public.categories WHERE store_id = v_store_id AND name = 'AC Spare Parts';
    IF v_spare_parts_id IS NULL THEN
        INSERT INTO public.categories (store_id, name, color)
        VALUES (v_store_id, 'AC Spare Parts', '#3b82f6')
        RETURNING id INTO v_spare_parts_id;
    END IF;

    -- Child: Compressors
    SELECT id INTO v_compressor_id FROM public.categories WHERE store_id = v_store_id AND name = 'Compressors';
    IF v_compressor_id IS NULL THEN
        INSERT INTO public.categories (store_id, name, parent_id, color)
        VALUES (v_store_id, 'Compressors', v_spare_parts_id, '#ef4444')
        RETURNING id INTO v_compressor_id;
    END IF;

    -- Child: Refrigerant Gas
    SELECT id INTO v_gas_id FROM public.categories WHERE store_id = v_store_id AND name = 'Refrigerant Gas';
    IF v_gas_id IS NULL THEN
        INSERT INTO public.categories (store_id, name, parent_id, color)
        VALUES (v_store_id, 'Refrigerant Gas', v_spare_parts_id, '#10b981')
        RETURNING id INTO v_gas_id;
    END IF;

    -- Child: Capacitors
    SELECT id INTO v_capacitor_id FROM public.categories WHERE store_id = v_store_id AND name = 'Capacitors';
    IF v_capacitor_id IS NULL THEN
        INSERT INTO public.categories (store_id, name, parent_id, color)
        VALUES (v_store_id, 'Capacitors', v_spare_parts_id, '#f59e0b')
        RETURNING id INTO v_capacitor_id;
    END IF;


    -- 3. Define Smart Attributes for COMPRESSORS
    -- Check before insert to avoid conflicts
    IF NOT EXISTS (SELECT 1 FROM public.attribute_definitions WHERE category_id = v_compressor_id AND json_key = 'horsepower_hp') THEN
        INSERT INTO public.attribute_definitions (store_id, category_id, name, json_key, data_type, is_required)
        VALUES 
        (v_store_id, v_compressor_id, 'Horsepower (HP)', 'horsepower_hp', 'NUMBER', true),
        (v_store_id, v_compressor_id, 'Electrical Phase', 'electrical_phase', 'STRING', false),
        (v_store_id, v_compressor_id, 'Cooling Capacity (BTU)', 'btu_rating', 'NUMBER', false),
        (v_store_id, v_compressor_id, 'Compressor Type', 'compressor_type', 'STRING', false);
    END IF;

    -- 4. Define Smart Attributes for REFRIGERANT GAS
    IF NOT EXISTS (SELECT 1 FROM public.attribute_definitions WHERE category_id = v_gas_id AND json_key = 'gas_type') THEN
        INSERT INTO public.attribute_definitions (store_id, category_id, name, json_key, data_type, is_required)
        VALUES 
        (v_store_id, v_gas_id, 'Gas Type (R32, R410A, etc)', 'gas_type', 'STRING', true),
        (v_store_id, v_gas_id, 'Cylinder Weight (KG)', 'cylinder_weight_kg', 'NUMBER', true),
        (v_store_id, v_gas_id, 'Purity Percentage (%)', 'purity_percentage', 'NUMBER', false),
        (v_store_id, v_gas_id, 'Cylinder Type (Disposable/Refillable)', 'cylinder_type', 'STRING', false);
    END IF;

    -- 5. Define Smart Attributes for CAPACITORS
    IF NOT EXISTS (SELECT 1 FROM public.attribute_definitions WHERE category_id = v_capacitor_id AND json_key = 'uf_rating') THEN
        INSERT INTO public.attribute_definitions (store_id, category_id, name, json_key, data_type, is_required)
        VALUES 
        (v_store_id, v_capacitor_id, 'Capacitance (uF)', 'uf_rating', 'NUMBER', true),
        (v_store_id, v_capacitor_id, 'Voltage Rating (V)', 'voltage_rating', 'NUMBER', true);
    END IF;

END $$;

COMMIT;
