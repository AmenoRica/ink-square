declare const Deno: {
  env: { get(name: string): string | undefined };
  serve(handler: (request: Request) => Response | Promise<Response>): void;
};

const allowedOrigins = new Set(['https://amenorica.github.io']);

function corsHeaders(origin: string | null) {
  const allowed = origin && (allowedOrigins.has(origin) || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin));
  return {
    'Access-Control-Allow-Origin': allowed ? origin : 'https://amenorica.github.io',
    'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Cache-Control': 'no-store',
    Vary: 'Origin',
  };
}

Deno.serve(async (request) => {
  const origin = request.headers.get('origin');
  const headers = corsHeaders(origin);
  if (request.method === 'OPTIONS') return new Response(null, { headers });
  if (request.method !== 'POST' || !origin || headers['Access-Control-Allow-Origin'] !== origin) {
    return Response.json({ error: 'Forbidden' }, { status: 403, headers });
  }

  const keyId = Deno.env.get('CLOUDFLARE_TURN_KEY_ID');
  const apiToken = Deno.env.get('CLOUDFLARE_TURN_API_TOKEN');
  if (!keyId || !apiToken) return Response.json({ error: 'TURN is not configured' }, { status: 503, headers });

  const response = await fetch(`https://rtc.live.cloudflare.com/v1/turn/keys/${keyId}/credentials/generate-ice-servers`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ ttl: 21600 }),
  });
  if (!response.ok) return Response.json({ error: 'TURN credentials unavailable' }, { status: 502, headers });

  const data = await response.json() as { iceServers?: Array<{ urls: string | string[]; username?: string; credential?: string }> };
  const iceServers = (data.iceServers ?? []).map((server) => {
    const urls = Array.isArray(server.urls) ? server.urls : [server.urls];
    return { ...server, urls: urls.filter((url) => !url.includes(':53')) };
  });
  return Response.json({ iceServers }, { headers });
});
