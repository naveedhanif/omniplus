-- Create the app_users table for Authentication
CREATE TABLE IF NOT EXISTS public.app_users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID REFERENCES public.stores(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    email TEXT UNIQUE,
    password_hash TEXT, -- Storing passwords (in a real app this would be hashed)
    pin_code TEXT, -- 4-digit or 6-digit pin for quick POS login
    role TEXT NOT NULL CHECK (role IN ('ADMIN', 'MANAGER', 'CASHIER')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.app_users ENABLE ROW LEVEL SECURITY;

-- Allow read access
CREATE POLICY "Users can view their own store users" 
ON public.app_users FOR SELECT 
USING (store_id = (SELECT id FROM public.stores LIMIT 1));

-- Allow insert/update (For admin purposes)
CREATE POLICY "Admins can manage users" 
ON public.app_users FOR ALL 
USING (true);

-- Insert Default Admin and Cashier for demo purposes
INSERT INTO public.app_users (store_id, name, email, password_hash, pin_code, role)
SELECT 
    id as store_id, 
    'System Admin' as name, 
    'admin@omniplus.com' as email, 
    'password123' as password_hash, 
    '9999' as pin_code, 
    'ADMIN' as role
FROM public.stores 
LIMIT 1;

INSERT INTO public.app_users (store_id, name, pin_code, role)
SELECT 
    id as store_id, 
    'Front Desk Till 1' as name, 
    '1234' as pin_code, 
    'CASHIER' as role
FROM public.stores 
LIMIT 1;
