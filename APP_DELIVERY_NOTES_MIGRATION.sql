-- Phase 7: Delivery Notes & B2B Dispatch Engine
-- Run this in your Supabase SQL Editor

-- 1. Create the Delivery Notes Table
-- The physical movement document proving goods left stock and arrived at the customer.
CREATE TABLE IF NOT EXISTS public.delivery_notes (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
    customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL,
    note_number VARCHAR(50) NOT NULL UNIQUE,
    status VARCHAR(20) NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'DISPATCHED', 'DELIVERED', 'PARTIAL_REJECTED', 'CANCELLED')),
    driver_name VARCHAR(100),
    driver_phone VARCHAR(50),
    recipient_name VARCHAR(100),
    recipient_signature_url TEXT, -- Base64 or URL to signed Proof of Delivery (e-POD)
    notes TEXT,
    dispatched_at TIMESTAMPTZ,
    delivered_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Create the Delivery Note Items Table
-- The individual lines on the delivery note. Financial pricing is intentionally excluded.
CREATE TABLE IF NOT EXISTS public.delivery_note_items (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    delivery_note_id UUID NOT NULL REFERENCES public.delivery_notes(id) ON DELETE CASCADE,
    product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
    quantity_shipped NUMERIC(10, 2) NOT NULL DEFAULT 0,
    quantity_accepted NUMERIC(10, 2) NOT NULL DEFAULT 0,
    quantity_rejected NUMERIC(10, 2) NOT NULL DEFAULT 0,
    rejection_reason TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Link Delivery Notes to Financial Transactions (Invoices)
-- Add an optional foreign key linking the financial invoice (transaction) back to the physical delivery note that generated it.
ALTER TABLE public.transactions 
ADD COLUMN IF NOT EXISTS delivery_note_id UUID REFERENCES public.delivery_notes(id) ON DELETE SET NULL;

-- 4. Set up Row Level Security (RLS) policies
ALTER TABLE public.delivery_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_note_items ENABLE ROW LEVEL SECURITY;

-- Delivery Notes Policies
CREATE POLICY "Users can view delivery notes for their assigned stores"
    ON public.delivery_notes FOR SELECT
    USING (store_id IN (
        SELECT store_id FROM public.staff WHERE id = auth.uid()
        UNION
        SELECT store_id FROM public.store_profiles WHERE id = auth.uid()
    ));

CREATE POLICY "Users can insert delivery notes for their assigned stores"
    ON public.delivery_notes FOR INSERT
    WITH CHECK (store_id IN (
        SELECT store_id FROM public.staff WHERE id = auth.uid()
        UNION
        SELECT store_id FROM public.store_profiles WHERE id = auth.uid()
    ));

CREATE POLICY "Users can update delivery notes for their assigned stores"
    ON public.delivery_notes FOR UPDATE
    USING (store_id IN (
        SELECT store_id FROM public.staff WHERE id = auth.uid()
        UNION
        SELECT store_id FROM public.store_profiles WHERE id = auth.uid()
    ));

CREATE POLICY "Users can delete delivery notes for their assigned stores"
    ON public.delivery_notes FOR DELETE
    USING (store_id IN (
        SELECT store_id FROM public.staff WHERE id = auth.uid()
        UNION
        SELECT store_id FROM public.store_profiles WHERE id = auth.uid()
    ));

-- Delivery Note Items Policies
CREATE POLICY "Users can view delivery note items via delivery notes"
    ON public.delivery_note_items FOR SELECT
    USING (delivery_note_id IN (
        SELECT id FROM public.delivery_notes WHERE store_id IN (
             SELECT store_id FROM public.staff WHERE id = auth.uid()
             UNION
             SELECT store_id FROM public.store_profiles WHERE id = auth.uid()
        )
    ));

CREATE POLICY "Users can insert delivery note items via delivery notes"
    ON public.delivery_note_items FOR INSERT
    WITH CHECK (delivery_note_id IN (
        SELECT id FROM public.delivery_notes WHERE store_id IN (
             SELECT store_id FROM public.staff WHERE id = auth.uid()
             UNION
             SELECT store_id FROM public.store_profiles WHERE id = auth.uid()
        )
    ));

CREATE POLICY "Users can update delivery note items via delivery notes"
    ON public.delivery_note_items FOR UPDATE
    USING (delivery_note_id IN (
        SELECT id FROM public.delivery_notes WHERE store_id IN (
             SELECT store_id FROM public.staff WHERE id = auth.uid()
             UNION
             SELECT store_id FROM public.store_profiles WHERE id = auth.uid()
        )
    ));

CREATE POLICY "Users can delete delivery note items via delivery notes"
    ON public.delivery_note_items FOR DELETE
    USING (delivery_note_id IN (
        SELECT id FROM public.delivery_notes WHERE store_id IN (
             SELECT store_id FROM public.staff WHERE id = auth.uid()
             UNION
             SELECT store_id FROM public.store_profiles WHERE id = auth.uid()
        )
    ));
