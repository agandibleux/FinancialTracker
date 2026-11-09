# Deploying Financial Planner on GitHub Pages

About 20 minutes, no cost. You need a GitHub account and a Google account.

## 1. Create the Google sign-in (OAuth client)

1. Go to <https://console.cloud.google.com> and create a project (e.g. `financial-planner`).
2. **APIs & Services → Library** → search **Google Drive API** → **Enable**.
3. **APIs & Services → OAuth consent screen** (or *Google Auth Platform*):
   - User type: **External**. App name: `Financial Planner`. Add your email as support and developer contact.
   - Scopes: add `openid`, `email`, `profile` and `.../auth/drive.appdata`.
   - Publishing status: leave on **Testing**.
   - **Test users**: add your Gmail and the Gmail of everyone you want to invite (max 100). Anyone else is refused by Google at sign-in. This is your invite list.
4. **Credentials → Create credentials → OAuth client ID**:
   - Type: **Web application**.
   - Authorised JavaScript origins: `https://YOUR-USERNAME.github.io` (origin only, no repo name, no trailing slash). Add `http://localhost:5173` too if you want to develop locally.
   - Leave redirect URIs empty.
5. Copy the **Client ID** (ends in `.apps.googleusercontent.com`). It is a public identifier, not a secret.

## 2. Push the code to GitHub

1. Create a new repository on GitHub. Pages on a private repo needs a paid plan, so use **Public**. It only holds code, never your data.
2. Before the first commit, check no personal data is tracked. This must print nothing:

   ```bash
   git add -A
   git ls-files | grep -iE "data/|\.db|\.env|\.tsv"
   ```

3. Commit and push:

   ```bash
   git commit -m "Initial commit"
   git branch -M main
   git remote add origin https://github.com/YOUR-USERNAME/YOUR-REPO.git
   git push -u origin main
   ```

   The first push may show a failed workflow run. That is expected until step 3.

## 3. Turn on GitHub Pages

1. Repo → **Settings → Pages** → **Source: GitHub Actions**.
2. Repo → **Settings → Secrets and variables → Actions → Variables** tab → **New repository variable**:
   - Name `VITE_GOOGLE_CLIENT_ID`, value: your Client ID from step 1.
   - Optional: `VITE_QUOTE_PROXY_URL` for live prices (see step 5).
3. Repo → **Actions** → open the *Deploy to GitHub Pages* run → **Re-run all jobs**.
4. When it is green, your site is at `https://YOUR-USERNAME.github.io/YOUR-REPO/`.
5. Back in **Settings → Pages**, tick **Enforce HTTPS**.

Every later push to `main` redeploys automatically.

## 4. First use

1. Open your site and click **Sign in with Google**. Google shows a "not verified" warning in Testing mode: **Advanced → Continue**.
2. Choose **This is my first device**, import your database if you have one, then set a **passphrase**.
3. Settings → Sync & data → **Turn on Drive sync**.
4. Other devices: sign in with the same Google account, choose *I already set it up on another device*, enter the passphrase.

> **Write the passphrase down.** Your data is encrypted with it in your browser. If you forget it, nobody (including you and Google) can recover the data.

## 5. Optional: live prices

Browsers can't call Yahoo or Morningstar directly, so a tiny free proxy is needed:

```bash
npx wrangler deploy worker/quotes.js --name planner-quotes \
  --compatibility-date 2025-01-01 --var ALLOWED_ORIGIN:https://YOUR-USERNAME.github.io
```

Copy the printed `https://planner-quotes.….workers.dev` URL into the `VITE_QUOTE_PROXY_URL` variable (step 3.2) and re-run the workflow. Without it the app works fine, just without automatic prices.

## 6. Security checklist

- [ ] GitHub account has **2FA** enabled.
- [ ] Settings → Branches: protect `main` (require pull request).
- [ ] Settings → Code security: enable **Dependabot alerts**.
- [ ] OAuth consent screen is in **Testing** with only people you trust as test users.
- [ ] `git ls-files | grep -iE "data/|\.db|\.env|\.tsv"` prints nothing.
- [ ] **Enforce HTTPS** is ticked.
- [ ] Don't host other untrusted apps on the same `github.io` account, because they share the browser origin and its storage.

## Troubleshooting

| Problem | Fix |
|---|---|
| `Error 400: origin_mismatch` on sign-in | The origin in step 1.4 must be exactly `https://YOUR-USERNAME.github.io`. Changes can take a few minutes. |
| `Access blocked: app has not completed verification` / 403 | Your Gmail isn't in **Test users**. |
| Sign-in popup does nothing | Allow popups for the site. Make sure `VITE_GOOGLE_CLIENT_ID` is set, then re-run the workflow. |
| Blank page or 404 after deploy | Pages source must be **GitHub Actions** (step 3.1). Check the Actions run is green. |
| Old version still showing | Hard refresh. The service worker updates on the next load. |
| Prices don't load | Step 5 not done, or `ALLOWED_ORIGIN` doesn't match your site origin. |
| Asked to sign in again after about 7 days | Normal in Testing mode. Publishing "In production" removes this (`drive.appdata` needs no review), but then anyone can sign in. |
