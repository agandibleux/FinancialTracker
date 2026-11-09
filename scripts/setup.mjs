// npm run setup — writes .env.local (public identifiers only) and builds the app.
import fs from 'node:fs';
import readline from 'node:readline/promises';
import { execSync } from 'node:child_process';

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const cur = Object.fromEntries((fs.existsSync('.env.local') ? fs.readFileSync('.env.local', 'utf8') : '')
  .split('\n').map(l => l.split('=')).filter(p => p.length === 2));

console.log('\nFinancial Planner setup — both values are public identifiers, not secrets. Leave blank to keep/skip.\n');
const ask = async (label, key, hint) => {
  const a = (await rl.question(`${label}${cur[key] ? ` [${cur[key]}]` : ''}\n  ${hint}\n> `)).trim();
  return a || cur[key] || '';
};
const id = await ask('Google OAuth client ID', 'VITE_GOOGLE_CLIENT_ID', 'Open the app → Settings → Sync & data for the 7-step guide (ends in .apps.googleusercontent.com)');
const proxy = await ask('Quote proxy URL (optional, live ETF prices)', 'VITE_QUOTE_PROXY_URL', 'After: npx wrangler deploy worker/quotes.js --name planner-quotes');
rl.close();

fs.writeFileSync('.env.local', `VITE_GOOGLE_CLIENT_ID=${id}\nVITE_QUOTE_PROXY_URL=${proxy}\n`);
console.log('\nSaved .env.local. Building…\n');
execSync('npm run build', { stdio: 'inherit' });
console.log(`
Done. Next:
  1. Publish dist/ to a static host (one command, free):  npm run deploy
  2. Open the site on this computer → "This is my first device" → import data/finance-export.db
  3. Settings → Sync & data → choose a passphrase → Turn on Drive sync → Copy setup link
  4. Send the link to your iPhone, open in Safari → Share → Add to Home Screen
`);
