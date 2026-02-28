import { createClient } from '@supabase/supabase-js';

const supabase = createClient('https://kdqnbxwhzuegmqwzcvlj.supabase.co', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtkcW5ieHdoenVlZ21xd3pjdmxqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAyMzE2MDgsImV4cCI6MjA4NTgwNzYwOH0.A76LF6h53BvgceN9DB_nOmtP6hyfDMi3YRQUEdyOti8');

async function run() {
    console.log('Migrating all existing products to have a frozen MAC in metadata...');

    const { data: products } = await supabase.from('products').select('id, cost_price, metadata');

    if (products) {
        let count = 0;
        for (const p of products) {
            if (!p.metadata || p.metadata.mac === undefined) {
                const newMeta = { ...(p.metadata || {}), mac: p.cost_price || 0 };
                await supabase.from('products').update({ metadata: newMeta }).eq('id', p.id);
                count++;
            }
        }
        console.log('Migrating MAC for ' + count + ' products.');
    } else {
        console.log('No products found or error');
    }
}
run();
