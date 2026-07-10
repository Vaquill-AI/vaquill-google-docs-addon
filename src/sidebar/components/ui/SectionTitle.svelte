<script lang="ts">
  interface Props {
    children?: any;
    count?: number;
  }

  let { children, count }: Props = $props();
</script>

<h3 class="section-title">
  {@render children?.()}
  {#if count !== undefined}
    <span class="count">({count})</span>
  {/if}
</h3>

<style>
  .section-title {
    font-size: 13px;
    font-weight: 600;
    color: var(--color-gray-900, #202124);
    margin: 0;
    padding-top: 8px;
    border-top: 1px solid var(--color-gray-200, #e8eaed);
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .count {
    font-weight: 400;
    color: var(--color-gray-500, #5f6368);
  }
</style>
