export const fallbackIceServers: RTCIceServer[] = [{ urls: ['stun:stun.cloudflare.com:3478', 'stun:stun.l.google.com:19302'] }];

export function hasTurnServer(value: unknown): value is { iceServers: RTCIceServer[] } {
  if (!value || typeof value !== 'object' || !('iceServers' in value) || !Array.isArray(value.iceServers)) return false;
  return value.iceServers.some((server) => {
    if (!server || typeof server !== 'object') return false;
    const candidate = server as { urls?: unknown; username?: unknown; credential?: unknown };
    const urls = Array.isArray(candidate.urls) ? candidate.urls : [candidate.urls];
    return urls.some((url) => typeof url === 'string' && url.startsWith('turn'))
      && typeof candidate.username === 'string'
      && typeof candidate.credential === 'string';
  });
}

export async function loadIceServers(supabaseUrl: string, publishableKey: string) {
  const response = await fetch(`${supabaseUrl}/functions/v1/turn-credentials`, {
    method: 'POST',
    headers: { apikey: publishableKey, Authorization: `Bearer ${publishableKey}` },
  });
  if (!response.ok) throw new Error(`TURN credentials unavailable (${response.status})`);
  const data: unknown = await response.json();
  if (!hasTurnServer(data)) throw new Error('TURN credentials response is invalid');
  return data.iceServers;
}
