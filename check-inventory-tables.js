import { createClient } from '@supabase/supabase-js';
const supabase = createClient(
  'https://kdqnbxwhzuegmqwzcvlj.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtkcW5ieHdoenVlZ21xd3pjdmxqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAyMzE2MDgsImV4cCI6MjA4NTgwNzYwOH0.A76LF6h53BvgceN9DB_nOmtP6hyfDMi3YRQUEdyOti8'
);
async function check() {
  const tables = ['purchase_orders', 'purchase_order_items', 'suppliers', 'stock_movements', 'inventory_transfers'];
  for (const t of tables) {
    const { data, error } = await supabase.from(t).select('*').limit(2);
    console.log(`\n=== ${t} ===`);
    if (error) console.log('ERROR:', error.message);
    else console.log('Sample:', JSON.stringify(data?.slice(0,1), null, 2));
  }
}
check();
