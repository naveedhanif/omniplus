
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Extract config from environment.ts
const envFile = fs.readFileSync(path.join(__dirname, 'src/environments/environment.ts'), 'utf8');
const urlMatch = envFile.match(/supabaseUrl:\s*['"](.*)['"]/);
const keyMatch = envFile.match(/supabaseKey:\s*['"](.*)['"]/);

if (!urlMatch || !keyMatch) {
    console.error('Could not find Supabase credentials in environment.ts');
    process.exit(1);
}

const supabaseUrl = urlMatch[1];
const supabaseKey = keyMatch[1];

const supabase = createClient(supabaseUrl, supabaseKey);

const logFile = path.join(__dirname, 'db_check_results.log');
const logStream = fs.createWriteStream(logFile);

function log(msg, data) {
    console.log(msg, data || '');
    logStream.write(msg + '\n');
    if (data) logStream.write(JSON.stringify(data, null, 2) + '\n');
}

async function checkData() {
    log('--- START CHECK ---');

    const { data: stores } = await supabase.from('stores').select('id, name');
    log('STORES', stores);

    for (const store of stores) {
        log(`\nProcessing Store: ${store.name} (${store.id})`);

        // 1. Ensure Warehouse
        const { data: wh } = await supabase.from('stock_locations').select('id').eq('store_id', store.id).eq('location_type', 'WAREHOUSE').limit(1);
        let whId = wh && wh.length > 0 ? wh[0].id : null;
        if (!whId) {
            log('Creating Warehouse...');
            const { data: nwh } = await supabase.from('stock_locations').insert({ store_id: store.id, name: 'Main Warehouse', location_type: 'WAREHOUSE' }).select().single();
            whId = nwh.id;
        }

        // 2. Ensure Shop
        const { data: sf } = await supabase.from('stock_locations').select('id').eq('store_id', store.id).eq('location_type', 'STORE').limit(1);
        let sfId = sf && sf.length > 0 ? sf[0].id : null;
        if (!sfId) {
            log('Creating Shop...');
            const { data: nsf } = await supabase.from('stock_locations').insert({ store_id: store.id, name: 'Shop Floor', location_type: 'STORE' }).select().single();
            sfId = nsf.id;
        }

        // 3. Backfill
        const { data: products } = await supabase.from('products').select('*').eq('store_id', store.id);
        log(`Backfilling ${products.length} products...`);
        for (const prod of products) {
            if (prod.stock_warehouse > 0) {
                await supabase.from('stock_levels').upsert({ store_id: store.id, product_id: prod.id, location_id: whId, quantity: prod.stock_warehouse }, { onConflict: 'product_id,location_id' });
            }
            if (prod.stock_shop > 0) {
                await supabase.from('stock_levels').upsert({ store_id: store.id, product_id: prod.id, location_id: sfId, quantity: prod.stock_shop }, { onConflict: 'product_id,location_id' });
            }
        }
    }

    const { data: locations } = await supabase.from('stock_locations').select('id, name, location_type, store_id');
    log('LOCATIONS', locations);

    const { data: products } = await supabase.from('products').select('id, name, stock_shop, stock_warehouse, stock_quantity, store_id');
    log('PRODUCTS', products);

    const { data: levels, error: levelsErr } = await supabase.from('stock_levels').select('*');
    if (levelsErr) log('Levels Fetch Error:', levelsErr);
    log('STOCK LEVELS', levels);
    if (!levels || levels.length === 0) {
        log('No stock levels found.');
    }

    // Check ledger
    const { data: ledger } = await supabase.from('stock_ledger').select('id, movement_type, product_id, location_id, quantity').limit(5);
    log('STOCK LEDGER (Last 5)', ledger);

    log('--- END CHECK ---');
    logStream.end();
}

checkData();
