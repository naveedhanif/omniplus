import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://kdqnbxwhzuegmqwzcvlj.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtkcW5ieHdoenVlZ21xd3pjdmxqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAyMzE2MDgsImV4cCI6MjA4NTgwNzYwOH0.A76LF6h53BvgceN9DB_nOmtP6hyfDMi3YRQUEdyOti8'
);

async function check() {
  // Check what tables exist
  const { data: rules, error: rulesError } = await supabase.from('marketing_rules').select('*').limit(5);
  console.log('marketing_rules:', rules, '| error:', rulesError?.message);
  
  const { data: promotions, error: promoError } = await supabase.from('promotions').select('*').limit(5);
  console.log('promotions table:', promotions, '| error:', promoError?.message);

  const { data: customers, error: custError } = await supabase.from('customers').select('id, full_name, phone, last_purchase_date').limit(5);
  console.log('customers:', JSON.stringify(customers, null, 2), '| error:', custError?.message);
}

check();
