<script lang="ts">
  import {
    info,
    wallpaper,
    play,
    pause,
    seekTo,
    statusText,
  } from "$lib/stores/player";
  import { fmtTime } from "$lib/utils";
  import { truncateText } from "$lib";

  function closeFullscreen() {
    window.history.back();
  }

  function onSeek(e: Event) {
    const v = Number((e.target as HTMLInputElement).value || 0);
    seekTo(v);
  }

  function skipBack10() {
    const t = $info.currentTime ?? 0;
    seekTo(Math.max(0, t - 10));
  }

  function skipForward10() {
    const t = $info.currentTime ?? 0;
    seekTo(Math.min($info.duration ?? 0, t + 10));
  }
</script>

<div class="absolute inset-0 bg-black flex flex-col items-center justify-center p-4 text-white">
  <!-- Close Button -->
  <button
    class="absolute top-4 left-4 p-2"
    on:click={closeFullscreen}
    aria-label="Close player"
  >
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="size-5">
      <path fill-rule="evenodd" d="M5.22 8.22a.75.75 0 0 1 1.06 0L10 11.94l3.72-3.72a.75.75 0 1 1 1.06 1.06l-4.25 4.25a.75.75 0 0 1-1.06 0L5.22 9.28a.75.75 0 0 1 0-1.06Z" clip-rule="evenodd" />
    </svg>
  </button>

  <!-- Album Art -->
  <div class="w-64 h-64 rounded-3xl overflow-hidden mb-6 relative">
    {#if $wallpaper}
      <img
        src={$wallpaper}
        alt="album art"
        class="w-full h-full object-cover"
      />
    {:else}
      <div class="w-full h-full bg-gray-700 animate-pulse"></div>
    {/if}
  </div>

  <!-- Track Info -->
  <div class="text-center mb-6">
    <h2 class="text-2xl font-bold">
      {#if $info?.title}
        {truncateText($info.title)}
      {:else}
        <span class="bg-gray-600 h-6 w-48 inline-block rounded animate-pulse"></span>
      {/if}
    </h2>
    <p class="text-gray-400">
      {#if $statusText === "playing"}
        Playing
      {:else if $info?.id}
        Paused
      {:else}
        <span class="inline-block bg-gray-600 h-4 w-24 rounded animate-pulse"></span>
      {/if}
    </p>
  </div>

  <!-- Controls -->
  <div class="flex items-center gap-6 mb-6">
    <!-- Back 10s -->
    <button class="p-3 rounded-full bg-white/10 hover:bg-white/20 transition" on:click={skipBack10} aria-label="Back 10s">
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" class="size-4">
        <path d="M8.5 4.75a.75.75 0 0 0-1.107-.66l-6 3.25a.75.75 0 0 0 0 1.32l6 3.25a.75.75 0 0 0 1.107-.66V8.988l5.393 2.921A.75.75 0 0 0 15 11.25v-6.5a.75.75 0 0 0-1.107-.66L8.5 7.013V4.75Z"/>
      </svg>
    </button>

    <!-- Play / Pause -->
    <button class="p-5 rounded-full bg-indigo-600 hover:bg-indigo-500 transition" on:click={() => ($statusText === "playing" ? pause() : play())} aria-label="Play / Pause">
      {#if $info?.id}
        {#if $statusText === "playing"}
          <svg xmlns="http://www.w3.org/2000/svg" class="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 9v6M14 9v6"/>
          </svg>
        {:else}
          <svg xmlns="http://www.w3.org/2000/svg" class="w-6 h-6" fill="currentColor" viewBox="0 0 20 20">
            <path d="M4.5 3.5v13l11-6.5-11-6.5z"/>
          </svg>
        {/if}
      {:else}
        <!-- Blinking placeholder circle -->
        <div class="w-6 h-6 rounded-full bg-gray-600 animate-pulse"></div>
      {/if}
    </button>

    <!-- Forward 10s -->
    <button class="p-3 rounded-full bg-white/10 hover:bg-white/20 transition" on:click={skipForward10} aria-label="Forward 10s">
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" class="size-4">
        <path d="M2.53 3.956A1 1 0 0 0 1 4.804v6.392a1 1 0 0 0 1.53.848l5.113-3.196c.16-.1.279-.233.357-.383v2.73a1 1 0 0 0 1.53.849l5.113-3.196a1 1 0 0 0 0-1.696L9.53 3.956A1 1 0 0 0 8 4.804v2.731a.992.992 0 0 0-.357-.383L2.53 3.956Z"/>
      </svg>
    </button>
  </div>

  <!-- Progress -->
  <div class="w-full flex items-center gap-3">
    <span class="text-xs text-gray-400">
      {#if $info?.currentTime}
        {fmtTime($info.currentTime)}
      {:else}
        <span class="inline-block w-6 h-2 bg-gray-600 rounded animate-pulse"></span>
      {/if}
    </span>
    <input
      type="range"
      min="0"
      max={$info?.duration || 0}
      value={$info?.currentTime || 0}
      on:input={onSeek}
      class="flex-1 h-1 rounded-lg accent-indigo-500"
    />
    <span class="text-xs text-gray-400">
      {#if $info?.duration}
        {fmtTime($info.duration)}
      {:else}
        <span class="inline-block w-6 h-2 bg-gray-600 rounded animate-pulse"></span>
      {/if}
    </span>
  </div>
</div>
