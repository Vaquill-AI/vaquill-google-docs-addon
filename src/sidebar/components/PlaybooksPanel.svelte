<script lang="ts">
  import { onMount } from 'svelte';
  import {
    BookOpen,
    Check,
    ChevronDown,
    ChevronUp,
    Plus,
    ShieldAlert,
    Star
  } from '@lucide/svelte';
  import { listPlaybooks, listPlaybookTemplates, createPlaybookFromTemplate } from '$services/gasClient';
  import { playbookStore } from '$stores/playbook.svelte';
  import { uiStore } from '$stores/ui.svelte';
  import InfoTip from './ui/InfoTip.svelte';
  import type { Playbook, PlaybookTemplate } from '$shared/types';

  let playbooks = $state<Playbook[]>([]);
  let templates = $state<PlaybookTemplate[]>([]);
  let loading = $state(true);
  let error = $state<string | null>(null);
  let expanded = $state<Set<string>>(new Set());
  let adopting = $state<string | null>(null);

  const priorityLabel: Record<string, string> = {
    must_have: 'Must have',
    should_have: 'Should have',
    nice_to_have: 'Nice to have'
  };

  onMount(load);

  async function load() {
    loading = true;
    error = null;
    try {
      const [pb, tpl] = await Promise.all([
        listPlaybooks().catch(() => [] as Playbook[]),
        listPlaybookTemplates().catch(() => [] as PlaybookTemplate[])
      ]);
      playbooks = pb;
      templates = tpl;
      // Drop the active selection if it no longer exists.
      const activeId = playbookStore.activeId;
      if (activeId && !pb.some((p) => p.id === activeId)) {
        playbookStore.setActivePlaybook(null);
      }
    } catch (err) {
      error = err instanceof Error ? err.message : 'Could not load playbooks.';
    } finally {
      loading = false;
    }
  }

  function toggle(id: string) {
    const next = new Set(expanded);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    expanded = next;
  }

  function use(playbook: Playbook) {
    const isActive = playbookStore.activeId === playbook.id;
    playbookStore.setActivePlaybook(isActive ? null : playbook);
    uiStore.showToast('success', isActive ? 'Cleared active playbook' : `Using "${playbook.name}" for review`);
  }

  async function adopt(slug: string, name: string) {
    if (adopting) return;
    adopting = slug;
    try {
      await createPlaybookFromTemplate(slug);
      uiStore.showToast('success', `Adopted "${name}"`);
      await load();
    } catch (err) {
      uiStore.showToast('error', err instanceof Error ? err.message : 'Could not adopt this template.');
    } finally {
      adopting = null;
    }
  }

  function clauseLabel(key: string): string {
    return key.replace(/_/g, ' ');
  }
</script>

