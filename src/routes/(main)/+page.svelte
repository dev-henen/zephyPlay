<!-- src/routes/+page.svelte -->
<script lang="ts">
  import { onMount } from "svelte";
  import { goto } from "$app/navigation";
  import { info, wallpaper, loading, loadUrl, play, pause, seekTo, statusText } from "$lib/stores/player";
  import { addSong, getAlbums, createAlbum, getRecentSongs, deleteSong } from "$lib/db";
  import { notify, confirm } from "$lib/stores/ui";
  import { fmtTime } from "$lib/utils";
  import { truncateText } from "$lib";

  // Player / input state
  let inputUrl = "";
  let selectedAlbumId: number | null = null;
  let saving = false;

  // album UI
  let albums: { id: number; name: string; createdAt: number; thumbnail?: string | null }[] = [];
  let newAlbumName = "";
  let creatingAlbum = false;

  // recent/saved songs shown below the main area
  let recentSongs: {
    id: number;
    url: string;
    title?: string | null;
    platform?: string | null;
    duration?: number | null;
    thumbnail?: string | null;
    albumId?: number | null;
  }[] = [];

  async function refreshAlbums() {
    try {
      albums = await getAlbums() as { id: number; name: string; createdAt: number; thumbnail?: string | null }[];
    } catch (err) {
      console.error("refreshAlbums error", err);
    }
  }

  async function handleCreateAlbum() {
    if (!newAlbumName?.trim()) return;
    creatingAlbum = true;
    try {
      const created = await createAlbum(newAlbumName.trim()) as unknown as { id: number; name: string; createdAt: number; thumbnail?: string | null };
      newAlbumName = "";
      await refreshAlbums();
      // optionally auto-select the new album
      if (created?.id) selectedAlbumId = created.id;
      notify("Album created", "success");
    } catch (err) {
      console.error("create album failed", err);
      notify("Failed to create album", "error");
    } finally {
      creatingAlbum = false;
    }
  }

  async function refreshRecentSongs() {
    try {
      // fetch up to 500 recent songs (adjust as you like)
      recentSongs = await getRecentSongs(500) as {
        id: number;
        url: string;
        title?: string | null;
        platform?: string | null;
        duration?: number | null;
        thumbnail?: string | null;
        albumId?: number | null;
      }[];
    } catch (err) {
      console.error("refreshRecentSongs error", err);
    }
  }

  async function handleLoad() {
    await loadUrl(inputUrl);
  }

  async function handleSave() {
    if (!inputUrl?.trim()) return;
    saving = true;
    try {
      const res = await fetch("/api/metadata", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: inputUrl }),
      });
      const metaJson = res.ok ? await res.json() : null;
      const record = {
        url: inputUrl,
        title: metaJson?.meta?.title ?? $info.title ?? null,
        platform: null,
        duration: $info.duration ?? 0,
        albumId: selectedAlbumId ?? null,
        thumbnail: metaJson?.meta?.image ?? $wallpaper ?? null,
      };
      await addSong(record);
      notify("Song saved", "success");
      await refreshRecentSongs();
    } catch (err) {
      notify("Save failed", "error");
      console.error(err);
    } finally {
      saving = false;
    }
  }

  function onKeydown(e: KeyboardEvent) {
    if (e.key === "Enter") handleLoad();
  }

  // load a song into the player from the list
  async function loadSongFromList(s: { url: string }) {
    inputUrl = s.url;
    await loadUrl(inputUrl);
  }

  // delete a song after confirm
  async function handleDeleteSong(id: number) {
    const ok = await confirm("Delete this song?");
    if (!ok) return;
    await deleteSong(id);
    notify("Song deleted", "info");
    await refreshRecentSongs();
  }

  // navigate to album page
  function openAlbum(aid: number) {
    goto(`/albums/${aid}`);
  }

  onMount(async () => {
    await refreshAlbums();
    await refreshRecentSongs();
  });
</script>

