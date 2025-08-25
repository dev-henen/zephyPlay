<script lang="ts">
  import PlayerHost from "$lib/components/PlayerHost.svelte";
  import PlayerBar from "$lib/components/PlayerBar.svelte";
  import Notify from "$lib/components/Notify.svelte";
  import Confirm from "$lib/components/Confirm.svelte";

  import { searchQuery, searchResults, performSearch, clearSearch } from "$lib/stores/ui";
  import { loadUrl } from "$lib/stores/player";
  import { goto } from "$app/navigation";

  async function onClickSong(song: any) {
    if (!song?.url) return;
    await loadUrl(song.url);
    clearSearch();
  }

  function onClickAlbum(album: any) {
    if (!album?.id) return;
    goto(`/albums/${album.id}`);
    clearSearch();
  }

  function onInput(e: Event) {
    const v = (e.target as HTMLInputElement).value;
    performSearch(v);
  }

  function onKeydown(e: KeyboardEvent) {
    if (e.key === "Escape") clearSearch();
    if (e.key === "Enter") {
      const { songs, albums } = $searchResults;
      if (songs?.length) onClickSong(songs[0]);
      else if (albums?.length) onClickAlbum(albums[0]);
    }
  }
</script>

<div class="h-screen flex items-start justify-center bg-slate-900 text-white overflow-x-hidden overflow-y-auto">
  <!-- Blurred background -->
  <div class="absolute inset-0 bg-center bg-cover bg-fixed blur-lg saturate-90" style="background-image: url('/background.png')" aria-hidden="true"></div>
  <div class="absolute inset-0 bg-gradient-to-b from-black/80 to-black" aria-hidden="true"></div>

  <div class="z-10 w-full max-w-6xl p-6 mb-32">
    <!-- Header -->
    <div class="flex items-center justify-between mb-6">
      <div class="text-xl font-semibold">
        <a href="/" class="text-white hover:underline">zephyPlay</a>
      </div>

      <!-- Search box -->
      <div class="relative w-1/3">
        <input
          type="search"
          class="w-full rounded-xl px-4 py-2 bg-white/10 backdrop-blur-md text-white placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          placeholder="Search songs or albums..."
          bind:value={$searchQuery}
          on:input={onInput}
          on:keydown={onKeydown}
          aria-label="Search songs and albums"
        />

        {#if ($searchResults.songs.length > 0) || ($searchResults.albums.length > 0)}
          <div class="absolute right-0 left-0 mt-2 bg-black/50 backdrop-blur-md border border-white/10 rounded-xl shadow-lg max-h-72 overflow-auto z-50">
            <!-- Albums -->
            {#if $searchResults.albums.length > 0}
              <div class="p-2 border-b border-white/10">
                <div class="text-xs text-gray-300 uppercase font-semibold mb-1 px-1">Albums</div>
                {#each $searchResults.albums as a}
                  <button
                    class="w-full text-left px-2 py-1 hover:bg-white/10 rounded flex items-center justify-between"
                    on:click={() => onClickAlbum(a)}
                  >
                    <div class="flex items-center gap-2 truncate">
                      <img src={a.thumbnail ?? "/default_wallpaper.jpg"} alt="album" class="w-8 h-8 rounded object-cover flex-shrink-0" />
                      <div class="truncate">
                        <div class="text-sm truncate">{a.name}</div>
                        <div class="text-xs text-gray-400">{new Date(a.createdAt).toLocaleString()}</div>
                      </div>
                    </div>
                    <div class="text-xs text-gray-400 ml-2">#{a.id}</div>
                  </button>
                {/each}
              </div>
            {/if}

            <!-- Songs -->
            {#if $searchResults.songs.length > 0}
              <div class="p-2">
                <div class="text-xs text-gray-300 uppercase font-semibold mb-1 px-1">Songs</div>
                {#each $searchResults.songs as s}
                  <button
                    class="w-full text-left px-2 py-1 hover:bg-white/10 rounded flex items-center justify-between"
                    on:click={() => onClickSong(s)}
                  >
                    <div class="flex items-center gap-2 truncate">
                      <img src={s.thumbnail ?? "/default_wallpaper.jpg"} alt="thumb" class="w-8 h-8 rounded object-cover flex-shrink-0" />
                      <div class="truncate">
                        <div class="text-sm truncate">{s.title ?? s.url}</div>
                        <div class="text-xs text-gray-400">{s.platform ?? "—"} · {Math.floor((s.duration ?? 0) / 60)}:{String(Math.floor((s.duration ?? 0) % 60)).padStart(2, "0")}</div>
                      </div>
                    </div>
                    <div class="text-xs text-gray-400 ml-2">#{s.id}</div>
                  </button>
                {/each}
              </div>
            {/if}
          </div>
        {/if}
      </div>
    </div>

    <slot />
  </div>

  <PlayerHost />
  <PlayerBar />
  <Notify />
  <Confirm />
</div>
