require('dotenv').config({ path: './src/environments/.env' }); // or wherever env vars are if needed

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Extract url and key from environment config if possible, else hardcode for local dev
const supabaseUrl = process.env.SUPABASE_URL || 'http://127.0.0.1:54321'; // Default local supabase
const supabaseKey = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...';

// Since the user is likely running the local supabase CLI, let's just use the known default service key or anon key
// For this script, we'll try to read it from the environment.ts file
const envFile = fs.readFileSync(path.join(__dirname, 'src/environments/environment.ts'), 'utf8');

const urlMatch = envFile.match(/supabaseUrl:\s*['"]([^'"]+)['"]/);
const keyMatch = envFile.match(/supabaseKey:\s*['"]([^'"]+)['"]/);

if (!urlMatch || !keyMatch) {
    console.error("Could not find Supabase credentials in environment.ts");
    process.exit(1);
}

const supabase = createClient(urlMatch[1], keyMatch[1]);

async function clearStockData() {
    console.log("Clearing stock management data...");

    // 1. Delete Transfers (and items via cascade or manually)
    console.log("Deleting transfer items...");
    await supabase.from('stock_transfer_items').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    console.log("Deleting transfers...");
    await supabase.from('stock_transfers').delete().neq('id', '00000000-0000-0000-0000-000000000000');

    // 2. Delete Stock Movements / Ledger
    console.log("Deleting stock ledger/movements...");
    await supabase.from('stock_ledger').delete().neq('id', '00000000-0000-0000-0000-000000000000');

    // 3. Delete Stock Levels
    console.log("Deleting stock levels...");
    await supabase.from('stock_levels').delete().neq('product_id', '00000000-0000-0000-0000-000000000000');

    // 4. Optionally, clear the basic locations (we will keep them so the UI doesn't break)
    // await supabase.from('stock_locations').delete().neq('id', '...');

    console.log("Stock management data cleared successfully!");
}

clearStockData().catch(console.error);
