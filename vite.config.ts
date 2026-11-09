import { defineConfig, loadEnv } from 'vite';
import 'vitest/config';
import type { Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

/** Dev stand-in for functions/api/quotes.js */
const devQuotes = (): Plugin => ({
  name: 'dev-quotes',
  configureServer(server) {
    server.middlewares.use('/api/quotes', async (req, res) => {
      try {
        const u = new URL(req.url ?? '', 'http://x').searchParams.get('u') ?? '';
        const url = new URL(u);
        if (url.protocol !== 'https:' || !['query1.finance.yahoo.com', 'query2.finance.yahoo.com', 'global.morningstar.com'].includes(url.hostname)) { res.statusCode = 403; return res.end('Host not allowed'); }
        const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
        res.statusCode = r.status; res.setHeader('Content-Type', r.headers.get('content-type') ?? 'application/json');
        res.end(Buffer.from(await r.arrayBuffer()));
      } catch { res.statusCode = 400; res.end('Bad url'); }
    });
  },
});

/** Production only: fills the quote-proxy origin into the CSP connect-src. The dev server drops the CSP (HMR needs inline scripts). */
const cspProxy = (): Plugin => ({
  name: 'csp-proxy',
  transformIndexHtml: { order: 'pre', handler(html, ctx) {
    if (ctx.server) return html.replace(/\s*<meta http-equiv="Content-Security-Policy"[^>]*>/, '');
    const proxy = process.env.VITE_QUOTE_PROXY_URL || loadEnv('production', process.cwd(), 'VITE_').VITE_QUOTE_PROXY_URL;
    let origin = '';
    try { origin = proxy ? ' ' + new URL(proxy).origin : ''; } catch { /* ignore a bad URL */ }
    return html.replace('%CSP_PROXY%', origin);
  } },
});

export default defineConfig({
  base: './',
  plugins: [devQuotes(), cspProxy(), react(), tailwindcss()],
  server: { port: 5173, proxy: { '/api': 'http://localhost:3001' } },
  test: { environment: 'node' },
});
