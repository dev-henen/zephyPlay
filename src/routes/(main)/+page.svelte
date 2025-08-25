<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import { createAdapterForUrl, detectPlatform } from "$lib/players/index";
  import type { PlayerAdapter, VideoInfo } from "$lib/players/types";

  // Dexie DB helpers
  import {
    db,
    createAlbum,
    getAlbums,
    addSong,
    getRecentSongs,
    deleteSong,
    deleteAlbum,
    getSongsByAlbum,
  } from "$lib/db";
  import type { SongRow, AlbumRow } from "$lib/db";

  export let data: {
    initialUrl: string | null;
    meta?: { title?: string | null; image?: string | null } | null;
  };

  // UI state
  let inputUrl: string = data.initialUrl ?? "";
  let adapter: PlayerAdapter | null = null;
  let info: VideoInfo = {
    id: null,
    title: data.meta?.title ?? null,
    duration: 0,
    currentTime: 0,
  };
  let statusText = data.initialUrl ? "ready" : "idle";
  let poll: number | null = null;
  let wallpaper: string | null = data.meta?.image ?? null;
  const PLAYER_CONTAINER_ID = "universal-player-container";
  const DEFAULT_WALLPAPER = "/default_wallpaper.jpg";

  // new UI toggles for player bar
  let shuffle = false;
  let repeatMode: "off" | "one" | "all" = "off";
  let liked = false;

  // library UI state
  let albums: AlbumRow[] = [];
  let recentSongs: SongRow[] = [];
  let selectedAlbumId: any = null;
  let newAlbumName = "";
  let saving = false;

  // enhanced buttons state
  let loading = false; // used to show spinner on Load
  let createdMsg = ""; // temporary message after creating album

  // two-step delete confirmations
  let pendingDeleteAlbumId: number | null = null;
  let pendingDeleteSongId: number | null = null;

  // helper to call server metadata API
  async function fetchServerMeta(url: string) {
    try {
      const res = await fetch("/api/metadata", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      if (!res.ok) {
        const txt = await res.text();
        console.warn("metadata fetch failed:", res.status, txt);
        return null;
      }
      const json = await res.json();
      return json.meta ?? null;
    } catch (err) {
      console.error("metadata fetch error", err);
      return null;
    }
  }

  /** Refresh albums & recent songs from IndexedDB */
  async function refreshLibrary() {
    albums = await getAlbums();
    recentSongs = await getRecentSongs(50);
  }

  /** create album (enhanced) */
  async function handleCreateAlbum() {
    if (!newAlbumName.trim()) return;
    try {
      await createAlbum(newAlbumName.trim());
      newAlbumName = "";
      await refreshLibrary();
      createdMsg = "Album created";
      setTimeout(() => (createdMsg = ""), 2000);
    } catch (err) {
      console.error("create album failed", err);
    }
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
      const record: Omit<SongRow, "id" | "addedAt"> = {
        url: inputUrl,
        title: meta?.title ?? info.title ?? null,
        platform,
        duration: info.duration ?? 0,
        albumId: selectedAlbumId ?? null,
        thumbnail: meta?.image ?? null,
      };
      await addSong(record);
      await refreshLibrary();
    } finally {
      saving = false;
    }
  }

  /** Delete song from DB (two-step confirm) */
  async function handleDeleteSong(id?: number) {
    if (!id) return;
    // if not confirmed yet, set pending
    if (pendingDeleteSongId !== id) {
      pendingDeleteSongId = id;
      // clear pending in 4s to avoid stale state
      setTimeout(() => {
        if (pendingDeleteSongId === id) pendingDeleteSongId = null;
      }, 4000);
      return;
    }
    // confirmed
    await deleteSong(id);
    pendingDeleteSongId = null;
    await refreshLibrary();
  }

  /** Cancel pending song delete */
  function cancelDeleteSong() {
    pendingDeleteSongId = null;
  }

  /** Delete album (two-step confirm) */
  async function handleDeleteAlbum(id?: number) {
    if (!id) return;
    // require two-step confirm via UI (safer UX)
    if (pendingDeleteAlbumId !== id) {
      pendingDeleteAlbumId = id;
      setTimeout(() => {
        if (pendingDeleteAlbumId === id) pendingDeleteAlbumId = null;
      }, 4000);
      return;
    }
    // perform delete
    await deleteAlbum(id);
    if (selectedAlbumId === id) selectedAlbumId = null;
    pendingDeleteAlbumId = null;
    await refreshLibrary();
  }

  function cancelDeleteAlbum() {
    pendingDeleteAlbumId = null;
  }

  /** Load URL into adapter (same as before) */
  async function loadUrl(auto = false) {
    // clear previous adapter
    adapter?.destroy();
    adapter = null;
    stopPolling();
    statusText = "validating";
    loading = true;

    if (!inputUrl || !inputUrl.trim()) {
      statusText = "enter_link";
      loading = false;
      return;
    }

    // quick client-side detection for supported platform (so we can show a message quickly)
    const detected = detectPlatform(inputUrl);
    if (!detected) {
      // not a supported music link (for now)
      statusText = "unsupported";
      // still try to fetch metadata for wallpaper/title (non-destructive)
      const meta = await fetchServerMeta(inputUrl);
      wallpaper = meta?.image ?? null;
      info.title = meta?.title ?? null;
      loading = false;
      return;
    }

    try {
      // supported platform: fetch server metadata (title, image) first (better UX)
      statusText = "fetching_meta";
      const meta = await fetchServerMeta(inputUrl);
      wallpaper = meta?.image ?? null;
      info.title = meta?.title ?? null;

      // create adapter and load
      statusText = "loading_adapter";
      adapter = await createAdapterForUrl(PLAYER_CONTAINER_ID, inputUrl);
      if (!adapter) {
        statusText = "adapter_failed";
        loading = false;
        return;
      }

      // For our adapters (e.g. YouTube) detectPlatform returned an id; pass id to load
      await adapter.load(detected.id);
      info = await adapter.getInfo();
      statusText = "ready";
      startPolling();

      // if auto flag true and supported, also optionally save recent auto-detection (non-intrusive)
      if (auto) {
        // add to recentSongs view (but don't persist automatically unless user clicks Save)
        recentSongs = await getRecentSongs(50);
      }
    } finally {
      loading = false;
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

  function onPlay() {
    adapter?.play();
    statusText = "playing";
  }
  function onPause() {
    adapter?.pause();
    statusText = "paused";
  }
  function onStop() {
    adapter?.stop();
    statusText = "stopped";
  }
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
    const mm = Math.floor(s / 60)
      .toString()
      .padStart(2, "0");
    const ss = Math.floor(s % 60)
      .toString()
      .padStart(2, "0");
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
      const pastedText = (e.clipboardData?.getData("text") ?? inputUrl).trim();
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
    if (e.key === "Enter") {
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

  // small helper toggles
  function toggleShuffle() {
    shuffle = !shuffle;
  }
  function cycleRepeat() {
    if (repeatMode === "off") repeatMode = "all";
    else if (repeatMode === "all") repeatMode = "one";
    else repeatMode = "off";
  }
  function toggleLike() {
    liked = !liked;
  }
</script>

<div
  class="min-h-screen flex items-center justify-center bg-slate-900 text-white"
>
  <!-- background kept exactly like before -->
  <div
    class="absolute inset-0 bg-wallpaper"
    style="filter: blur(8px) saturate(0.9); background-image: url('/background.png')"
    aria-hidden="true"
  ></div>
  <div class="absolute inset-0 bg-overlay" aria-hidden="true"></div>

  <div class="relative z-10 w-full max-w-6xl p-6">
    <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <!-- Main player (bigger, card-like, album art on left) -->
      <div class="col-span-2 glass-card rounded-2xl p-6 shadow-lg">
        <div class="flex flex-col lg:flex-row gap-6">
          <!-- Artwork -->
          <div class="flex-shrink-0 flex items-center justify-center">
            <div class="art-large relative">
              <img
                src={wallpaperToShow}
                alt="art"
                class="w-full h-full object-cover"
              />
              <!-- center play overlay button -->
              <button
                class="absolute inset-0 m-auto w-14 h-14 rounded-full bg-white/10 flex items-center justify-center hover:bg-white/20 transition"
                on:click={() =>
                  adapter
                    ? info?.currentTime && statusText === "playing"
                      ? onPause()
                      : onPlay()
                    : loadUrl()}
                aria-label="Play / Pause"
              >
                {#if statusText === "playing"}
                  <!-- Pause icon -->
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    class="w-6 h-6"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      stroke-width="2"
                      d="M10 9v6M14 9v6"
                    />
                  </svg>
                {:else}
                  <!-- Play icon -->
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    class="w-6 h-6 ml-0.5"
                    fill="currentColor"
                    viewBox="0 0 20 20"
                  >
                    <path d="M4.5 3.5v13l11-6.5-11-6.5z" />
                  </svg>
                {/if}
              </button>
            </div>
          </div>

          <!-- Controls & metadata -->
          <div class="flex-1 flex flex-col justify-between">
            <div>
              <label class="text-sm text-gray-300" for="music-link"
                >Paste a music link</label
              >
              <div class="mt-3 flex gap-3 items-center flex-wrap">
                <input
                  id="music-link"
                  type="text"
                  bind:value={inputUrl}
                  class="flex-1 rounded-lg px-3 py-2 bg-white/5 border border-white/8 focus:outline-none focus:ring-2 focus:ring-indigo-400"
                  placeholder="https://..."
                  on:paste={onInputPaste}
                  on:keydown={onInputKeydown}
                />

                <!-- Enhanced Load button: big, primary, spinner when loading -->
                <button
                  class="btn-primary"
                  on:click={() => loadUrl()}
                  disabled={!inputUrl || !inputUrl.trim() || loading}
                  title="Load the link"
                >
                  {#if loading}
                    <svg
                      class="w-4 h-4 animate-spin"
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
                    >
                      <circle
                        class="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        stroke-width="4"
                      ></circle>
                      <path
                        class="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
                      ></path>
                    </svg>
                    <span>Loading…</span>
                  {:else}
                    <!-- load icon -->
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      class="w-4 h-4"
                      viewBox="0 0 20 20"
                      fill="currentColor"
                    >
                      <path d="M3 3h14v2H3V3zm0 4h10v2H3V7zm0 4h6v2H3v-2z" />
                    </svg>
                    <span>Load</span>
                  {/if}
                </button>

                <!-- Save to Library remains smaller -->
                <button
                  class="btn-ghost"
                  on:click={handleSaveSong}
                  disabled={!inputUrl || saving}
                >
                  {#if saving}Saving…{:else}
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      class="w-4 h-4 inline-block mr-1"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="2"
                        d="M5 13l4 4L19 7"
                      />
                    </svg>
                    Save
                  {/if}
                </button>

                <select
                  class="ml-auto bg-white/5 rounded px-2 py-1"
                  bind:value={selectedAlbumId}
                >
                  <option value={null}>No album</option>
                  {#each albums as a}
                    <option value={a.id}>{a.name}</option>
                  {/each}
                </select>
              </div>

              <div class="mt-4">
                <div class="text-2xl font-semibold">
                  {info.title ?? (info.id ? `Loaded (${info.id})` : "No title")}
                </div>
                <div class="text-sm text-gray-300 mt-1">
                  {#if statusText === "idle"}
                    Enter a music link and click Load.
                  {:else if statusText === "enter_link"}
                    Please enter a link.
                  {:else if statusText === "validating"}
                    Validating...
                  {:else if statusText === "unsupported"}
                    Unsupported link — only supported providers (e.g. YouTube)
                    can be played now.
                  {:else if statusText === "fetching_meta"}
                    Fetching metadata…
                  {:else if statusText === "loading_adapter"}
                    Loading player…
                  {:else if statusText === "adapter_failed"}
                    Failed to create player for that link.
                  {:else}
                    Status: {statusText}
                  {/if}
                </div>
              </div>
            </div>

            <!-- seek + small controls -->
            <div class="mt-4">
              <div class="flex items-center gap-4">
                <div class="w-14 text-xs text-gray-300">
                  {fmtTime(info.currentTime)}
                </div>
                <input
                  type="range"
                  min="0"
                  max={info.duration || 0}
                  value={info.currentTime}
                  on:input={onSeek}
                  class="flex-1 smooth"
                  disabled={!adapter}
                />
                <div class="w-14 text-right text-xs text-gray-300">
                  {fmtTime(info.duration)}
                </div>
              </div>

              <div class="mt-3 flex items-center gap-3">
                <button
                  aria-label="Back 10 seconds"
                  class="px-3 py-2 rounded-full bg-white/5 hover:bg-white/8"
                  on:click={() =>
                    adapter?.seekTo(Math.max(0, info.currentTime - 10))}
                  title="Back 10s"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    class="w-5 h-5"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      stroke-width="2"
                      d="M12 19V6l-8.5 6L12 19zM21 19V6l-8.5 6L21 19z"
                    />
                  </svg>
                </button>

                <button
                  class="px-4 py-2 rounded-full bg-indigo-600 hover:bg-indigo-500"
                  on:click={() =>
                    statusText === "playing" ? onPause() : onPlay()}
                  aria-label="Play / Pause"
                >
                  {#if statusText === "playing"}
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      class="w-6 h-6"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="2"
                        d="M10 9v6M14 9v6"
                      />
                    </svg>
                  {:else}
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      class="w-6 h-6 ml-0.5"
                      fill="currentColor"
                      viewBox="0 0 20 20"
                    >
                      <path d="M4.5 3.5v13l11-6.5-11-6.5z" />
                    </svg>
                  {/if}
                </button>

                <button
                  aria-label="Forward 10 seconds"
                  class="px-3 py-2 rounded-full bg-white/5 hover:bg-white/8"
                  on:click={() =>
                    adapter?.seekTo(
                      Math.min(info.duration || 0, info.currentTime + 10)
                    )}
                  title="Forward 10s"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    class="w-5 h-5"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      stroke-width="2"
                      d="M7 19V6l8.5 6L7 19zM18 19V6l-8.5 6L18 19z"
                    />
                  </svg>
                </button>

                <div class="ml-4 flex items-center gap-2 text-sm text-gray-300">
                  <button
                    aria-label="Shuffle"
                    class="px-2 py-1 rounded bg-white/5 hover:bg-white/8"
                    on:click={toggleShuffle}
                    aria-pressed={shuffle}
                    title="Shuffle"
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      class="w-4 h-4"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke={shuffle ? "white" : "currentColor"}
                    >
                      <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="2"
                        d="M3 3l6 6m0 0l8 8M9 9L21 21"
                      />
                    </svg>
                  </button>

                  <button
                    class="px-2 py-1 rounded bg-white/5 hover:bg-white/8"
                    on:click={cycleRepeat}
                    title="Repeat"
                  >
                    {#if repeatMode === "off"}
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        class="w-4 h-4"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          stroke-linecap="round"
                          stroke-linejoin="round"
                          stroke-width="2"
                          d="M3 7h13M21 17H8M21 7v10M3 17V7"
                        />
                      </svg>
                    {:else if repeatMode === "all"}
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        class="w-4 h-4 text-white"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          stroke-linecap="round"
                          stroke-linejoin="round"
                          stroke-width="2"
                          d="M3 7h13M21 17H8M21 7v10M3 17V7"
                        />
                      </svg>
                    {:else}
                      <div class="text-xs px-2 py-0.5 bg-white/10 rounded">
                        1
                      </div>
                    {/if}
                  </button>

                  <button
                    class="px-2 py-1 rounded bg-white/5 hover:bg-white/8"
                    on:click={toggleLike}
                    title="Like"
                  >
                    {#if liked}
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        class="w-4 h-4 text-pink-500"
                        viewBox="0 0 20 20"
                        fill="currentColor"
                      >
                        <path
                          d="M3.172 5.172a4 4 0 015.656 0L10 6.343l1.172-1.171a4 4 0 015.656 5.656L10 18.657l-6.828-6.829a4 4 0 010-5.656z"
                        />
                      </svg>
                    {:else}
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        class="w-4 h-4"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          stroke-linecap="round"
                          stroke-linejoin="round"
                          stroke-width="2"
                          d="M4.318 6.318a4.5 4.5 0 016.364 0L12 7.636l1.318-1.318a4.5 4.5 0 116.364 6.364L12 20.364l-7.682-7.682a4.5 4.5 0 010-6.364z"
                        />
                      </svg>
                    {/if}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- invisible adapter mount point -->
        <div id={PLAYER_CONTAINER_ID} class="hidden"></div>
      </div>

      <!-- Library panel -->
      <aside class="glass-card rounded-2xl p-4 flex flex-col gap-4 shadow-lg">
        <div class="flex items-center justify-between">
          <h3 class="text-sm font-semibold">Library</h3>
          <button
            class="text-xs px-2 py-1 bg-white/5 rounded"
            on:click={refreshLibrary}>Refresh</button
          >
        </div>

        <!-- Albums -->
        <div>
          <div class="flex gap-2 items-center">
            <input
              placeholder="New album name"
              bind:value={newAlbumName}
              class="flex-1 px-2 py-1 rounded bg-white/5"
            />
            <!-- Enhanced Create button: disabled when empty, shows small success msg -->
            <button
              class="btn-primary"
              on:click={handleCreateAlbum}
              disabled={!newAlbumName || !newAlbumName.trim()}
              title="Create album"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                class="w-4 h-4"
                viewBox="0 0 20 20"
                fill="currentColor"
              >
                <path
                  fill-rule="evenodd"
                  d="M10 5a1 1 0 011 1v3h3a1 1 0 110 2h-3v3a1 1 0 11-2 0v-3H6a1 1 0 110-2h3V6a1 1 0 011-1z"
                  clip-rule="evenodd"
                />
              </svg>
              <span>Create</span>
            </button>

            {#if createdMsg}
              <div class="text-sm text-green-300 ml-2">{createdMsg}</div>
            {/if}
          </div>

          <div class="mt-2 lib-list">
            {#if albums.length === 0}
              <div class="text-xs text-gray-400">No albums yet</div>
            {/if}
            {#each albums as alb}
              <div
                class="flex items-center justify-between text-sm p-2 hover:bg-white/3 rounded library-item"
              >
                <div class="flex items-center gap-3">
                  <div
                    class="w-10 h-10 bg-white/6 rounded overflow-hidden flex-shrink-0"
                  >
                    <!-- placeholder small art -->
                    <img
                      src={alb.thumbnail ?? wallpaperToShow}
                      alt="a"
                      class="w-full h-full object-cover"
                    />
                  </div>
                  <button
                    class="text-left"
                    on:click={() => (selectedAlbumId = alb.id)}
                  >
                    <div class="font-medium">{alb.name}</div>
                    <div class="text-xs text-gray-300">
                      {new Date(alb.createdAt).toLocaleString()}
                    </div>
                  </button>
                </div>
                <div class="flex gap-2 items-center">
                  {#if pendingDeleteAlbumId === alb.id}
                    <div class="flex gap-2">
                      <button
                        class="px-2 py-1 text-xs bg-red-600 rounded"
                        on:click={() => handleDeleteAlbum(alb.id)}
                        >Confirm</button
                      >
                      <button
                        class="px-2 py-1 text-xs bg-white/5 rounded"
                        on:click={cancelDeleteAlbum}>Cancel</button
                      >
                    </div>
                  {:else}
                    <button
                      class="text-xs px-2 py-1 bg-red-600 rounded"
                      on:click={() => handleDeleteAlbum(alb.id)}>Delete</button
                    >
                  {/if}
                </div>
              </div>
            {/each}
          </div>
        </div>

        <hr class="border-white/6" />

        <!-- Recent songs / album songs -->
        <div>
          <div class="flex items-center justify-between">
            <div class="text-sm font-semibold">
              {selectedAlbumId ? "Album songs" : "Recent songs"}
            </div>
            {#if selectedAlbumId}
              <button
                class="text-xs px-2 py-1 bg-gray-700 rounded"
                on:click={() => (selectedAlbumId = null)}>Back</button
              >
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
                <div
                  class="flex items-center justify-between p-2 hover:bg-white/2 rounded text-sm library-item"
                >
                  <div class="truncate flex items-center gap-3">
                    <div class="w-10 h-10 bg-white/6 rounded overflow-hidden">
                      <img
                        src={s.thumbnail ?? wallpaperToShow}
                        alt="thumb"
                        class="w-full h-full object-cover"
                      />
                    </div>
                    <div class="truncate">
                      <div class="font-medium truncate">{s.title ?? s.url}</div>
                      <div class="text-xs text-gray-300">
                        {s.platform ?? "—"} · {fmtTime(s.duration || 0)}
                      </div>
                    </div>
                  </div>
                  <div class="flex gap-2 items-center">
                    <button
                      class="px-2 py-1 text-xs bg-indigo-600 rounded"
                      on:click={() => loadSongFromLibrary(s)}>Load</button
                    >

                    {#if pendingDeleteSongId === s.id}
                      <div class="flex gap-2">
                        <button
                          class="px-2 py-1 text-xs bg-red-600 rounded"
                          on:click={() => handleDeleteSong(s.id)}
                          >Confirm</button
                        >
                        <button
                          class="px-2 py-1 text-xs bg-white/5 rounded"
                          on:click={cancelDeleteSong}>Cancel</button
                        >
                      </div>
                    {:else}
                      <button
                        class="px-2 py-1 text-xs bg-red-600 rounded"
                        on:click={() => handleDeleteSong(s.id)}>Delete</button
                      >
                    {/if}
                  </div>
                </div>
              {/each}
            {:else}
              {#each recentSongs as s}
                <div
                  class="flex items-center justify-between p-2 hover:bg-white/2 rounded text-sm library-item"
                >
                  <div class="truncate flex items-center gap-3">
                    <div class="w-10 h-10 bg-white/6 rounded overflow-hidden">
                      <img
                        src={s.thumbnail ?? wallpaperToShow}
                        alt="thumb"
                        class="w-full h-full object-cover"
                      />
                    </div>
                    <div class="truncate">
                      <div class="font-medium truncate">{s.title ?? s.url}</div>
                      <div class="text-xs text-gray-300">
                        {s.platform ?? "—"} · {fmtTime(s.duration || 0)}
                      </div>
                    </div>
                  </div>
                  <div class="flex gap-2 items-center">
                    <button
                      class="px-2 py-1 text-xs bg-indigo-600 rounded"
                      on:click={() => loadSongFromLibrary(s)}>Load</button
                    >

                    {#if pendingDeleteSongId === s.id}
                      <div class="flex gap-2">
                        <button
                          class="px-2 py-1 text-xs bg-red-600 rounded"
                          on:click={() => handleDeleteSong(s.id)}
                          >Confirm</button
                        >
                        <button
                          class="px-2 py-1 text-xs bg-white/5 rounded"
                          on:click={cancelDeleteSong}>Cancel</button
                        >
                      </div>
                    {:else}
                      <button
                        class="px-2 py-1 text-xs bg-red-600 rounded"
                        on:click={() => handleDeleteSong(s.id)}>Delete</button
                      >
                    {/if}
                  </div>
                </div>
              {/each}
            {/if}
          </div>
        </div>
      </aside>
    </div>
  </div>

  <!-- Mini player (floating, centered) - untouched for play access -->
  <div class="mini-player">
    <div class="glass-card rounded-3xl p-3 flex items-center gap-4">
      <div class="w-16 h-16 rounded overflow-hidden flex-shrink-0">
        <img
          src={wallpaperToShow}
          alt="mini art"
          class="w-full h-full object-cover"
        />
      </div>

      <div class="flex-1">
        <div class="flex items-center justify-between gap-4">
          <div class="truncate">
            <div class="font-medium truncate">{info.title ?? "No title"}</div>
            <div class="text-xs text-gray-300">
              {info.id ? "Playing" : "Stopped"}
            </div>
          </div>

          <div class="flex items-center gap-3">
            <button
              class="px-2 py-1 rounded bg-white/5"
              on:click={() =>
                adapter?.seekTo(Math.max(0, info.currentTime - 10))}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                class="w-4 h-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                ><path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M12 19V6l-8.5 6L12 19zM21 19V6l-8.5 6L21 19z"
                /></svg
              >
            </button>

            <button
              class="px-3 py-2 rounded-full bg-indigo-600"
              on:click={() => (statusText === "playing" ? onPause() : onPlay())}
            >
              {#if statusText === "playing"}
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  class="w-5 h-5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  ><path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M10 9v6M14 9v6"
                  /></svg
                >
              {:else}
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  class="w-5 h-5 ml-0.5"
                  fill="currentColor"
                  viewBox="0 0 20 20"
                  ><path d="M4.5 3.5v13l11-6.5-11-6.5z" /></svg
                >
              {/if}
            </button>

            <button
              class="px-2 py-1 rounded bg-white/5"
              on:click={() =>
                adapter?.seekTo(
                  Math.min(info.duration || 0, info.currentTime + 10)
                )}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                class="w-4 h-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                ><path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M7 19V6l8.5 6L7 19zM18 19V6l-8.5 6L18 19z"
                /></svg
              >
            </button>
          </div>
        </div>

        <div class="mt-2 flex items-center gap-3">
          <div class="text-xs text-gray-300 w-10">
            {fmtTime(info.currentTime)}
          </div>
          <input
            type="range"
            class="smooth flex-1"
            min="0"
            max={info.duration || 0}
            value={info.currentTime}
            on:input={onSeek}
            disabled={!adapter}
          />
          <div class="text-xs text-gray-300 w-10 text-right">
            {fmtTime(info.duration)}
          </div>
        </div>
      </div>
    </div>
  </div>
</div>

<style>
  /* Keep your wallpaper and overlay behavior but style the interior to match YT Music-like look */

  .bg-wallpaper {
    background-position: center;
    background-size: cover;
    background-repeat: no-repeat;
  }
  .bg-overlay {
    background: linear-gradient(
      180deg,
      rgba(0, 0, 0, 0.35),
      rgba(0, 0, 0, 0.6)
    );
  }

  /* new: glass card look */
  .glass-card {
    background: linear-gradient(
      180deg,
      rgba(255, 255, 255, 0.03),
      rgba(255, 255, 255, 0.02)
    );
    border: 1px solid rgba(255, 255, 255, 0.06);
    backdrop-filter: blur(8px) saturate(1.1);
  }

  /* player art */
  .art-large {
    width: 320px;
    height: 320px;
    border-radius: 12px;
    overflow: hidden;
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5);
  }

  /* mini-player */
  .mini-player {
    position: fixed;
    left: 50%;
    transform: translateX(-50%);
    bottom: 20px;
    width: min(1100px, calc(100% - 32px));
    z-index: 60;
  }

  /* smoother range slider */
  input[type="range"].smooth {
    -webkit-appearance: none;
    appearance: none;
    height: 6px;
    background: linear-gradient(
      90deg,
      rgba(255, 255, 255, 0.6),
      rgba(255, 255, 255, 0.2)
    );
    border-radius: 999px;
    outline: none;
  }
  input[type="range"].smooth::-webkit-slider-thumb {
    -webkit-appearance: none;
    width: 14px;
    height: 14px;
    border-radius: 50%;
    background: white;
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.4);
  }

  /* library list hover */
  .library-item:hover {
    background: linear-gradient(
      90deg,
      rgba(255, 255, 255, 0.03),
      rgba(255, 255, 255, 0.02)
    );
  }

  /* enhanced buttons */
  .btn-primary {
    background: linear-gradient(90deg, #6d28d9, #4f46e5);
    padding: 10px 16px;
    border-radius: 10px;
    box-shadow: 0 6px 20px rgba(79, 70, 229, 0.18);
    display: inline-flex;
    gap: 8px;
    align-items: center;
    color: white;
    font-weight: 600;
  }
  .btn-primary[disabled] {
    opacity: 0.5;
    cursor: not-allowed;
    box-shadow: none;
  }
  .btn-ghost {
    background: transparent;
    border: 1px solid rgba(255, 255, 255, 0.06);
    padding: 8px 10px;
    border-radius: 8px;
    color: white;
  }

  .btn-danger {
    background: linear-gradient(90deg, #ef4444, #dc2626);
    padding: 8px 10px;
    border-radius: 8px;
    color: white;
    font-weight: 600;
  }

  /* responsive tweaks */
  @media (max-width: 1024px) {
    .art-large {
      width: 220px;
      height: 220px;
    }
  }
</style>
