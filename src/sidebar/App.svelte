<script lang="ts">
  import { onMount } from 'svelte';
  import Header from '$components/Header.svelte';
  import TabNavigation from '$components/TabNavigation.svelte';
  import ChatPanel from '$components/ChatPanel.svelte';
  import ReviewPanel from '$components/ReviewPanel.svelte';
  import PlaybooksPanel from '$components/PlaybooksPanel.svelte';
  import DraftPanel from '$components/DraftPanel.svelte';
  import LibraryPanel from '$components/LibraryPanel.svelte';
  import DocStatusNotice from '$components/ui/DocStatusNotice.svelte';
  import SelectionActions from '$components/SelectionActions.svelte';
  import Toast from '$components/Toast.svelte';
  import { uiStore } from '$stores/ui.svelte';
  import { documentStore } from '$stores/document.svelte';
  import { getDocumentContent, isInGASEnvironment } from '$services/gasClient';

  // Load document on mount
  onMount(async () => {
    if (!isInGASEnvironment()) {
      // Not in GAS environment - show message instead of mock data
      uiStore.setError('This extension must be run from within Google Docs');
      return;
    }

    uiStore.setLoading(true);

    try {
      const content = await getDocumentContent();
      documentStore.setDocument(content);
    } catch (error) {
      console.error('Failed to load document:', error);
      uiStore.setError('Failed to load document content');
    } finally {
      uiStore.setLoading(false);
    }
  });
</script>

<div class="sidebar-container">
  <Header />

  <TabNavigation />

  <main class="panel-container">
    {#if uiStore.isLoading && !documentStore.hasDocument}
      <div class="loading-state">
        <div class="spinner"></div>
        <p class="text-sm text-muted mt-sm">Loading document...</p>
      </div>
    {:else if uiStore.error}
      <div class="error-state">
        <p class="text-danger">{uiStore.error}</p>
        <button class="btn btn-secondary btn-sm mt-md" onclick={() => uiStore.clearError()}>
          Dismiss
        </button>
      </div>
    {:else}
      <DocStatusNotice />
      <SelectionActions />
      {#if uiStore.activeTab === 'chat'}
        <ChatPanel />
      {:else if uiStore.activeTab === 'playbooks'}
        <PlaybooksPanel />
      {:else if uiStore.activeTab === 'draft'}
        <DraftPanel />
      {:else if uiStore.activeTab === 'library'}
        <LibraryPanel />
      {:else}
        <ReviewPanel />
      {/if}
    {/if}
  </main>

  {#if uiStore.toast}
    <Toast
      type={uiStore.toast.type}
      message={uiStore.toast.message}
      onClose={() => uiStore.hideToast()}
    />
  {/if}
</div>

<style>
  .sidebar-container {
    display: flex;
    flex-direction: column;
    height: 100vh;
    width: 100%;
    background-color: #ffffff;
  }

  .panel-container {
    flex: 1;
    overflow-y: auto;
    padding: var(--spacing-md);
  }

  .loading-state,
  .error-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 200px;
    text-align: center;
  }

  .text-danger {
    color: var(--color-danger);
  }
</style>
