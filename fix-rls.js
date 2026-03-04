import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://kdqnbxwhzuegmqwzcvlj.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtkcW5ieHdoenVlZ21xd3pjdmxqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAyMzE2MDgsImV4cCI6MjA4NTgwNzYwOH0.A76LF6h53BvgceN9DB_nOmtP6hyfDMi3YRQUEdyOti8'
);

// Test: can we insert into marketing_rules?
async function test() {
  const { data: stores } = await supabase.from('stores').select('id').limit(1);
  console.log('Stores test:', stores);
  
  const { data, error } = await supabase
    .from('marketing_rules')
    .insert({ store_id: stores[0].id, name: 'Test', trigger_days: 7, discount_percentage: 10, message_template: 'test', is_active: true, validity_days: 7 })
    .select().single();
  console.log('Insert result:', data, 'Error:', error?.message, error?.code);
}
test();
