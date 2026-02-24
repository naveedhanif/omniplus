import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const envFile = fs.readFileSync(path.join(__dirname, 'src/environments/environment.ts'), 'utf8');
const urlMatch = envFile.match(/supabaseUrl:\s*['"]([^'"]+)['"]/);
const keyMatch = envFile.match(/supabaseKey:\s*['"]([^'"]+)['"]/);

async function run() {
    const res = await fetch(`${urlMatch[1]}/rest/v1/?apikey=${keyMatch[1]}`);
    const spec = await res.json();
    
    console.log("stock_transfers columns:", Object.keys(spec.definitions['stock_transfers'].properties));
}
run().catch(console.error);
