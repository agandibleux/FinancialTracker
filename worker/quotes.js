/**
 * Stateless quote proxy for Cloudflare Workers (free tier). It stores nothing and only forwards
 * GET requests for public market-data URLs, adding CORS headers so the browser app can read them.
 *
 * Deploy:  npx wrangler deploy worker/quotes.js --name planner-quotes --compatibility-date 2025-01-01
 * Then put the printed https://planner-quotes.<you>.workers.dev URL in the app (Settings → Sync & data).
 * Lock it to your site: npx wrangler deploy ... --var ALLOWED_ORIGIN:https://your-site.pages.dev (default: any origin).
 */
const ALLOWED_HOSTS = new Set(['query1.finance.yahoo.com', 'query2.finance.yahoo.com', 'global.morningstar.com']);


export default {
  async fetch(request, env) {
    const cors = { 'Access-Control-Allow-Origin': env?.ALLOWED_ORIGIN || '*', 'Access-Control-Allow-Methods': 'GET, OPTIONS', 'Vary': 'Origin' };
    if (request.method === 'OPTIONS') return new Response(null, { headers: cors });
    if (request.method !== 'GET') return new Response('Method not allowed', { status: 405, headers: cors });
    const target = new URL(request.url).searchParams.get('u');
    let url;
    try { url = new URL(target); } catch { return new Response('Bad url', { status: 400, headers: cors }); }
    if (url.protocol !== 'https:' || !ALLOWED_HOSTS.has(url.hostname)) return new Response('Host not allowed', { status: 403, headers: cors });
    const upstream = await fetch(url.toString(), { headers: { 'User-Agent': 'Mozilla/5.0' }, cf: { cacheTtl: 60 } });
    return new Response(upstream.body, {
      status: upstream.status,
      headers: { ...cors, 'Content-Type': upstream.headers.get('Content-Type') ?? 'application/json', 'Cache-Control': 'public, max-age=60' },
    });
  },
};
