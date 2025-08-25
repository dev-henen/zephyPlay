<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { createAdapterForUrl, detectPlatform } from '$lib/players/index';
  import type { PlayerAdapter, VideoInfo } from '$lib/players/types';

  // Dexie DB helpers
  import { db, createAlbum, getAlbums, addSong, getRecentSongs, deleteSong, deleteAlbum, getSongsByAlbum } from '$lib/db';
  import type { SongRow, AlbumRow } from '$lib/db';

  export let data: { initialUrl: string | null; meta?: { title?: string | null; image?: string | null } | null };

  // UI state
  let inputUrl: string = data.initialUrl ?? '';
  let adapter: PlayerAdapter | null = null;
  let info: VideoInfo = { id: null, title: data.meta?.title ?? null, duration: 0, currentTime: 0 };
  let statusText = data.initialUrl ? 'ready' : 'idle';
  let poll: number | null = null;
  let wallpaper: string | null = data.meta?.image ?? null;
  const PLAYER_CONTAINER_ID = 'universal-player-container';
  const DEFAULT_WALLPAPER = '/default_wallpaper.jpg';

  // library UI state
  let albums: AlbumRow[] = [];
  let recentSongs: SongRow[] = [];
  let selectedAlbumId: any = null;
  let newAlbumName = '';
  let saving = false;

  // helper to call server metadata API
  async function fetchServerMeta(url: string) {
    try {
      const res = await fetch('/api/metadata', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url })
      });
      if (!res.ok) {
        const txt = await res.text();
        console.warn('metadata fetch failed:', res.status, txt);
        return null;
      }
      const json = await res.json();
      return json.meta ?? null;
    } catch (err) {
      console.error('metadata fetch error', err);
      return null;
    }
  }

  /** Refresh albums & recent songs from IndexedDB */
  async function refreshLibrary() {
    albums = await getAlbums();
    recentSongs = await getRecentSongs(50);
  }

  /** create album */
  async function handleCreateAlbum() {
    if (!newAlbumName.trim()) return;
    await createAlbum(newAlbumName.trim());
    newAlbumName = '';
    await refreshLibrary();
  }

  /** Save the currently loaded song into the DB */
  async function handleSaveSong() {
    if (!inputUrl || !inputUrl.trim()) return;
    saving = true;
    try {
      // get server metadata first
      const meta = await fetchServerMeta(inputUrl);
      // detect platform
      const detected = detectPlatform(inputUrl);
      const platform = detected?.platform ?? null;
      const resourceId = detected?.id ?? null;
      // If platform detected, prefer resourceId (for youtube we store url as full watch url)
      const record: Omit<SongRow, 'id' | 'addedAt'> = {
        url: inputUrl,
        title: meta?.title ?? info.title ?? null,
        platform,
        duration: info.duration ?? 0,
        albumId: selectedAlbumId ?? null,
        thumbnail: meta?.image ?? null
      };
      await addSong(record);
      await refreshLibrary();
    } finally {
      saving = false;
    }
  }

  /** Delete song from DB */
  async function handleDeleteSong(id?: number) {
    if (!id) return;
    await deleteSong(id);
    await refreshLibrary();
  }

  /** Delete album */
  async function handleDeleteAlbum(id?: number) {
    if (!id) return;
    if (!confirm('Delete album? This will unassign songs from the album (they will remain in library).')) return;
    await deleteAlbum(id);
    if (selectedAlbumId === id) selectedAlbumId = null;
    await refreshLibrary();
  }

  /** Load URL into adapter (same as before) */
  async function loadUrl(auto = false) {
    // clear previous adapter
    adapter?.destroy();
    adapter = null;
    stopPolling();
    statusText = 'validating';

    if (!inputUrl || !inputUrl.trim()) {
      statusText = 'enter_link';
      return;
    }

    // quick client-side detection for supported platform (so we can show a message quickly)
    const detected = detectPlatform(inputUrl);
    if (!detected) {
      // not a supported music link (for now)
      statusText = 'unsupported';
      // still try to fetch metadata for wallpaper/title (non-destructive)
      const meta = await fetchServerMeta(inputUrl);
      wallpaper = meta?.image ?? null;
      info.title = meta?.title ?? null;
      return;
    }

    // supported platform: fetch server metadata (title, image) first (better UX)
    statusText = 'fetching_meta';
    const meta = await fetchServerMeta(inputUrl);
    wallpaper = meta?.image ?? null;
    info.title = meta?.title ?? null;

    // create adapter and load
    statusText = 'loading_adapter';
    adapter = await createAdapterForUrl(PLAYER_CONTAINER_ID, inputUrl);
    if (!adapter) {
      statusText = 'adapter_failed';
      return;
    }

    // For our adapters (e.g. YouTube) detectPlatform returned an id; pass id to load
    await adapter.load(detected.id);
    info = await adapter.getInfo();
    statusText = 'ready';
    startPolling();

    // if auto flag true and supported, also optionally save recent auto-detection (non-intrusive)
    if (auto) {
      // add to recentSongs view (but don't persist automatically unless user clicks Save)
      recentSongs = await getRecentSongs(50);
    }
  }

  function startPolling() {
    stopPolling();
    poll = window.setInterval(async () => {
      if (!adapter) return;
      try {
        info = await adapter.getInfo();
      } catch {
        // ignore
      }
    }, 800);
  }
  function stopPolling() {
    if (poll != null) {
      clearInterval(poll);
      poll = null;
    }
  }

  function onPlay() { adapter?.play(); statusText = 'playing'; }
  function onPause() { adapter?.pause(); statusText = 'paused'; }
  function onStop() { adapter?.stop(); statusText = 'stopped'; }
  function onSeek(e: Event) {
    const v = Number((e.target as HTMLInputElement).value || 0);
    adapter?.seekTo(v);
    info.currentTime = v;
  }

  onMount(async () => {
    await refreshLibrary();
    // if the initialUrl was provided by server, don't auto-load it—user can click Load
    // Add keyboard Enter handler to the input (below) will allow quick load
  });

  onDestroy(() => {
    stopPolling();
    adapter?.destroy();
    adapter = null;
  });

  function fmtTime(s: number) {
    const mm = Math.floor(s / 60).toString().padStart(2, '0');
    const ss = Math.floor(s % 60).toString().padStart(2, '0');
    return `${mm}:${ss}`;
  }

  // wallpaper fallback selection
  $: bgImage = wallpaper ?? null;
  $: wallpaperToShow = bgImage ?? DEFAULT_WALLPAPER;

  /* --- Auto-load on Paste or Enter --- */
  let pasteTimer: number | null = null;
  function onInputPaste(e: ClipboardEvent) {
    // allow content to be pasted into input first, then try to auto-load
    if (pasteTimer) window.clearTimeout(pasteTimer);
    pasteTimer = window.setTimeout(async () => {
      // If user pasted, the input's value is not yet updated synchronously in some browsers
      // so we read clipboard as fallback
      const pastedText = (e.clipboardData?.getData('text') ?? inputUrl).trim();
      // If pastedText looks like a URL, try to auto-load
      try {
        const u = new URL(pastedText);
        inputUrl = pastedText;
        // Try auto-load only for supported platforms
        const detected = detectPlatform(inputUrl);
        if (detected) {
          await loadUrl(true);
        } else {
          // fetch metadata to show wallpaper/title
          const meta = await fetchServerMeta(inputUrl);
          wallpaper = meta?.image ?? null;
          info.title = meta?.title ?? null;
        }
      } catch {
        // not a url, ignore
      }
    }, 200);
  }

  async function onInputKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter') {
      await loadUrl();
    }
  }

  /* Library helpers to show songs in the selected album */
  let songsInAlbum: SongRow[] = [];
  $: (async () => {
    if (selectedAlbumId != null) {
      songsInAlbum = await getSongsByAlbum(selectedAlbumId);
    } else {
      songsInAlbum = [];
    }
  })();

  async function loadSongFromLibrary(song: SongRow) {
    inputUrl = song.url;
    await loadUrl();
  }
