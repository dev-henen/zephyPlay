// src/lib/stores/ui.ts
import { writable } from "svelte/store";
import type { SongRow, AlbumRow } from "$lib/db";
import { searchSongs, searchAlbums } from "$lib/db";

export const searchQuery = writable<string>("");
export const searchResults = writable<{ songs: SongRow[]; albums: AlbumRow[] }>({ songs: [], albums: [] });

export type Toast = { id: number; text: string; type?: "info" | "success" | "error"; timeout?: number };

let nextToast = 1;
export const toasts = writable<Toast[]>([]);
export function notify(text: string, type: Toast["type"] = "info", timeout = 3000) {
  const id = nextToast++;
  toasts.update(s => [...s, { id, text, type, timeout }]);
  if (timeout > 0) {
    setTimeout(() => {
      toasts.update(s => s.filter(t => t.id !== id));
    }, timeout);
  }
}

export const confirmState = writable<{ id: number; text: string; resolve: (v: boolean) => void } | null>(null);
let nextConfirmId = 1;
export function confirm(text: string) {
  return new Promise<boolean>(resolve => {
    confirmState.set({ id: nextConfirmId++, text, resolve });
  });
}
export function clearConfirm() {
  confirmState.set(null);
}


/**
 * Perform search across songs & albums and update searchResults.
 * Caller may `await` this. If query is empty, results are cleared.
 */
export async function performSearch(query: string) {
  const q = query?.trim() ?? "";
  searchQuery.set(q);
  if (!q) {
    searchResults.set({ songs: [], albums: [] });
    return;
  }
  try {
    // parallel queries
    const [songs, albums] = await Promise.all([searchSongs(q, 50), searchAlbums(q, 20)]);
    searchResults.set({ songs, albums });
  } catch (err) {
    console.error("performSearch error", err);
    searchResults.set({ songs: [], albums: [] });
  }
}

/** Clear search state */
export function clearSearch() {
  searchQuery.set("");
  searchResults.set({ songs: [], albums: [] });
}
