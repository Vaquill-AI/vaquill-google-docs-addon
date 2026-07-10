<script lang="ts">
  import { FileWarning } from '@lucide/svelte';
  import { docScope } from '../../utils/document-scope';

  interface Props {
    /** Total characters in the open document. */
    totalChars: number;
    /** Character cap this feature sends to the backend. */
    limit: number;
    /** Feature name shown in the message, e.g. "Review" or "Ask". */
    feature: string;
  }

  let { totalChars, limit, feature }: Props = $props();

  let scope = $derived(docScope(totalChars, limit));
</script>

{#if scope.truncated}
  <div class="notice" role="status">
    <FileWarning size={15} />
    <span>
      This document is about {scope.pagesTotal} pages. {feature} reads the first
      ~{scope.pagesSent} pages; content beyond that is not included.
    </span>
  </div>
{/if}

<style>
  .notice {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    padding: 8px 10px;
    background: var(--color-warning-bg);
    color: #8a5300;
    border: 1px solid #f6d38a;
    border-radius: var(--radius-sm);
    font-size: 11px;
    line-height: 1.45;
  }

  .notice :global(svg) {
    flex-shrink: 0;
    margin-top: 1px;
    color: var(--color-warning);
  }
</style>