</script>

<style>
  .bg-wallpaper {
    background-position: center;
    background-size: cover;
    background-repeat: no-repeat;
  }
  .bg-overlay {
    background: linear-gradient(180deg, rgba(0,0,0,0.35), rgba(0,0,0,0.6));
  }

  /* Simple responsive layout tweaks */
  .lib-list { max-height: 42vh; overflow: auto; }
</style>

<div class="min-h-screen flex items-center justify-center bg-slate-900 text-white">
  <div class="absolute inset-0 bg-wallpaper" style="filter: blur(8px) saturate(0.9); background-image: url('/background.png')" aria-hidden="true"></div>
  <div class="absolute inset-0 bg-overlay" aria-hidden="true"></div>

  <div class="relative z-10 w-full max-w-5xl p-6">
    <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <!-- Main player -->
      <div class="col-span-2 bg-white/10 rounded-xl p-6 backdrop-blur-sm shadow-lg">
        <div>
          <label class="text-sm text-gray-200">Paste a music link (YouTube etc.)</label>
          <input
            type="text"
            bind:value={inputUrl}
            class="mt-2 w-full rounded-md px-3 py-2 bg-white/5 border border-white/10 focus:outline-none focus:ring-2 focus:ring-indigo-400"
            placeholder="https://..."
            on:paste={onInputPaste}
            on:keydown={onInputKeydown}
          />

          <div class="mt-3 flex gap-2">
            <button class="px-3 py-2 rounded bg-indigo-600 hover:bg-indigo-500" on:click={() => loadUrl()}>Load</button>
            <button class="px-3 py-2 rounded bg-green-600 hover:bg-green-500" on:click={onPlay} disabled={!adapter}>Play</button>
            <button class="px-3 py-2 rounded bg-yellow-400 text-black hover:bg-yellow-300" on:click={onPause} disabled={!adapter}>Pause</button>
            <button class="px-3 py-2 rounded bg-red-600 hover:bg-red-500" on:click={onStop} disabled={!adapter}>Stop</button>

            <button class="px-3 py-2 rounded bg-sky-600 hover:bg-sky-500 ml-4" on:click={handleSaveSong} disabled={!inputUrl || saving}>
              {#if saving}Saving…{:else}Save to Library{/if}
            </button>

            <!-- Album select -->
            <select class="ml-auto bg-white/5 rounded px-2 py-1" bind:value={selectedAlbumId}>
              <option value={null}>No album</option>
              {#each albums as a}
                <option value={a.id}>{a.name}</option>
              {/each}
            </select>
          </div>

          <div class="mt-4 text-sm text-gray-200">
            <div class="font-semibold">{info.title ?? (info.id ? `Loaded (${info.id})` : 'No title')}</div>
            <div class="text-xs opacity-80">
              {#if statusText === 'idle'}
                Enter a music link and click Load.
              {:else if statusText === 'enter_link'}
                Please enter a link.
              {:else if statusText === 'validating'}
                Validating...
              {:else if statusText === 'unsupported'}
                Unsupported link — only supported providers (e.g. YouTube) can be played now.
              {:else if statusText === 'fetching_meta'}
                Fetching metadata…
              {:else if statusText === 'loading_adapter'}
                Loading player…
              {:else if statusText === 'adapter_failed'}
                Failed to create player for that link.
              {:else}
                Status: {statusText}
              {/if}
            </div>
          </div>

          <div class="mt-3 flex items-center gap-3">
            <input type="range" min="0" max={info.duration || 0} value={info.currentTime}
                   on:input={onSeek} class="flex-1" disabled={!adapter} />
            <div class="w-16 text-right text-xs">{fmtTime(info.currentTime)}</div>
          </div>

          <div class="mt-4">
            <div class="text-xs text-gray-300">Thumbnail preview</div>
            <div class="w-40 h-40 rounded overflow-hidden border border-white/10 mt-2">
              <img src={wallpaperToShow} alt="thumbnail" class="w-full h-full object-cover" />
            </div>
          </div>
        </div>

        <!-- invisible adapter mount point -->
        <div id={PLAYER_CONTAINER_ID} class="hidden" />
      </div>

      <!-- Library panel -->
      <aside class="bg-white/6 rounded-xl p-4 flex flex-col gap-4">
        <div class="flex items-center justify-between">
          <h3 class="text-sm font-semibold">Library</h3>
          <button class="text-xs px-2 py-1 bg-white/5 rounded" on:click={refreshLibrary}>Refresh</button>
        </div>

        <!-- Albums -->
        <div>
          <div class="flex gap-2">
            <input placeholder="New album name" bind:value={newAlbumName} class="flex-1 px-2 py-1 rounded bg-white/5" />
            <button class="px-2 py-1 bg-green-600 rounded" on:click={handleCreateAlbum}>Create</button>
          </div>
          <div class="mt-2 lib-list">
            {#if albums.length === 0}
              <div class="text-xs text-gray-400">No albums yet</div>
            {/if}
            {#each albums as alb}
              <div class="flex items-center justify-between text-sm p-2 hover:bg-white/2 rounded">
                <div class="flex items-center gap-2">
                  <button class="text-left" on:click={() => selectedAlbumId = alb.id}>
                    <div class="font-medium">{alb.name}</div>
                    <div class="text-xs text-gray-300">{new Date(alb.createdAt).toLocaleString()}</div>
                  </button>
                </div>
                <div class="flex gap-2">
                  <button class="text-xs px-2 py-1 bg-red-600 rounded" on:click={() => handleDeleteAlbum(alb.id)}>Delete</button>
                </div>
              </div>
            {/each}
          </div>
        </div>

        <hr class="border-white/6" />

        <!-- Recent songs / album songs -->
        <div>
          <div class="flex items-center justify-between">
            <div class="text-sm font-semibold">{selectedAlbumId ? 'Album songs' : 'Recent songs'}</div>
            {#if selectedAlbumId}
              <button class="text-xs px-2 py-1 bg-gray-700 rounded" on:click={() => selectedAlbumId = null}>Back</button>
            {/if}
          </div>

          <div class="mt-2 lib-list">
            {#if selectedAlbumId && songsInAlbum.length === 0}
              <div class="text-xs text-gray-400">No songs in this album</div>
            {/if}

            {#if !selectedAlbumId && recentSongs.length === 0}
              <div class="text-xs text-gray-400">No songs yet</div>
            {/if}

            {#if selectedAlbumId}
              {#each songsInAlbum as s}
                <div class="flex items-center justify-between p-2 hover:bg-white/2 rounded text-sm">
                  <div class="truncate">
                    <div class="font-medium truncate">{s.title ?? s.url}</div>
                    <div class="text-xs text-gray-300">{s.platform ?? '—'} · {fmtTime(s.duration || 0)}</div>
                  </div>
                  <div class="flex gap-2">
                    <button class="px-2 py-1 text-xs bg-indigo-600 rounded" on:click={() => loadSongFromLibrary(s)}>Load</button>
                    <button class="px-2 py-1 text-xs bg-red-600 rounded" on:click={() => handleDeleteSong(s.id)}>Delete</button>
                  </div>
                </div>
              {/each}
            {:else}
              {#each recentSongs as s}
                <div class="flex items-center justify-between p-2 hover:bg-white/2 rounded text-sm">
                  <div class="truncate">
                    <div class="font-medium truncate">{s.title ?? s.url}</div>
                    <div class="text-xs text-gray-300">{s.platform ?? '—'} · {fmtTime(s.duration || 0)}</div>
                  </div>
                  <div class="flex gap-2">
                    <button class="px-2 py-1 text-xs bg-indigo-600 rounded" on:click={() => loadSongFromLibrary(s)}>Load</button>
                    <button class="px-2 py-1 text-xs bg-red-600 rounded" on:click={() => handleDeleteSong(s.id)}>Delete</button>
                  </div>
                </div>
              {/each}
            {/if}
          </div>
        </div>
      </aside>
    </div>
  </div>
</div>
