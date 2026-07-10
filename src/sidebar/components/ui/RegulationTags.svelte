<script lang="ts">
  interface Props {
    regulations?: string[];
  }

  let { regulations }: Props = $props();
</script>

{#if (regulations ?? []).length > 0}
  <div class="regulations-tags">
    {#each regulations ?? [] as reg}
      <span class="reg-tag">{reg}</span>
    {/each}
  </div>
{:else}
  <p class="regulations-empty">No regulations identified.</p>
{/if}

<style>
  .regulations-tags {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }

  .reg-tag {
    padding: 4px 8px;
    background: #e8f0fe;
    color: var(--color-primary, #1a73e8);
    border-radius: 4px;
    font-size: 11px;
    font-weight: 500;
  }

  .regulations-empty {
    margin: 0;
    font-size: 11px;
    color: var(--color-gray-500, #5f6368);
  }
</style>
