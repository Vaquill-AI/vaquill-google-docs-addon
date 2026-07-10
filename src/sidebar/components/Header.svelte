<script lang="ts">
  import { Scale } from '@lucide/svelte';
  import { documentStore } from '$stores/document.svelte';
  import SettingsMenu from './SettingsMenu.svelte';
</script>

<header class="header">
  <div class="header-top">
    <div class="logo">
      <Scale size={20} strokeWidth={2} />
      <span class="logo-text">Vaquill</span>
    </div>
    <div class="header-actions">
      {#if documentStore.hasDocument}
        <span class="doc-info text-xs text-muted">
          {documentStore.wordCount} words
        </span>
      {/if}
      <SettingsMenu />
    </div>
  </div>
</header>

<style>
  /* Native Google Docs sidebars use a white surface, not a colored bar. */
  .header {
    background-color: #ffffff;
    color: var(--color-gray-800);
    padding: var(--spacing-md);
    border-bottom: 1px solid var(--color-gray-300);
  }

  .header-top {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .logo {
    display: flex;
    align-items: center;
    gap: var(--spacing-xs);
    color: var(--color-primary);
  }

  .logo-text {
    font-size: 1rem;
    font-weight: 500;
    color: var(--color-gray-800);
  }

  .header-actions {
    display: flex;
    align-items: center;
    gap: var(--spacing-sm);
  }

  .doc-info {
    color: var(--color-gray-600);
  }
</style>
