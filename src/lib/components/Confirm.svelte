<!-- src/lib/components/Confirm.svelte -->
<script lang="ts">
  import { confirmState, clearConfirm } from "$lib/stores/ui";

  function onYes() {
    $confirmState?.resolve?.(true);
    clearConfirm();
  }
  function onNo() {
    $confirmState?.resolve?.(false);
    clearConfirm();
  }
</script>

{#if $confirmState}
  <div class="fixed inset-0 z-50 flex items-center justify-center">
    <div class="absolute inset-0 bg-black/60"></div>
    <div class="bg-white rounded p-6 z-10 max-w-md w-full">
      <div class="text-lg font-semibold mb-3">Confirm</div>
      <div class="mb-4 text-sm text-gray-700">{$confirmState.text}</div>
      <div class="flex justify-end gap-2">
        <button class="px-3 py-1 rounded bg-gray-200" on:click={onNo}>Cancel</button>
        <button class="px-3 py-1 rounded bg-red-600 text-white" on:click={onYes}>Confirm</button>
      </div>
    </div>
  </div>
{/if}
