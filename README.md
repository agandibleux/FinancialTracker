# Financial Planner

Local household finance tracker (CAD): monthly income/expenses, living cost, predicted vs actual savings,
wealth projection, ratio-based allocation and Jan 1 registered-account (TFSA/RRSP/FHSA) planning.

```
npm install
npm run seed   # optional sample data (use --force to reseed)
npm run dev    # API :3001 + web http://localhost:5173
npm test
```

Data lives in `data/finance.db` (SQLite, uses Node's built-in `node:sqlite`, Node 22.5+).
Import: Import page parses XLSX/CSV in the browser, you map columns, then commit.

## Private, multi-device setup (browser-only + encrypted Drive sync)

The app runs entirely in the browser (SQLite via WASM, stored in IndexedDB), so it works offline. `server/` is legacy (seed/import scripts only).

**Privacy:** data is encrypted in the browser with your passphrase before it goes to a hidden folder (`drive.appdata` scope) in your personal Google Drive.
The hosted website contains no data; Google, the host and the price proxy can't read it. An optional device passcode locks the app on each device.

**Setup (once):**
1. Google client ID — follow the in-app guide (Settings → Sync & data, or the first screen). Publish the consent screen "In production" (no review needed for `drive.appdata`).
2. `npm run setup` — asks for the client ID (and optional quote-proxy URL), writes `.env.local`, builds.
3. `npm run deploy` — publishes `dist/` to Cloudflare Pages (free; first run asks you to log in). Add the site's URL as an authorised JavaScript origin of the client.
4. Open the site → *This is my first device* → import your database (`sqlite3 data/finance.db ".backup data/finance-export.db"` first, so recent edits are included) → Settings → Sync & data → passphrase → *Turn on Drive sync*.
5. *Copy setup link* → send to your phone → Safari → Add to Home Screen → *I already set it up on another device* → passphrase.

Sync is two-way and automatic (push after edits, pull every minute / on focus, row-level merge if two devices diverged). Live prices need the optional proxy: `npx wrangler deploy worker/quotes.js --name planner-quotes --var ALLOWED_ORIGIN:https://your-site`.

## Accounts, landing page and hosting (multi-user, invite-only)

- Visitors see a landing page; **Sign in with Google** identifies them (`openid email profile`) and grants only the app's hidden Drive folder. Their data stays encrypted with their own passphrase, so you (the host) can't read anyone's finances. Local data is namespaced per Google account (`src/local/auth.ts`), so several people can share one browser.
- One shared Google client ID (yours) serves everyone: set `VITE_GOOGLE_CLIENT_ID` in the Pages build variables and publish the consent screen "In production".

**Deploy on GitHub Pages (free):**
1. `git add -A && git commit` and push to a GitHub repo. The `.gitignore` excludes `data/`, `.env*`, `*.db`, `*.tsv`; check `git ls-files | grep -iE "data/|\.db|\.env"` prints nothing first. GitHub Pages on a *private* repo needs a paid plan; a public repo is fine here because it holds code only (the client ID is a public identifier, not a secret).
2. Repo → Settings → Pages → Source: **GitHub Actions**. Settings → Secrets and variables → Actions → *Variables*: `VITE_GOOGLE_CLIENT_ID` (and optionally `VITE_QUOTE_PROXY_URL`). Every push to `main` runs tests, builds and deploys (`.github/workflows/deploy.yml`).
3. Google Cloud Console → your OAuth client → add `https://<user>.github.io` as an authorised JavaScript origin (origin only, no repo path).
4. Live prices: `npx wrangler deploy worker/quotes.js --name planner-quotes --var ALLOWED_ORIGIN:https://<user>.github.io`, then set its URL as `VITE_QUOTE_PROXY_URL`.

**Invite-only without a server:** keep the OAuth consent screen in *Testing* and list your family/friends under *Test users* (up to 100). Google then refuses sign-in for anyone else. Testing mode tokens expire after 7 days, which only means re-clicking Sign in. For open access, publish "In production" (`drive.appdata` needs no review).

**Security notes (static hosting):**
- The app uses `HashRouter` and relative URLs so it works under `/<repo>/`. GitHub Pages can't set response headers, so the CSP ships as a `<meta>` tag in `index.html` and a frame-busting check lives in `src/main.tsx`. `public/_headers` is only used if you host on Cloudflare/Netlify, where it adds HSTS and `frame-ancestors`.
- Pages always serves HTTPS; tick *Enforce HTTPS* in Settings → Pages.
- Data is encrypted in the browser with your passphrase (PBKDF2 600k + AES-GCM). Nothing sensitive is on the host, and a forgotten passphrase is unrecoverable.
- Host on a dedicated `github.io` origin: every site under one `user.github.io` shares localStorage/IndexedDB origin, so don't put other apps under the same account's Pages if they're untrusted.
- Enable branch protection on `main`, 2FA on GitHub, and Dependabot, since a compromised repo means compromised JS.
