<script lang="ts">
  import { page } from '$app/stores';
  import { onMount } from "svelte";
  import { getSongsByAlbum, deleteSong } from "$lib/db";
  import { loadUrl } from "$lib/stores/player";
  import { notify, confirm } from "$lib/stores/ui";
  import { fmtTime } from "$lib/utils";

  let songs = [];
  $: albumId = Number($page.params.id);

  async function refresh() {
    songs = await getSongsByAlbum(albumId);
  }

  async function loadSong(s) {
    await loadUrl(s.url);
  }

  async function handleDelete(id:number) {
    const ok = await confirm("Delete this song?");
    if (!ok) return;
    await deleteSong(id);
    await refresh();
    notify("Song deleted", "info");
  }

  onMount(refresh);
</script>

<div class="glass-card p-6 rounded-2xl">
  <h2 class="text-lg font-semibold">Songs</h2>
  <div class="mt-4">
    {#if songs.length === 0}
      <div class="text-xs text-gray-400">No songs in this album</div>
    {/if}
    {#each songs as s}
      <div class="flex items-center justify-between p-2 hover:bg-white/2 rounded text-sm">
        <div class="truncate">
          <div class="font-medium truncate">{s.title ?? s.url}</div>
          <div class="text-xs text-gray-300">{s.platform ?? "—"} · {fmtTime(s.duration || 0)}</div>
        </div>
        <div class="flex gap-2">
          <button class="px-2 py-1 bg-indigo-600 rounded text-xs" on:click={()=>loadSong(s)}>Load</button>
          <button class="px-2 py-1 bg-red-600 rounded text-xs" on:click={()=>handleDelete(s.id)}>Delete</button>
        </div>
      </div>
    {/each}
  </div>
</div>
