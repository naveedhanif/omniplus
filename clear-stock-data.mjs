import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Read environments.ts for url and key
const envFile = fs.readFileSync(path.join(__dirname, 'src/environments/environment.ts'), 'utf8');

const urlMatch = envFile.match(/supabaseUrl:\s*['"]([^'"]+)['"]/);
const keyMatch = envFile.match(/supabaseKey:\s*['"]([^'"]+)['"]/);

if (!urlMatch || !keyMatch) {
    console.error("Could not find Supabase credentials in environment.ts");
    process.exit(1);
}

const supabaseUrl = urlMatch[1];
const supabaseKey = keyMatch[1];
console.log('Connecting to:', supabaseUrl);

const supabase = createClient(supabaseUrl, supabaseKey);

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

    console.log("Stock management data cleared successfully!");
}

clearStockData().catch(console.error);
