import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const envFile = fs.readFileSync(path.join(__dirname, 'src/environments/environment.ts'), 'utf8');
const urlMatch = envFile.match(/supabaseUrl:\s*['"]([^'"]+)['"]/);
const keyMatch = envFile.match(/supabaseKey:\s*['"]([^'"]+)['"]/);
const supabase = createClient(urlMatch[1], keyMatch[1]);

async function run() {
    console.log("Fetching transfers limit 3...");
    const { data: transfers, error: getErr } = await supabase.from('stock_transfers').select('*').limit(3);
    if (getErr) console.error("GET ERROR:", getErr);
    console.log("Existing transfers:", JSON.stringify(transfers, null, 2));
    
    if (transfers && transfers.length > 0) {
        console.log("Updating", transfers[0].id);
        const { data, error } = await supabase
            .from('stock_transfers')
            .update({ status: 'APPROVED' })
            .eq('id', transfers[0].id)
            .select();
        console.log("Update result:", JSON.stringify({ data, error }, null, 2));
    }
}
run().catch(console.error);
