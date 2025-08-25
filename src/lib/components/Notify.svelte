<!-- src/lib/components/Notify.svelte -->
<script lang="ts">
  import { toasts } from "$lib/stores/ui";
</script>

<div class="fixed right-4 top-4 z-50 flex flex-col gap-2">
  {#each $toasts as t (t.id)}
    <div class="rounded px-4 py-2 shadow-lg max-w-sm" style="background:rgba(0,0,0,0.6); color: white;">
      {t.text}
    </div>
  {/each}
</div>