<div class="playbooks">
  <div class="intro-row">
    <p class="intro">
      Select a firm playbook to run contract review against its positions, fallback ladders, and deal-breakers.
    </p>
    <InfoTip
      align="right"
      text="Adopt a starter template to add it to your playbooks. Use marks a playbook active, so the Review tab checks contracts against its positions. Only one is active at a time."
    />
  </div>

  {#if loading}
    <div class="state">
      <div class="spinner"></div>
      <span>Loading playbooks...</span>
    </div>
  {:else if error}
    <div class="state error">
      <span>{error}</span>
      <button class="retry" onclick={load}>Try again</button>
    </div>
  {:else}
    <section>
      <div class="section-head">Your playbooks</div>
      {#if playbooks.length === 0}
        <div class="empty">
          <BookOpen size={20} />
          <span>No playbooks yet. Adopt a starter template below to get started.</span>
        </div>
      {:else}
        <div class="list">
          {#each playbooks as pb}
            {@const isActive = playbookStore.activeId === pb.id}
            {@const isOpen = expanded.has(pb.id)}
            {@const positionKeys = Object.keys(pb.positions || {})}
            <div class="card" class:active={isActive}>
              <div class="card-top">
                <button class="card-main" onclick={() => toggle(pb.id)} aria-expanded={isOpen}>
                  <div class="card-title">
                    <span class="name">{pb.name}</span>
                    <span class="meta">
                      <span class="chip">{pb.contractType}</span>
                      {#if pb.isDefault}<span class="chip default">Default</span>{/if}
                      <span class="count">{positionKeys.length} clauses</span>
                    </span>
                  </div>
                  {#if isOpen}
                    <ChevronUp size={16} class="chev" />
                  {:else}
                    <ChevronDown size={16} class="chev" />
                  {/if}
                </button>
                <button class="use" class:on={isActive} onclick={() => use(pb)}>
                  {#if isActive}<Check size={13} /> Active{:else}Use{/if}
                </button>
              </div>

              {#if isOpen}
                <div class="positions">
                  {#if pb.description}
                    <p class="desc">{pb.description}</p>
                  {/if}
                  {#each positionKeys as key}
                    {@const pos = pb.positions[key]}
                    <div class="position">
                      <div class="pos-head">
                        <span class="pos-name">{clauseLabel(key)}</span>
                        {#if pos.priority}
                          <span class="pri {pos.priority}">{priorityLabel[pos.priority] || pos.priority}</span>
                        {/if}
                      </div>
                      {#if pos.standardPosition}
                        <p class="pos-standard">{pos.standardPosition}</p>
                      {/if}
                      {#if pos.fallbackLadder && pos.fallbackLadder.length > 0}
                        <div class="ladder">
                          <span class="ladder-label">Fallback ladder</span>
                          <ol>
                            {#each pos.fallbackLadder as step}
                              <li>{step}</li>
                            {/each}
                          </ol>
                        </div>
                      {/if}
                      {#if pos.dealBreaker}
                        <div class="dealbreaker">
                          <ShieldAlert size={13} />
                          <span>Deal-breaker: {pos.dealBreaker}</span>
                        </div>
                      {/if}
                    </div>
                  {/each}
                </div>
              {/if}
            </div>
          {/each}
        </div>
      {/if}
    </section>

    {#if templates.length > 0}
      <section>
        <div class="section-head">Starter templates</div>
        <div class="list">
          {#each templates as tpl}
            <div class="template">
              <div class="template-copy">
                <span class="name">
                  {#if tpl.featured}<Star size={12} class="star" />{/if}
                  {tpl.name}
                </span>
                {#if tpl.description}<span class="template-desc">{tpl.description}</span>{/if}
                <span class="meta">
                  {#if tpl.contractType}<span class="chip">{tpl.contractType}</span>{/if}
                  {#if tpl.category}<span class="chip subtle">{tpl.category}</span>{/if}
                </span>
              </div>
              <button class="adopt" disabled={adopting === tpl.slug} onclick={() => adopt(tpl.slug, tpl.name)}>
                <Plus size={13} />
                {adopting === tpl.slug ? 'Adopting...' : 'Adopt'}
              </button>
            </div>
          {/each}
        </div>
      </section>
    {/if}
  {/if}
</div>

<style>
  .playbooks {
    display: flex;
    flex-direction: column;
    gap: 18px;
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

  .state {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 10px;
    padding: 32px 0;
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

  .section-head {
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--color-gray-500);
    margin-bottom: 8px;
  }

  .empty {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 16px;
    border: 1px dashed var(--color-gray-300);
    border-radius: var(--radius-md);
    color: var(--color-gray-600);
    font-size: 12px;
  }

  .list {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .card {
    border: 1px solid var(--color-gray-200);
    border-radius: var(--radius-md);
    background: white;
    overflow: hidden;
  }

  .card.active {
    border-color: var(--color-primary);
    box-shadow: 0 0 0 1px var(--color-primary);
  }

  .card-top {
    display: flex;
    align-items: stretch;
  }

  .card-main {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding: 10px 12px;
    background: none;
    border: none;
    cursor: pointer;
    text-align: left;
    min-width: 0;
  }

  .card-main:hover {
    background: var(--color-gray-50);
  }

  .card-title {
    display: flex;
    flex-direction: column;
    gap: 4px;
    min-width: 0;
  }

  .name {
    font-size: 13px;
    font-weight: 600;
    color: var(--color-gray-900);
    display: inline-flex;
    align-items: center;
    gap: 5px;
  }

  .meta {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-wrap: wrap;
  }

  .chip {
    font-size: 10px;
    padding: 1px 7px;
    border-radius: 999px;
    background: #e8f0fe;
    color: var(--color-primary);
    text-transform: capitalize;
  }

  .chip.default {
    background: var(--color-gray-100);
    color: var(--color-gray-600);
  }

  .chip.subtle {
    background: var(--color-gray-100);
    color: var(--color-gray-600);
  }

  .count {
    font-size: 11px;
    color: var(--color-gray-500);
  }

  :global(.chev) {
    color: var(--color-gray-400);
    flex-shrink: 0;
  }

  .use {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 0 14px;
    border: none;
    border-left: 1px solid var(--color-gray-200);
    background: white;
    color: var(--color-primary);
    font-size: 12px;
    font-weight: 500;
    cursor: pointer;
    white-space: nowrap;
  }

  .use:hover {
    background: #e8f0fe;
  }

  .use.on {
    background: var(--color-primary);
    color: white;
    border-left-color: var(--color-primary);
  }

  .positions {
    padding: 4px 12px 12px;
    border-top: 1px solid var(--color-gray-100);
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .desc {
    font-size: 12px;
    color: var(--color-gray-600);
    margin: 8px 0 0;
    line-height: 1.5;
  }

  .position {
    padding-top: 8px;
    border-top: 1px solid var(--color-gray-100);
  }

  .position:first-of-type {
    border-top: none;
  }

  .pos-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }

  .pos-name {
    font-size: 12px;
    font-weight: 600;
    color: var(--color-gray-800);
    text-transform: capitalize;
  }

  .pri {
    font-size: 10px;
    padding: 1px 6px;
    border-radius: 999px;
  }

  .pri.must_have {
    background: var(--color-danger-bg);
    color: var(--color-danger);
  }

  .pri.should_have {
    background: var(--color-warning-bg);
    color: #b06000;
  }

  .pri.nice_to_have {
    background: var(--color-gray-100);
    color: var(--color-gray-600);
  }

  .pos-standard {
    font-size: 12px;
    color: var(--color-gray-700);
    line-height: 1.5;
    margin: 4px 0 0;
  }

  .ladder {
    margin-top: 6px;
  }

  .ladder-label {
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--color-gray-500);
  }

  .ladder ol {
    margin: 4px 0 0;
    padding-left: 18px;
  }

  .ladder li {
    font-size: 12px;
    color: var(--color-gray-700);
    line-height: 1.5;
    margin-bottom: 2px;
  }

  .dealbreaker {
    display: flex;
    align-items: flex-start;
    gap: 5px;
    margin-top: 6px;
    font-size: 11px;
    color: var(--color-danger);
    line-height: 1.4;
  }

  .template {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    padding: 10px 12px;
    border: 1px solid var(--color-gray-200);
    border-radius: var(--radius-md);
    background: white;
  }

  .template-copy {
    display: flex;
    flex-direction: column;
    gap: 4px;
    min-width: 0;
  }

  .template-desc {
    font-size: 11px;
    color: var(--color-gray-500);
    line-height: 1.4;
  }

  :global(.star) {
    color: #f9ab00;
  }

  .adopt {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 6px 12px;
    border: 1px solid var(--color-primary);
    border-radius: var(--radius-sm);
    background: white;
    color: var(--color-primary);
    font-size: 12px;
    font-weight: 500;
    cursor: pointer;
    white-space: nowrap;
    flex-shrink: 0;
  }

  .adopt:hover:not(:disabled) {
    background: #e8f0fe;
  }

  .adopt:disabled {
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
