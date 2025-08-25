<script lang="ts">
  import { info, wallpaper, play, pause, seekTo, statusText } from "$lib/stores/player";
  import { fmtTime } from "$lib/utils";
  import { onMount } from "svelte";
  import { truncateText } from "$lib";

  let showFullscreen = false;

  $: showFullscreen = $statusText === "playing" && window.innerWidth < 640;

  function closeFullscreen() {
    showFullscreen = false;
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

  function handleResize() {
    if (window.innerWidth >= 640) showFullscreen = false;
  }

  onMount(() => {
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  });
</script>

<!-- Mobile Fullscreen Player -->
{#if showFullscreen}
<div class="fixed inset-0 z-50 bg-black flex flex-col items-center justify-center p-4 text-white sm:hidden">
  <!-- Close Button -->
  <button class="absolute top-4 left-4 p-2" on:click={closeFullscreen} aria-label="Close player">
    <svg xmlns="http://www.w3.org/2000/svg" class="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
    </svg>
  </button>

  <!-- Album Art -->
  <div class="w-64 h-64 rounded-3xl overflow-hidden mb-6">
    <img src={$wallpaper ?? "/default_wallpaper.jpg"} alt="album art" class="w-full h-full object-cover"/>
  </div>

  <!-- Track Info -->
  <div class="text-center mb-6">
    <h2 class="text-2xl font-bold truncate">{truncateText($info.title ?? "No title")}</h2>
    <p class="text-gray-400">{ $statusText === "playing" ? "Playing" : "Paused" }</p>
  </div>

  <!-- Controls -->
  <div class="flex items-center gap-6 mb-6">
    <!-- Back 10s -->
    <button class="p-3 rounded-full bg-white/10 hover:bg-white/20 transition" on:click={skipBack10} aria-label="Back 10s">
      <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 19V6l-8.5 6L12 19zM21 19V6l-8.5 6L21 19z"/>
      </svg>
    </button>

    <!-- Play / Pause -->
    <button class="p-5 rounded-full bg-indigo-600 hover:bg-indigo-500 transition" on:click={() => ($statusText === "playing" ? pause() : play())} aria-label="Play / Pause">
      {#if $statusText === "playing"}
        <svg xmlns="http://www.w3.org/2000/svg" class="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 9v6M14 9v6"/>
        </svg>
      {:else}
        <svg xmlns="http://www.w3.org/2000/svg" class="w-6 h-6" fill="currentColor" viewBox="0 0 20 20">
          <path d="M4.5 3.5v13l11-6.5-11-6.5z"/>
        </svg>
      {/if}
    </button>

    <!-- Forward 10s -->
    <button class="p-3 rounded-full bg-white/10 hover:bg-white/20 transition" on:click={skipForward10} aria-label="Forward 10s">
      <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 19V6l8.5 6L7 19zM18 19V6l-8.5 6L18 19z"/>
      </svg>
    </button>
  </div>

  <!-- Progress -->
  <div class="w-full flex items-center gap-3">
    <span class="text-xs text-gray-400">{fmtTime($info.currentTime)}</span>
    <input type="range" min="0" max={$info.duration || 0} value={$info.currentTime} on:input={onSeek} class="flex-1 h-1 rounded-lg accent-indigo-500"/>
    <span class="text-xs text-gray-400">{fmtTime($info.duration)}</span>
  </div>
</div>
{/if}

<!-- Desktop / Large Screen Player -->
<div class="fixed bottom-4 left-1/2 transform -translate-x-1/2 w-[calc(100%-2rem)] max-w-[1100px] z-50 hidden sm:block">
  <div class="bg-white/5 backdrop-blur-md rounded-3xl p-3 flex items-center gap-4 shadow-lg -ml-5">
    <!-- Album Art -->
    <div class="w-16 h-16 rounded-2xl overflow-hidden flex-shrink-0 bg-white/10">
      <img src={$wallpaper ?? "/default_wallpaper.jpg"} alt="mini art" class="w-full h-full object-cover" />
    </div>

    <!-- Track Info + Controls -->
    <div class="flex-1 flex flex-col gap-2">
      <div class="flex items-center justify-between gap-4">
        <div class="truncate">
          <div class="font-medium truncate text-white">{$info.title ?? "No title"}</div>
          <div class="text-xs text-gray-300">{$info.id ? ($statusText === "playing" ? "Playing" : "Loaded") : "Stopped"}</div>
        </div>

        <!-- Control Buttons -->
        <div class="flex items-center gap-3">
          <!-- Back 10s -->
          <button class="p-2 rounded-lg bg-white/10 hover:bg-white/20 transition" on:click={skipBack10} aria-label="Back 10s">
            <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 19V6l-8.5 6L12 19zM21 19V6l-8.5 6L21 19z"/>
            </svg>
          </button>

          <!-- Play / Pause -->
          <button class="p-3 rounded-full bg-indigo-600 hover:bg-indigo-500 transition text-white" on:click={() => ($statusText === "playing" ? pause() : play())} aria-label="Play / Pause">
            {#if $statusText === "playing"}
              <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 9v6M14 9v6"/>
              </svg>
            {:else}
              <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5 ml-0.5" fill="currentColor" viewBox="0 0 20 20">
                <path d="M4.5 3.5v13l11-6.5-11-6.5z"/>
              </svg>
            {/if}
          </button>

          <!-- Forward 10s -->
          <button class="p-2 rounded-lg bg-white/10 hover:bg-white/20 transition" on:click={skipForward10} aria-label="Forward 10s">
            <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 19V6l8.5 6L7 19zM18 19V6l-8.5 6L18 19z"/>
            </svg>
          </button>
        </div>
      </div>

      <!-- Progress Bar -->
      <div class="flex items-center gap-3 mt-2">
        <div class="text-xs text-gray-300 w-10">{fmtTime($info.currentTime)}</div>
        <input type="range" min="0" max={$info.duration || 0} value={$info.currentTime} on:input={onSeek} disabled={!$info || !$info.duration} class="flex-1 h-1 rounded-lg accent-indigo-500"/>
        <div class="text-xs text-gray-300 w-10 text-right">{fmtTime($info.duration)}</div>
      </div>
    </div>
  </div>
</div>
