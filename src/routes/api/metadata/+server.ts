import type { RequestHandler } from './$types';
import { fetchMetadata } from '$lib/players/index';

export const POST: RequestHandler = async ({ request, fetch }) => {
  try {
    const body = await request.json();
    const url = (body?.url as string) ?? '';
    if (!url) {
      return new Response(JSON.stringify({ error: 'Missing url' }), { status: 400 });
    }

    // fetchMetadata expects the server fetch (SvelteKit fetch)
    const meta = await fetchMetadata(url, fetch);
    return new Response(JSON.stringify({ ok: true, meta }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (err) {
    return new Response(JSON.stringify({ ok: false, error: String(err) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
