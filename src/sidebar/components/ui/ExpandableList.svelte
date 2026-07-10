<script lang="ts">
  import { ChevronDown, ChevronUp } from '@lucide/svelte';

  interface Props {
    items: any[];
    renderHeader: (item: any, index: number) => any;
    renderDetails: (item: any, index: number) => any;
  }

  let { items, renderHeader, renderDetails }: Props = $props();
  let expandedItems = $state<Set<string | number>>(new Set());

  function getKey(item: any, index: number): string | number {
    return item?.id ?? index;
  }

  function toggleExpand(key: string | number) {
    const newSet = new Set(expandedItems);
    if (newSet.has(key)) {
      newSet.delete(key);
    } else {
      newSet.add(key);
    }
    expandedItems = newSet;
  }
</script>

<div class="expandable-list">
  {#each items as item, index (getKey(item, index))}
    {@const key = getKey(item, index)}
    {@const isExpanded = expandedItems.has(key)}
    <div class="list-item" class:expanded={isExpanded}>
      <button
        class="item-header"
        onclick={() => toggleExpand(key)}
        aria-expanded={isExpanded}
        aria-controls="expandable-details-{key}"
      >
        <div class="item-content">
          {@render renderHeader(item, index)}
        </div>
        <div class="expand-icon">
          {#if isExpanded}
            <ChevronUp size={16} />
          {:else}
            <ChevronDown size={16} />
          {/if}
        </div>
      </button>
      {#if isExpanded}
        <div class="item-details" id="expandable-details-{key}">
          {@render renderDetails(item, index)}
        </div>
      {/if}
    </div>
  {/each}
</div>

<style>
  .expandable-list {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .list-item {
    border: 1px solid var(--color-gray-200, #e8eaed);
    border-radius: 6px;
    overflow: hidden;
  }

  .item-header {
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
    padding: 10px;
    background: white;
    border: none;
    cursor: pointer;
    text-align: left;
  }

  .item-header:hover {
    background: var(--color-gray-50, #f8f9fa);
  }

  .item-content {
    flex: 1;
    min-width: 0;
  }

  .expand-icon {
    flex-shrink: 0;
    color: var(--color-gray-400, #bdc1c6);
  }

  .item-details {
    padding: 10px;
    background: var(--color-gray-50, #f8f9fa);
    border-top: 1px solid var(--color-gray-200, #e8eaed);
  }
</style>
