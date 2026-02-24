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

    const ledgerDefinition = spec.definitions['stock_ledger'];
    console.log("stock_ledger schema:");
    console.log(JSON.stringify(ledgerDefinition, null, 2));
}
run().catch(console.error);
