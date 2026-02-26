-- Migration: Add credit_limit to customers table
-- Description: Adds credit_limit column to allow tracking customer debt capacity.

ALTER TABLE public.customers 
ADD COLUMN IF NOT EXISTS credit_limit NUMERIC(10,2) DEFAULT 0;
