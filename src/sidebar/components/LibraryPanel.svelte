<script lang="ts">
  import { onMount } from 'svelte';
  import { FileText, MessageSquare, Plus, Search, ArrowUpRight } from '@lucide/svelte';
  import { listClauses, listPrompts, insertTextAtCursor } from '$services/gasClient';
  import { chatStore } from '$stores/chat.svelte';
  import { uiStore } from '$stores/ui.svelte';
  import { documentStore } from '$stores/document.svelte';
  import InfoTip from './ui/InfoTip.svelte';
  import type { LibraryClause, LibraryPrompt } from '$shared/types';

  let view = $state<'clauses' | 'prompts'>('clauses');
  let clauses = $state<LibraryClause[]>([]);
  let prompts = $state<LibraryPrompt[]>([]);
  let loading = $state(true);
  let error = $state<string | null>(null);
  let query = $state('');
  let inserting = $state<string | null>(null);

  onMount(load);

  async function load() {
    loading = true;
    error = null;
    try {
      const [cl, pr] = await Promise.all([
        listClauses().catch(() => [] as LibraryClause[]),
        listPrompts().catch(() => [] as LibraryPrompt[])
      ]);
      clauses = cl;
      prompts = pr;
    } catch (err) {
      error = err instanceof Error ? err.message : 'Could not load the library.';
    } finally {
      loading = false;
    }
  }

  let filteredClauses = $derived(
    clauses.filter((c) => {
      if (!query.trim()) return true;
      const q = query.toLowerCase();
      return (
        c.name.toLowerCase().includes(q) ||
        (c.clauseType || '').toLowerCase().includes(q) ||
        (c.tags || []).some((t) => t.toLowerCase().includes(q))
      );
    })
  );

  let filteredPrompts = $derived(
    prompts.filter((p) => !query.trim() || p.title.toLowerCase().includes(query.toLowerCase()))
  );

  async function insertClause(clause: LibraryClause) {
    if (inserting) return;
    if (documentStore.content?.canEdit === false) {
      uiStore.showToast('error', 'You do not have edit access to insert a clause here.');
      return;
    }
    inserting = clause.id;
    try {
      await insertTextAtCursor(clause.content);
      uiStore.showToast('success', 'Clause inserted at your cursor');
    } catch (err) {
      uiStore.showToast('error', err instanceof Error ? err.message : 'Could not insert the clause.');
    } finally {
      inserting = null;
    }
  }

  function askPrompt(prompt: LibraryPrompt) {
    chatStore.setInput(prompt.body);
    uiStore.setActiveTab('chat');
    uiStore.showToast('success', 'Added to Ask');
  }

  function clauseLabel(t: string): string {
    return (t || '').replace(/_/g, ' ');
  }
</script>

