<script lang="ts">
  import { Lock, Layers } from '@lucide/svelte';
  import { documentStore } from '$stores/document.svelte';

  // Read-only (view/comment access) and multi-tab are surfaced together because
  // both change what the user can expect the add-on to do.
  let readOnly = $derived(documentStore.content?.canEdit === false);
  let multiTab = $derived((documentStore.content?.tabCount ?? 1) > 1);
</script>

{#if readOnly || multiTab}
  <div class="doc-status">
    {#if readOnly}
      <div class="doc-note warn" role="status">
        <Lock size={14} />
        <span>You may not have edit access to this document. Vaquill can review and answer questions, but inserting or replacing text may fail.</span>
      </div>
    {/if}
    {#if multiTab}
      <div class="doc-note info" role="status">
        <Layers size={14} />
        <span>This document has multiple tabs. Vaquill reviews all tabs, but jumping to clauses and applying redlines target the active tab.</span>
      </div>
    {/if}
  </div>
{/if}

<style>
  .doc-status {
    margin-bottom: var(--spacing-md);
  }

  .doc-note {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    padding: 8px 10px;
    border-radius: var(--radius-sm);
    font-size: 11px;
    line-height: 1.45;
  }

  .doc-note + .doc-note {
    margin-top: 6px;
  }

  .doc-note :global(svg) {
    flex-shrink: 0;
    margin-top: 1px;
  }

  .doc-note.warn {
    background: var(--color-warning-bg);
    border: 1px solid #f6d38a;
    color: #8a5300;
  }

  .doc-note.warn :global(svg) {
    color: var(--color-warning);
  }

  .doc-note.info {
    background: #e8f0fe;
    border: 1px solid #c6dafc;
    color: #1a4b8f;
  }

  .doc-note.info :global(svg) {
    color: var(--color-primary);
  }
</style>
