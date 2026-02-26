-- Migration: Add ORDERED status to Purchase Orders
-- Description: Updates the po_status_enum to include 'ORDERED' status.

ALTER TYPE public.po_status_enum ADD VALUE IF NOT EXISTS 'ORDERED' AFTER 'SENT';
