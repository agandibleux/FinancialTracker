/**
 * Cloudflare Pages Function: same-origin, stateless quote proxy (served at /api/quotes on your site, deployed with the site).
 * Only forwards GET requests for public market-data hosts, never follows redirects, and caps the response size.
 * With Cloudflare Access in front of the site, only signed-in invitees can reach it; Sec-Fetch-Site also rejects cross-site use.
 */
const ALLOWED_HOSTS = new Set(['query1.finance.yahoo.com', 'query2.finance.yahoo.com', 'global.morningstar.com']);
const MAX_BYTES = 2_000_000;

export async function onRequestGet({ request }) {
  const site = request.headers.get('Sec-Fetch-Site');
  if (site && site !== 'same-origin') return new Response('Forbidden', { status: 403 });
  let url;
  try { url = new URL(new URL(request.url).searchParams.get('u')); } catch { return new Response('Bad url', { status: 400 }); }
  if (url.protocol !== 'https:' || url.username || url.password || url.port || !ALLOWED_HOSTS.has(url.hostname)) return new Response('Host not allowed', { status: 403 });
  const upstream = await fetch(url.toString(), { headers: { 'User-Agent': 'Mozilla/5.0' }, redirect: 'manual', cf: { cacheTtl: 60 } });
  if (upstream.status >= 300 && upstream.status < 400) return new Response('Redirect blocked', { status: 502 });
  const body = await upstream.arrayBuffer();
  if (body.byteLength > MAX_BYTES) return new Response('Too large', { status: 502 });
  return new Response(body, {
    status: upstream.status,
    headers: { 'Content-Type': upstream.headers.get('Content-Type') ?? 'application/json', 'Cache-Control': 'private, max-age=60', 'X-Content-Type-Options': 'nosniff' },
  });
}
