<script lang="ts">
  import { MessageCircle, FileCheck, BookOpen, PenLine, Library } from '@lucide/svelte';
  import { uiStore } from '$stores/ui.svelte';
  import type { TabId } from '$shared/types';

  interface Tab {
    id: TabId;
    label: string;
    icon: typeof MessageCircle;
    badge?: number;
  }

  const tabs: Tab[] = [
    { id: 'review', label: 'Review', icon: FileCheck },
    { id: 'playbooks', label: 'Playbooks', icon: BookOpen },
    { id: 'draft', label: 'Draft', icon: PenLine },
    { id: 'library', label: 'Library', icon: Library },
    { id: 'chat', label: 'Ask', icon: MessageCircle }
  ];

  function handleTabClick(tabId: TabId) {
    uiStore.setActiveTab(tabId);
  }
</script>

<div class="tab-nav" role="tablist" aria-label="Vaquill tools">
  {#each tabs as tab}
    {@const isActive = uiStore.activeTab === tab.id}
    <button
      type="button"
      class="tab-btn"
      class:active={isActive}
      onclick={() => handleTabClick(tab.id)}
      aria-selected={isActive}
      role="tab"
      title={tab.label}
    >
      <tab.icon size={16} />
      <span class="tab-label">{tab.label}</span>
    </button>
  {/each}
</div>

<style>
  .tab-nav {
    display: flex;
    background-color: white;
    border-bottom: 1px solid var(--color-gray-200);
  }

  .tab-btn {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
    padding: var(--spacing-sm) 2px;
    font-size: 0.6rem;
    color: var(--color-gray-500);
    border: none;
    background: none;
    cursor: pointer;
    transition: all var(--transition-fast);
    position: relative;
    min-width: 0;
  }

  .tab-btn:hover {
    color: var(--color-gray-700);
    background-color: var(--color-gray-50);
  }

  .tab-btn.active {
    color: var(--color-primary);
    background-color: var(--color-gray-50);
  }

  .tab-btn.active::after {
    content: '';
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    height: 2px;
    background-color: var(--color-primary);
  }

  .tab-label {
    font-weight: 500;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 100%;
  }
</style>
