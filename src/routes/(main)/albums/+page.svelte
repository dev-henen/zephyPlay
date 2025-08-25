<script lang="ts">
  import { onMount } from "svelte";
  import { getAlbums, createAlbum, deleteAlbum } from "$lib/db";
  import { notify, confirm } from "$lib/stores/ui";
  import { goto } from "$app/navigation";

  let albums: any[] = [];
  let newAlbumName = "";

  async function refresh() {
    albums = await getAlbums();
  }
  async function handleCreate() {
    if (!newAlbumName.trim()) return;
    await createAlbum(newAlbumName.trim());
    newAlbumName = "";
    await refresh();
    notify("Album created", "success");
  }
  async function handleDelete(aid:number) {
    const ok = await confirm("Delete album and its songs?");
    if (!ok) return;
    await deleteAlbum(aid);
    await refresh();
    notify("Album deleted");
  }

  onMount(refresh);
</script>

<div class="glass-card p-6 rounded-2xl">
  <div class="flex items-center gap-2">
    <input placeholder="New album name" bind:value={newAlbumName} class="flex-1 px-2 py-1 rounded bg-white/5" />
    <button class="btn-primary" on:click={handleCreate} disabled={!newAlbumName.trim()}>Create</button>
  </div>

  <div class="mt-4 grid gap-2">
    {#if albums.length === 0}
      <div class="text-xs text-gray-400">No albums yet</div>
    {/if}
    {#each albums as a}
      <div class="flex items-center justify-between p-2 rounded hover:bg-white/3">
        <div>
          <div class="font-medium">{a.name}</div>
          <div class="text-xs text-gray-300">{new Date(a.createdAt).toLocaleString()}</div>
        </div>
        <div class="flex gap-2">
          <button class="px-2 py-1 bg-indigo-600 rounded text-xs" on:click={()=> goto(`/albums/${a.id}`)}>Open</button>
          <button class="px-2 py-1 bg-red-600 rounded text-xs" on:click={()=>handleDelete(a.id)}>Delete</button>
        </div>
      </div>
    {/each}
  </div>
</div>
