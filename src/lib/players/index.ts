// index.ts
// Platform detection + adapter factory + universal fetchMetadata(url, fetch)

import type { PlayerAdapter } from './types';
import { extractYouTubeId, createYouTubeAdapter, fetchYouTubeOEmbed } from './youtube';

/** Simple OG meta extractor (server-side). Does not execute JS. */
function parseOg(html: string, property: 'og:title' | 'og:image'): string | null {
  // meta property="og:..." content="..."
  const re = new RegExp(`<meta[^>]+property=["']${property}["'][^>]+content=["']([^"']+)["']`, 'i');
  const m = html.match(re);
  if (m && m[1]) return m[1];
  // try name=variant
  const re2 = new RegExp(`<meta[^>]+name=["']${property}["'][^>]+content=["']([^"']+)["']`, 'i');
  const m2 = html.match(re2);
  if (m2 && m2[1]) return m2[1];
  return null;
}

/** Detect platform; currently only YouTube is supported but detection is centralized */
export function detectPlatform(url: string): { platform: 'youtube', id: string } | null {
  const id = extractYouTubeId(url);
  if (id) return { platform: 'youtube', id };
  return null;
}

/** Create adapter by url. containerId is the DOM id the adapter should mount into. */
export async function createAdapterForUrl(containerId: string, url: string): Promise<PlayerAdapter | null> {
  const detected = detectPlatform(url);
  if (!detected) return null;
  if (detected.platform === 'youtube') {
    return createYouTubeAdapter(containerId);
  }
  return null;
}

/**
 * Universal metadata fetcher.
 * - tries platform-specific oEmbed when possible (YouTube),
 * - else falls back to fetching HTML & scraping OG tags (og:title, og:image).
 *
 * serverFetch must be the server-side fetch (SvelteKit's fetch).
 * Returns { title?: string|null, image?: string|null, platform?: string|null }.
 */
export async function fetchMetadata(url: string, serverFetch: typeof fetch): Promise<{ title?: string|null; image?: string|null; platform?: string|null }> {
  // prefer quick platform-specific endpoints
  const ytId = extractYouTubeId(url);
  if (ytId) {
    const data = await fetchYouTubeOEmbed(ytId, serverFetch, true);
    return { title: data.title ?? null, image: data.image ?? null, platform: 'youtube' };
  }

  // fallback: fetch HTML and parse OG tags
  try {
    const res = await serverFetch(url, { method: 'GET' });
    if (!res.ok) return { title: null, image: null, platform: null };
    const html = await res.text();
    const title = parseOg(html, 'og:title') ?? null;
    const image = parseOg(html, 'og:image') ?? null;
    return { title, image, platform: null };
  } catch {
    return { title: null, image: null, platform: null };
  }
}
