const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

async function run() {
    const { data, error } = await supabase.from('purchase_orders').select('*');
    console.log('Purchase Orders:', data);
    if(error) console.error(error);
}
run();