<div class="library">
  <div class="intro-row">
    <p class="intro">Insert a saved clause at your cursor, or send a saved prompt to Ask.</p>
    <InfoTip
      align="right"
      text="Clauses insert their text where your cursor sits in the document. Prompts open the Ask tab prefilled so you can run them against this contract. Use search to filter the current list."
    />
  </div>

  <div class="toggle" role="tablist">
    <button class="opt" class:active={view === 'clauses'} role="tab" aria-selected={view === 'clauses'} onclick={() => (view = 'clauses')}>
      <FileText size={13} /> Clauses
    </button>
    <button class="opt" class:active={view === 'prompts'} role="tab" aria-selected={view === 'prompts'} onclick={() => (view = 'prompts')}>
      <MessageSquare size={13} /> Prompts
    </button>
  </div>

  <div class="search">
    <Search size={14} />
    <input type="text" placeholder={view === 'clauses' ? 'Search clauses' : 'Search prompts'} bind:value={query} />
  </div>

  {#if loading}
    <div class="state">
      <div class="spinner"></div>
      <span>Loading library...</span>
    </div>
  {:else if error}
    <div class="state error">
      <span>{error}</span>
      <button class="retry" onclick={load}>Try again</button>
    </div>
  {:else if view === 'clauses'}
    {#if filteredClauses.length === 0}
      <div class="empty">No clauses{query ? ' match your search' : ' yet'}.</div>
    {:else}
      <div class="list">
        {#each filteredClauses as clause}
          <div class="card">
            <div class="card-body">
              <div class="card-head">
                <span class="name">{clause.name}</span>
                <span class="chip">{clauseLabel(clause.clauseType)}</span>
              </div>
              <p class="preview">{clause.content}</p>
            </div>
            <button class="ins" disabled={inserting === clause.id} onclick={() => insertClause(clause)}>
              <Plus size={13} />
              {inserting === clause.id ? 'Inserting...' : 'Insert'}
            </button>
          </div>
        {/each}
      </div>
    {/if}
  {:else if filteredPrompts.length === 0}
    <div class="empty">No prompts{query ? ' match your search' : ' saved yet'}.</div>
  {:else}
    <div class="list">
      {#each filteredPrompts as prompt}
        <div class="card">
          <div class="card-body">
            <div class="card-head">
              <span class="name">{prompt.title}</span>
              {#if prompt.category}<span class="chip subtle">{prompt.category}</span>{/if}
            </div>
            <p class="preview">{prompt.body}</p>
          </div>
          <button class="ins" onclick={() => askPrompt(prompt)}>
            <ArrowUpRight size={13} /> Ask
          </button>
        </div>
      {/each}
    </div>
  {/if}
</div>

<style>
  .library {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .intro-row {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 6px;
  }

  .intro {
    font-size: 12px;
    line-height: 1.5;
    color: var(--color-gray-600);
    margin: 0;
  }

  .toggle {
    display: flex;
    gap: 4px;
    background: var(--color-gray-100);
    padding: 3px;
    border-radius: 8px;
  }

  .opt {
    flex: 1;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 5px;
    padding: 7px 4px;
    border: none;
    border-radius: 6px;
    background: transparent;
    font-size: 12px;
    font-weight: 500;
    color: var(--color-gray-600);
    cursor: pointer;
  }

  .opt.active {
    background: white;
    color: var(--color-primary);
    box-shadow: 0 1px 2px rgba(15, 23, 42, 0.12);
  }

  .search {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 0 10px;
    border: 1px solid var(--color-gray-300);
    border-radius: var(--radius-sm);
    color: var(--color-gray-500);
  }

  .search input {
    flex: 1;
    border: none;
    outline: none;
    padding: 8px 0;
    font-size: 12px;
    color: var(--color-gray-800);
    background: transparent;
  }

  .state {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 10px;
    padding: 28px 0;
    font-size: 13px;
    color: var(--color-gray-600);
  }

  .state.error {
    color: var(--color-danger);
  }

  .retry {
    padding: 6px 12px;
    border: 1px solid var(--color-gray-300);
    border-radius: var(--radius-sm);
    background: white;
    color: var(--color-gray-700);
    font-size: 12px;
    cursor: pointer;
  }

  .empty {
    padding: 24px 12px;
    text-align: center;
    font-size: 12px;
    color: var(--color-gray-500);
    border: 1px dashed var(--color-gray-300);
    border-radius: var(--radius-md);
  }

  .list {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .card {
    display: flex;
    align-items: stretch;
    border: 1px solid var(--color-gray-200);
    border-radius: var(--radius-md);
    background: white;
    overflow: hidden;
  }

  .card-body {
    flex: 1;
    padding: 10px 12px;
    min-width: 0;
  }

  .card-head {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-wrap: wrap;
    margin-bottom: 4px;
  }

  .name {
    font-size: 13px;
    font-weight: 600;
    color: var(--color-gray-900);
  }

  .chip {
    font-size: 10px;
    padding: 1px 7px;
    border-radius: 999px;
    background: #e8f0fe;
    color: var(--color-primary);
    text-transform: capitalize;
  }

  .chip.subtle {
    background: var(--color-gray-100);
    color: var(--color-gray-600);
  }

  .preview {
    font-size: 11px;
    line-height: 1.5;
    color: var(--color-gray-600);
    margin: 0;
    display: -webkit-box;
    -webkit-line-clamp: 3;
    line-clamp: 3;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  .ins {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 0 12px;
    border: none;
    border-left: 1px solid var(--color-gray-200);
    background: white;
    color: var(--color-primary);
    font-size: 12px;
    font-weight: 500;
    cursor: pointer;
    white-space: nowrap;
  }

  .ins:hover:not(:disabled) {
    background: #e8f0fe;
  }

  .ins:disabled {
    opacity: 0.6;
    cursor: default;
  }

  .spinner {
    width: 20px;
    height: 20px;
    border: 2px solid var(--color-gray-200);
    border-top-color: var(--color-primary);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }
</style>
