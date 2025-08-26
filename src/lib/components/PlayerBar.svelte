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
  import { page } from "$app/stores";
  import { truncateText } from "$lib";
  import { goto } from "$app/navigation";

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

<!-- Desktop / Large Screen Player -->
{#if $info.id && $page.url.pathname !== "/play"}
  <div
    class="fixed bottom-4 left-1/2 transform -translate-x-1/2 w-[calc(100%-2rem)] max-w-[1100px] z-50"
  >
    <div
      class="bg-white/5 backdrop-blur-md rounded-3xl p-3 flex items-center gap-4 shadow-lg md:-ml-5"
    >
      <!-- Album Art (click to open fullscreen on mobile) -->
      <button
        on:click={() => {
          goto("/play");
        }}
        aria-label="Open fullscreen player"
      >
        <div
          class="w-16 h-16 rounded-2xl overflow-hidden flex-shrink-0 bg-white/10"
        >
          <img
            src={$wallpaper ?? "/default_wallpaper.jpg"}
            alt="mini art"
            class="w-full h-full object-cover"
          />
        </div>
      </button>

      <!-- Track Info + Controls -->
      <div class="flex-1 flex flex-col gap-2">
        <div class="flex items-center justify-between gap-4">
          <div
            class="truncate"
            on:click={() => {
              goto(`/play`);
            }}
            on:keydown={() => {}}
            role="button"
            tabindex="0"
          >
            <div class="font-medium truncate text-white md:hidden">
              {truncateText($info.title ?? "No title", 20)}
            </div>
            <div class="font-medium truncate text-white hidden md:block">
              {truncateText($info.title ?? "No title", 60)}
            </div>
            <div class="text-xs text-gray-300">
              {$statusText === "playing" ? "Playing" : "Loaded"}
            </div>
          </div>

          <!-- Control Buttons -->
          <div class="flex items-center gap-3">
            <!-- Back 10s -->
            <button
              class="p-2 rounded-lg bg-white/10 hover:bg-white/20 transition hidden md:inline-block"
              on:click={skipBack10}
              aria-label="Back 10s"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 16 16"
                fill="currentColor"
                class="size-4"
              >
                <path
                  d="M8.5 4.75a.75.75 0 0 0-1.107-.66l-6 3.25a.75.75 0 0 0 0 1.32l6 3.25a.75.75 0 0 0 1.107-.66V8.988l5.393 2.921A.75.75 0 0 0 15 11.25v-6.5a.75.75 0 0 0-1.107-.66L8.5 7.013V4.75Z"
                />
              </svg>
            </button>

            <!-- Play / Pause -->
            <button
              class="p-3 rounded-full bg-indigo-600 hover:bg-indigo-500 transition text-white"
              on:click={() => ($statusText === "playing" ? pause() : play())}
              aria-label="Play / Pause"
            >
              {#if $statusText === "playing"}
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
                    d="M10 9v6M14 9v6"
                  />
                </svg>
              {:else}
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  class="w-5 h-5 ml-0.5"
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
                  <path d="M4.5 3.5v13l11-6.5-11-6.5z" />
                </svg>
              {/if}
            </button>

            <!-- Forward 10s -->
            <button
              class="p-2 rounded-lg bg-white/10 hover:bg-white/20 transition hidden md:inline-block"
              on:click={skipForward10}
              aria-label="Forward 10s"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 16 16"
                fill="currentColor"
                class="size-4"
              >
                <path
                  d="M2.53 3.956A1 1 0 0 0 1 4.804v6.392a1 1 0 0 0 1.53.848l5.113-3.196c.16-.1.279-.233.357-.383v2.73a1 1 0 0 0 1.53.849l5.113-3.196a1 1 0 0 0 0-1.696L9.53 3.956A1 1 0 0 0 8 4.804v2.731a.992.992 0 0 0-.357-.383L2.53 3.956Z"
                />
              </svg>
            </button>
          </div>
        </div>

        <!-- Progress Bar -->
        <div class="flex items-center gap-3 mt-2">
          <div class="text-xs text-gray-300 w-10">
            {fmtTime($info.currentTime)}
          </div>
          <input
            type="range"
            min="0"
            max={$info.duration || 0}
            value={$info.currentTime}
            on:input={onSeek}
            disabled={!$info || !$info.duration}
            class="flex-1 h-1 rounded-lg accent-indigo-500"
          />
          <div class="text-xs text-gray-300 w-10 text-right">
            {fmtTime($info.duration)}
          </div>
        </div>
      </div>
    </div>
  </div>
{/if}
