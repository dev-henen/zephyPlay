<script lang="ts">
  import { createEventDispatcher, onMount, onDestroy } from "svelte";
  import { fmtTime } from "$lib/utils";
  import { truncateText } from "$lib";
  import { loadUrl, play, pause, statusText, url } from "$lib/stores/player";
  import { deleteSong } from "$lib/db";
  import { notify } from "$lib/stores/ui";
  import { goto } from "$app/navigation";

  export let song: any;

  const dispatch = createEventDispatcher();
  let showOptions = false;
  let optionsRef: HTMLDivElement;

  function handleLoad() {
    dispatch("load", song);
    showOptions = false;
  }

  function handlePlay() {
    dispatch("play", song);
    showOptions = false;
  }

  // Close the popup when clicking outside
  function handleClickOutside(event: MouseEvent) {
    if (optionsRef && !optionsRef.contains(event.target as Node)) {
      showOptions = false;
    }
  }

  onMount(() => {
    document.addEventListener("click", handleClickOutside);
  });

  onDestroy(() => {
    document.removeEventListener("click", handleClickOutside);
  });

  let element: HTMLDivElement;
  async function refreshRecentSongs() {
    try {
      element.remove();
    } catch (err) {
      console.error("refreshRecentSongs error", err);
    }
  }

  // delete a song after confirm
  async function handleDeleteSong(id: number) {
    const ok = await confirm("Delete this song?");
    if (!ok) return;
    await deleteSong(id);
    notify("Song deleted", "info");
    await refreshRecentSongs();
  }
</script>

<div
  class="flex items-center justify-between p-2 hover:bg-white/10 rounded-lg transition relative"
  role="button"
  tabindex="0"
  aria-label={"Open song " + (song.title ?? song.url)}
  on:click={async () => {
    goto(`/play`);
    if ($url !== song.url) {
      await loadUrl(song.url);
    }
    play();
  }}
  on:keydown={() => {}}
  bind:this={element}
>
  <!-- Song Info -->
  <div class="truncate flex items-center gap-3">
    <div class="w-10 h-10 bg-white/10 rounded-lg overflow-hidden flex-shrink-0">
      <img
        src={song.thumbnail ?? "/default_wallpaper.jpg"}
        alt="thumb"
        class="w-full h-full object-cover"
      />
    </div>
    <div class="truncate">
      <div class="font-medium truncate">
        {truncateText(song.title ?? song.url, 20)}
      </div>
      <div class="text-xs text-gray-400">
        {song.platform ?? "—"} · {fmtTime(song.duration || 0)}
      </div>
    </div>
  </div>

  <!-- Options Button -->
  <div class="relative flex items-center gap-2">
    <div>
      <button
        class="w-6 h-6 rounded-full bg-white/20 flex items-center justify-center text-sm text-white"
        on:click={async () => {
          if ($url !== song.url) {
            await loadUrl(song.url);
          }
          $statusText === "playing" && $url === song.url ? pause() : play();
        }}
      >
        {#if $statusText === "playing" && $url === song.url}
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 20 20"
            fill="currentColor"
            class="size-5"
          >
            <path
              fill-rule="evenodd"
              d="M2 10a8 8 0 1 1 16 0 8 8 0 0 1-16 0Zm5-2.25A.75.75 0 0 1 7.75 7h.5a.75.75 0 0 1 .75.75v4.5a.75.75 0 0 1-.75.75h-.5a.75.75 0 0 1-.75-.75v-4.5Zm4 0a.75.75 0 0 1 .75-.75h.5a.75.75 0 0 1 .75.75v4.5a.75.75 0 0 1-.75.75h-.5a.75.75 0 0 1-.75-.75v-4.5Z"
              clip-rule="evenodd"
            />
          </svg>
        {:else}
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 20 20"
            fill="currentColor"
            class="size-5"
          >
            <path
              d="M6.3 2.84A1.5 1.5 0 0 0 4 4.11v11.78a1.5 1.5 0 0 0 2.3 1.27l9.344-5.891a1.5 1.5 0 0 0 0-2.538L6.3 2.841Z"
            />
          </svg>
        {/if}
      </button>
    </div>

    <button
      class="p-1 hover:bg-white/10 rounded"
      aria-label="Options"
      on:click|stopPropagation={() => (showOptions = !showOptions)}
    >
      <!-- Three vertical dots -->
      <svg
        xmlns="http://www.w3.org/2000/svg"
        fill="currentColor"
        viewBox="0 0 20 20"
        class="w-5 h-5"
      >
        <path
          d="M10 3a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3zm0 5.5a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3zm0 5.5a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3z"
        />
      </svg>
    </button>

    {#if showOptions}
      <div
        bind:this={optionsRef}
        class="absolute right-0 mt-1 w-24 bg-gray-800 rounded shadow-lg flex flex-col z-10"
      >
        <button
          class="px-3 py-1 text-left hover:bg-gray-700"
          on:click={handleLoad}>Load</button
        >
        <button
          class="px-3 py-1 text-left hover:bg-gray-700"
          on:click={handlePlay}>Play</button
        >
        <button
          class="px-3 py-1 text-left hover:bg-gray-700 text-red-500"
          on:click={() => handleDeleteSong(song.id)}>Delete</button
        >
      </div>
    {/if}
  </div>
</div>
