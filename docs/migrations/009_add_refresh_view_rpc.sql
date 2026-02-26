-- Migration: Add Materialized View Refresh RPC
-- Date: 2026-02-12

CREATE OR REPLACE FUNCTION public.refresh_materialized_view(view_name TEXT)
RETURNS VOID AS $$
BEGIN
    EXECUTE 'REFRESH MATERIALIZED VIEW ' || quote_ident(view_name);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
