import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://kdqnbxwhzuegmqwzcvlj.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtkcW5ieHdoenVlZ21xd3pjdmxqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAyMzE2MDgsImV4cCI6MjA4NTgwNzYwOH0.A76LF6h53BvgceN9DB_nOmtP6hyfDMi3YRQUEdyOti8';
const supabase = createClient(supabaseUrl, supabaseKey);

async function checkAndFix() {
    const { data: stores } = await supabase.from('stores').select('id');
    const storeId = stores[0].id;
    
    let { data: customers } = await supabase.from('customers').select('*').eq('store_id', storeId);
    console.log("Found", customers.length, "customers in the store.");
    
    let changed = 0;
    
    // Grab the active rules to see how far back we need to set the purchase dates
    const { data: rules } = await supabase.from('marketing_rules').select('*').eq('store_id', storeId).eq('is_active', true);
    
    if (!rules || rules.length === 0) {
        console.log("NO ACTIVE RULES FOUND.");
        return;
    }
    
    console.log("Found Active Rules:", rules.map(r => r.name + ' (' + r.trigger_days + 'd)'));
    
    // Set customer 1 to trigger rule 1
    const d1 = new Date();
    d1.setDate(d1.getDate() - rules[0].trigger_days);
    
    await supabase.from('customers').update({ 
        last_purchase_date: d1.toISOString(),
        phone: '+1234567890' 
    }).eq('id', customers[0].id);
    
    console.log(`Set ${customers[0].full_name} to be inactive for ${rules[0].trigger_days} days. (Phone set so message goes through)`);
    
    // If we have a second rule and a second customer, set that too.
    if (rules.length > 1 && customers.length > 1) {
         const d2 = new Date();
         d2.setDate(d2.getDate() - rules[1].trigger_days);
         await supabase.from('customers').update({ 
              last_purchase_date: d2.toISOString(),
              phone: '+0987654321'
         }).eq('id', customers[1].id);
         console.log(`Set ${customers[1].full_name} to be inactive for ${rules[1].trigger_days} days. (Phone set so message goes through)`);
    } else if (customers.length > 1) {
         // Just set them to be inactive for rule 1 as well
         await supabase.from('customers').update({ 
              last_purchase_date: d1.toISOString(),
              phone: '+1111111111'
         }).eq('id', customers[1].id);
         console.log(`Set ${customers[1].full_name} to be inactive for ${rules[0].trigger_days} days. (Phone set so message goes through)`);
    }
}
checkAndFix();