<div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
  <!-- Main Player + Recent Songs -->
  <div class="col-span-2 bg-white/5 backdrop-blur-md rounded-2xl p-6 shadow-lg flex flex-col gap-6">
    <div class="flex flex-col lg:flex-row gap-6">
      <!-- Album Art + Play Button -->
      <div class="flex-shrink-0 relative w-full lg:w-64 h-64 rounded-2xl overflow-hidden bg-white/10">
        <img src={$wallpaper ?? "/default_wallpaper.jpg"} alt="art" class="w-full h-full object-cover" />
        <button
          class="absolute inset-0 m-auto w-16 h-16 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center text-lg font-semibold text-white"
          on:click={() => ($statusText === "playing" ? pause() : play())}
        >
          {#if $statusText === "playing"}❚❚{:else}▶{/if}
        </button>
      </div>

      <!-- Controls + Info -->
      <div class="flex-1 flex flex-col justify-between">
        <div>
          <label class="text-sm text-gray-300" for="music-link">Paste a music link</label>
          <div class="mt-3 flex flex-wrap gap-3 items-center">
            <input
              id="music-link"
              type="text"
              bind:value={inputUrl}
              class="flex-1 rounded-lg px-3 py-2 bg-white/10 placeholder-gray-400 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder="https://..."
              on:keydown={onKeydown}
            />

            <button class="px-4 py-2 bg-indigo-600 rounded-lg text-white font-semibold hover:bg-indigo-500 disabled:opacity-50" on:click={handleLoad} disabled={!inputUrl || $loading}>
              {#if $loading}Loading…{:else}Load{/if}
            </button>

            <button class="px-4 py-2 bg-gray-700/30 rounded-lg text-white hover:bg-gray-700/50 disabled:opacity-50" on:click={handleSave} disabled={!inputUrl || saving}>
              {#if saving}Saving…{:else}Save{/if}
            </button>

            <select class="ml-auto bg-white/10 text-gray-500 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500" bind:value={selectedAlbumId}>
              <option value={null}>No album</option>
              {#each albums as a}
                <option value={a.id}>{a.name}</option>
              {/each}
            </select>
          </div>

          <div class="mt-4">
            <div class="text-2xl font-semibold">{$info.title ?? ($info.id ? `Loaded (${String($info.id)})` : "No title")}</div>
            <div class="text-sm text-gray-400 mt-1">Status: {$statusText}</div>
          </div>
        </div>

        <!-- Progress bar -->
        <div class="mt-4">
          <div class="flex items-center gap-4">
            <div class="w-14 text-xs text-gray-400">{fmtTime($info.currentTime)}</div>
            <input
              type="range"
              min="0"
              max={$info.duration || 0}
              value={$info.currentTime}
              on:input={(e) => seekTo(Number((e.target as HTMLInputElement).value))}
              class="flex-1 h-1 rounded-lg accent-indigo-500"
            />
            <div class="w-14 text-right text-xs text-gray-400">{fmtTime($info.duration)}</div>
          </div>
        </div>
      </div>
    </div>

    <!-- Saved Songs -->
    <div>
      <h3 class="text-lg font-semibold mb-2">Saved songs</h3>
      {#if recentSongs.length === 0}
        <div class="text-xs text-gray-400">No saved songs yet</div>
      {/if}
      <div class="grid gap-2">
        {#each recentSongs as s}
          <div class="flex items-center justify-between p-2 hover:bg-white/10 rounded-lg transition">
            <div class="truncate flex items-center gap-3">
              <div class="w-10 h-10 bg-white/10 rounded-lg overflow-hidden flex-shrink-0">
                <img src={s.thumbnail ?? "/default_wallpaper.jpg"} alt="thumb" class="w-full h-full object-cover" />
              </div>
              <div class="truncate">
                <div class="font-medium truncate">{truncateText(s.title ?? s.url, 20)}</div>
                <div class="text-xs text-gray-400">{s.platform ?? "—"} · {fmtTime(s.duration || 0)}</div>
              </div>
            </div>

            <div class="flex gap-2 items-center">
              <button class="px-2 py-1 text-xs bg-indigo-600 rounded hover:bg-indigo-500" on:click={() => loadSongFromList(s)}>Load</button>
              <button class="px-2 py-1 text-xs bg-red-600 rounded hover:bg-red-500" on:click={() => handleDeleteSong(s.id)}>Delete</button>
            </div>
          </div>
        {/each}
      </div>
    </div>
  </div>

  <!-- Sidebar: Library / Albums -->
  <aside class="bg-white/5 backdrop-blur-md rounded-2xl p-4 flex flex-col gap-4 shadow-lg">
    <div class="flex items-center justify-between">
      <h3 class="text-sm font-semibold">Library</h3>
      <a href="/albums" class="text-xs px-2 py-1 bg-white/10 rounded hover:bg-white/20">Open Albums</a>
    </div>

    <!-- Create Album -->
    <div class="mt-2">
      <div class="flex gap-2 items-center">
        <input placeholder="New album name" bind:value={newAlbumName} class="flex-1 px-2 py-1 rounded-lg bg-white/10 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"/>
        <button class="px-3 py-1 bg-indigo-600 rounded-lg text-white hover:bg-indigo-500 disabled:opacity-50" on:click={handleCreateAlbum} disabled={!newAlbumName || creatingAlbum}>
          {#if creatingAlbum}Creating…{:else}Create{/if}
        </button>
      </div>
      <div class="text-xs text-gray-400 mt-2">Created albums appear in the album list and in the select above.</div>
    </div>

    <hr class="border-white/10 my-2"/>

    <div>
      <div class="text-sm font-semibold">Your albums</div>
      <div class="mt-2 flex flex-col gap-2 overflow-y-auto max-h-[40vh]">
        {#if albums.length === 0}
          <div class="text-xs text-gray-400">No albums yet</div>
        {/if}
        {#each albums as a}
          <button class="w-full text-left flex items-center justify-between p-2 hover:bg-white/10 rounded-lg transition" on:click={() => openAlbum(a.id)} aria-label={"Open album " + a.name}>
            <div class="flex items-center gap-3">
              <div class="w-10 h-10 bg-white/10 rounded-lg overflow-hidden flex-shrink-0">
                <img src={a.thumbnail ?? "/default_wallpaper.jpg"} alt="album" class="w-full h-full object-cover" />
              </div>
              <div>
                <div class="font-medium">{a.name}</div>
                <div class="text-xs text-gray-400">{new Date(a.createdAt).toLocaleString()}</div>
              </div>
            </div>
            <div class="text-xs text-gray-400">#{a.id}</div>
          </button>
        {/each}
      </div>
    </div>
  </aside>
</div>
