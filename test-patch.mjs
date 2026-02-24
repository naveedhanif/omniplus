import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const envFile = fs.readFileSync(path.join(__dirname, 'src/environments/environment.ts'), 'utf8');
const urlMatch = envFile.match(/supabaseUrl:\s*['"]([^'"]+)['"]/);
const keyMatch = envFile.match(/supabaseKey:\s*['"]([^'"]+)['"]/);

async function run() {
    console.log("Fetching transfer:", '7174d6ac-c32b-473e-ba7a-5a7a76725c6f');
    const res = await fetch(`${urlMatch[1]}/rest/v1/stock_transfers?id=eq.7174d6ac-c32b-473e-ba7a-5a7a76725c6f`, {
        method: 'PATCH',
        headers: {
            'apikey': keyMatch[1],
            'Authorization': `Bearer ${keyMatch[1]}`,
            'Content-Type': 'application/json',
            'Prefer': 'return=representation'
        },
        body: JSON.stringify({
            status: 'APPROVED',
            approved_by: '00000000-0000-0000-0000-000000000000',
            approved_at: new Date().toISOString()
        })
    });
    const text = await res.text();
    console.log("Status:", res.status);
    console.log("Response:", text);
}
run().catch(console.error);
