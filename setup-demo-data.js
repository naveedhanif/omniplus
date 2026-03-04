import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://kdqnbxwhzuegmqwzcvlj.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtkcW5ieHdoenVlZ21xd3pjdmxqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAyMzE2MDgsImV4cCI6MjA4NTgwNzYwOH0.A76LF6h53BvgceN9DB_nOmtP6hyfDMi3YRQUEdyOti8'
);

async function setup() {
  // Set Tanveer's last_purchase_date to 15 days ago so they show as inactive
  const fifteenDaysAgo = new Date();
  fifteenDaysAgo.setDate(fifteenDaysAgo.getDate() - 15);

  const { error } = await supabase
    .from('customers')
    .update({ last_purchase_date: fifteenDaysAgo.toISOString() })
    .eq('full_name', 'Tanveer');

  if (error) {
    console.log('Error updating customer:', error.message);
  } else {
    console.log(`✅ Set Tanveer's last_purchase_date to ${fifteenDaysAgo.toDateString()} (15 days ago)`);
  }

  // Verify
  const { data: custs } = await supabase.from('customers').select('full_name, phone, last_purchase_date');
  console.log('Customers now:', JSON.stringify(custs, null, 2));
}

setup();
