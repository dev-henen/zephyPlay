// src/lib/stores/player.ts
import { writable, get } from "svelte/store";
import type { PlayerAdapter, VideoInfo } from "$lib/players/types";
import { createAdapterForUrl, detectPlatform } from "$lib/players/index";

export const adapter = writable<PlayerAdapter | null>(null);
export const info = writable<VideoInfo>({
  id: null,
  title: null,
  duration: 0,
  currentTime: 0,
});
export const statusText = writable<
  | "idle"
  | "validating"
  | "fetching_meta"
  | "loading_adapter"
  | "ready"
  | "playing"
  | "paused"
  | "stopped"
  | "unsupported"
  | "adapter_failed"
  | "enter_link"
>("idle");
export const wallpaper = writable<string | null>(null);
export const loading = writable(false);

export const shuffle = writable(false);
export const repeatMode = writable<"off" | "one" | "all">("off");
export const liked = writable(false);
export const url = writable<string | null>(null);

let poll: number | null = null;
const PLAYER_CONTAINER_ID = "universal-player-container";

export async function fetchServerMeta(url: string) {
  try {
    const res = await fetch("/api/metadata", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url }),
    });
    if (!res.ok) {
      return null;
    }
    const json = await res.json();
    return json.meta ?? null;
  } catch (err) {
    console.warn("fetchServerMeta error", err);
    return null;
  }
}

export async function loadUrl(inputUrl: string, auto = false) {
  // cleanup previous
  url.set(inputUrl);
  get(adapter)?.destroy();
  adapter.set(null);
  stopPolling();
  statusText.set("validating");
  loading.set(true);

  if (!inputUrl?.trim()) {
    statusText.set("enter_link");
    loading.set(false);
    return;
  }

  const detected = detectPlatform(inputUrl);
  if (!detected) {
    statusText.set("unsupported");
    const meta = await fetchServerMeta(inputUrl);
    wallpaper.set(meta?.image ?? null);
    info.update(i => ({ ...i, title: meta?.title ?? i.title }));
    loading.set(false);
    return;
  }

  try {
    statusText.set("fetching_meta");
    const meta = await fetchServerMeta(inputUrl);
    wallpaper.set(meta?.image ?? null);
    info.update(i => ({ ...i, title: meta?.title ?? i.title }));

    statusText.set("loading_adapter");
    const created = await createAdapterForUrl(PLAYER_CONTAINER_ID, inputUrl);
    if (!created) {
      statusText.set("adapter_failed");
      loading.set(false);
      return;
    }
    adapter.set(created);

    // Pass the resource id where available
    await created.load(detected.id);
    const inf = await created.getInfo();
    info.set(inf);
    statusText.set("ready");
    startPolling();
    if (auto) {
      // callers may refresh recents if needed
    }
  } finally {
    loading.set(false);
  }
}

function startPolling() {
  stopPolling();
  poll = window.setInterval(async () => {
    const a = get(adapter);
    if (!a) return;
    try {
      const inf = await a.getInfo();
      info.set(inf);
    } catch {
      // ignore intermittent failures
    }
  }, 800);
}
function stopPolling() {
  if (poll != null) {
    clearInterval(poll);
    poll = null;
  }
}

export function destroyPlayer() {
  stopPolling();
  get(adapter)?.destroy();
  adapter.set(null);
}

export function play() {
  get(adapter)?.play();
  statusText.set("playing");
}
export function pause() {
  get(adapter)?.pause();
  statusText.set("paused");
}
export function stop() {
  get(adapter)?.stop();
  statusText.set("stopped");
}
export function seekTo(t: number) {
  get(adapter)?.seekTo(t);
  info.update(i => ({ ...i, currentTime: t }));
}
