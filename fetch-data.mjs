import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const envFile = fs.readFileSync(path.join(__dirname, 'src/environments/environment.ts'), 'utf8');
const urlMatch = envFile.match(/supabaseUrl:\s*['"]([^'"]+)['"]/);
const keyMatch = envFile.match(/supabaseKey:\s*['"]([^'"]+)['"]/);

async function run() {
    const res = await fetch(`${urlMatch[1]}/rest/v1/stock_transfers?select=*`, {
        headers: {
            'apikey': keyMatch[1],
            'Authorization': `Bearer ${keyMatch[1]}`
        }
    });
    const text = await res.text();
    console.log("Transfers:", text);
}
run().catch(console.error);
