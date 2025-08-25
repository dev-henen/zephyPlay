// youtube.ts
// All YouTube-specific logic is here: ID extraction, adapter creation, and oEmbed metadata fetch.

import type { PlayerAdapter, VideoInfo } from './types';

declare global {
  interface Window {
    YT?: any;
    onYouTubeIframeAPIReady?: () => void;
  }
}

/** Extract YouTube id from many URL forms (youtube.com, music.youtube.com, youtu.be, embed) */
export function extractYouTubeId(url: string): string | null {
  try {
    const u = new URL(url.trim());
    const host = u.hostname.toLowerCase().replace(/^www\./, '');
    if (host === 'youtu.be') return u.pathname.slice(1) || null;
    if (u.searchParams.has('v')) return u.searchParams.get('v');
    const parts = u.pathname.split('/').filter(Boolean);
    const embedIndex = parts.indexOf('embed');
    if (embedIndex >= 0 && parts.length > embedIndex + 1) return parts[embedIndex + 1];
    const last = parts[parts.length - 1];
    if (last && last.length >= 6) return last;
    return null;
  } catch {
    return null;
  }
}

/** Load YouTube iframe API once */
export function ensureYouTubeAPI(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined') return reject(new Error('window not available'));
    if (window.YT && window.YT.Player) return resolve();
    window.onYouTubeIframeAPIReady = () => resolve();
    const src = 'https://www.youtube.com/iframe_api';
    if (!document.querySelector(`script[src="${src}"]`)) {
      const tag = document.createElement('script');
      tag.src = src;
      tag.async = true;
      tag.onerror = () => reject(new Error('Failed to load YouTube API script'));
      document.head.appendChild(tag);
    }
  });
}

/** Create a YouTube PlayerAdapter (implements PlayerAdapter) */
export async function createYouTubeAdapter(containerId: string, options?: Record<string, any>): Promise<PlayerAdapter> {
  await ensureYouTubeAPI();

  let ytPlayer: any = null;
  let currentVideoId: string | null = null;

  function createPlayer(videoId: string): Promise<void> {
    return new Promise((resolve) => {
      if (ytPlayer) {
        try { ytPlayer.loadVideoById(videoId); } catch { try { ytPlayer.cueVideoById(videoId); } catch {} }
        currentVideoId = videoId;
        resolve();
        return;
      }

      ytPlayer = new window.YT.Player(containerId, {
        height: '0',
        width: '0',
        videoId,
        playerVars: { controls: 1, modestbranding: 1, rel: 0, origin: window.location.origin, ...options },
        events: {
          onReady: () => { currentVideoId = videoId; resolve(); },
          onStateChange: () => { /* consumer polls getInfo() */ }
        },
      });
    });
  }

  const adapter: PlayerAdapter = {
    async load(resourceId: string) { await createPlayer(resourceId); currentVideoId = resourceId; },
    play() { try { ytPlayer?.playVideo(); } catch {} },
    pause() { try { ytPlayer?.pauseVideo(); } catch {} },
    stop() { try { ytPlayer?.stopVideo(); } catch {} },
    seekTo(seconds: number) { try { ytPlayer?.seekTo(Math.max(0, Math.floor(seconds)), true); } catch {} },
    async getInfo(): Promise<VideoInfo> {
      if (!ytPlayer) return { id: currentVideoId, title: null, duration: 0, currentTime: 0 };
      try {
        const data = ytPlayer.getVideoData?.() ?? {};
        const title = data.title ?? null;
        const duration = Math.max(0, Math.floor(ytPlayer.getDuration?.() || 0));
        const currentTime = Math.max(0, Math.floor(ytPlayer.getCurrentTime?.() || 0));
        return { id: currentVideoId, title, duration, currentTime };
      } catch { return { id: currentVideoId, title: null, duration: 0, currentTime: 0 }; }
    },
    destroy() { try { ytPlayer?.destroy?.(); } catch {} finally { ytPlayer = null; } },
  };

  return adapter;
}

/**
 * Fetch YouTube metadata via unauthenticated oEmbed (server-side friendly).
 * Accepts either a full watch URL or just an id (if you pass id, set isId=true).
 * Uses the provided server `fetch` (so caller should forward SvelteKit's fetch).
 */
export async function fetchYouTubeOEmbed(targetUrlOrId: string, serverFetch: typeof fetch, isId = false): Promise<{ title?: string | null; image?: string | null }>{
  try {
    const watchUrl = isId ? `https://www.youtube.com/watch?v=${encodeURIComponent(targetUrlOrId)}` : targetUrlOrId;
    const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(watchUrl)}&format=json`;
    const res = await serverFetch(oembedUrl, { method: 'GET' });
    if (!res.ok) return { title: null, image: null };
    const body = await res.json();
    return { title: body.title ?? null, image: body.thumbnail_url ?? null };
  } catch {
    return { title: null, image: null };
  }
}
