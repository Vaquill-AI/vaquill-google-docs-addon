<script lang="ts">
  import { Sparkles, CheckCheck, X, Info } from '@lucide/svelte';
  import { applyRedlineSuggestions, acceptAllSuggestions, rejectAllSuggestions } from '$services/gasClient';
  import type { Suggestion, Severity } from '$shared/types';
  import ActionButton from './ui/ActionButton.svelte';

  export interface RedlineItem {
    originalText: string;
    suggestedText: string;
    rationale: string;
    severity: Severity;
    charStart?: number;
    charEnd?: number;
  }

  interface Props {
    items: RedlineItem[];
  }

  let { items }: Props = $props();

  type Status = 'idle' | 'applying' | 'done' | 'error';

  let status = $state<Status>('idle');
  let appliedCount = $state(0);
  let failedCount = $state(0);
  let mode = $state<string | undefined>(undefined);
  let errorMessage = $state<string | null>(null);
  let resolution = $state<'accepted' | 'rejected' | null>(null);
  let resolving = $state(false);

  // Only items that carry a concrete original -> suggested replacement can be
  // applied to the document.
  let applicable = $derived(
    (items || []).filter((it) => it.originalText && it.suggestedText)
  );

  function buildSuggestions(): Suggestion[] {
    return applicable.map((it, index) => ({
      id: `redline_${index}_${Date.now()}`,
      originalText: it.originalText,
      suggestedText: it.suggestedText,
      charStart: it.charStart ?? 0,
      charEnd: it.charEnd ?? 0,
      rationale: it.rationale,
      severity: it.severity,
      status: 'pending',
      createdAt: Date.now()
    }));
  }

  async function applyAll() {
    status = 'applying';
    errorMessage = null;
    resolution = null;
    try {
      const result = await applyRedlineSuggestions(buildSuggestions());
      appliedCount = result.applied?.length ?? 0;
      failedCount = result.failed?.length ?? 0;
      mode = result.mode;
      status = 'done';
    } catch (err) {
      errorMessage = err instanceof Error ? err.message : 'Could not apply redlines.';
      status = 'error';
    }
  }

  async function resolveAll(action: 'accept' | 'reject') {
    resolving = true;
    try {
      if (action === 'accept') {
        await acceptAllSuggestions();
        resolution = 'accepted';
      } else {
        await rejectAllSuggestions();
        resolution = 'rejected';
      }
    } catch (err) {
      errorMessage = err instanceof Error ? err.message : 'Could not update suggestions.';
    } finally {
      resolving = false;
    }
  }

  let plural = $derived(appliedCount === 1 ? '' : 's');
</script>

{#if applicable.length > 0}
  <div class="redline-bar">
    {#if status !== 'done'}
      <div class="redline-intro">
        <div class="redline-copy">
          <span class="redline-title">Apply redlines to your document</span>
          <span class="redline-sub">
            {applicable.length} suggested change{applicable.length === 1 ? '' : 's'} ready to insert as tracked changes
          </span>
        </div>
        <ActionButton
          onclick={applyAll}
          loading={status === 'applying'}
          loadingText="Applying..."
          icon={Sparkles}
          variant="primary"
        >
          Apply {applicable.length} redline{applicable.length === 1 ? '' : 's'}
        </ActionButton>
      </div>

      {#if status === 'error' && errorMessage}
        <div class="redline-note error">
          <Info size={14} />
          <span>{errorMessage}</span>
        </div>
      {/if}
    {:else}
      <div class="redline-result">
        <div class="redline-result-head">
          <CheckCheck size={16} class="ok-icon" />
          <span>
            Added {appliedCount} redline{plural}
            {#if mode === 'native'}
              as native tracked changes.
            {:else}
              as highlighted markup.
            {/if}
          </span>
        </div>

        <p class="redline-guidance">
          {#if mode === 'native'}
            Open <strong>Editing &gt; Suggesting</strong> in Google Docs to review each change, or resolve them all here.
          {:else}
            Your account is not on native suggestions, so changes are shown as colored markup. Resolve them all here.
          {/if}
        </p>

        {#if failedCount > 0}
          <div class="redline-note warn">
            <Info size={14} />
            <span>{failedCount} change{failedCount === 1 ? '' : 's'} could not be located in the document text.</span>
          </div>
        {/if}

        {#if resolution}
          <div class="redline-note done">
            <span>All suggestions {resolution}.</span>
          </div>
        {:else}
          <div class="redline-actions">
            <ActionButton
              onclick={() => resolveAll('accept')}
              loading={resolving}
              loadingText="Working..."
              icon={CheckCheck}
              variant="success"
            >
              Accept all
            </ActionButton>
            <ActionButton
              onclick={() => resolveAll('reject')}
              disabled={resolving}
              icon={X}
              variant="secondary"
            >
              Reject all
            </ActionButton>
          </div>
        {/if}

        {#if errorMessage}
          <div class="redline-note error">
            <Info size={14} />
            <span>{errorMessage}</span>
          </div>
        {/if}
      </div>
    {/if}
  </div>
{/if}

<style>
  .redline-bar {
    border: 1px solid var(--color-gray-200, #e8eaed);
    border-radius: 8px;
    background: var(--color-gray-50, #f8f9fa);
    padding: 14px;
    margin-bottom: 16px;
  }

  .redline-intro {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    flex-wrap: wrap;
  }

  .redline-copy {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }

  .redline-title {
    font-size: 13px;
    font-weight: 600;
    color: var(--color-gray-900, #202124);
  }

  .redline-sub {
    font-size: 12px;
    color: var(--color-gray-500, #5f6368);
  }

  .redline-intro :global(.action-button) {
    width: auto;
    white-space: nowrap;
  }

  .redline-result-head {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 13px;
    font-weight: 600;
    color: var(--color-gray-900, #202124);
  }

  .redline-result-head :global(.ok-icon) {
    color: var(--color-success, #34a853);
    flex-shrink: 0;
  }

  .redline-guidance {
    margin: 8px 0 12px;
    font-size: 12px;
    line-height: 1.5;
    color: var(--color-gray-600, #5f6368);
  }

  .redline-actions {
    display: flex;
    gap: 8px;
  }

  .redline-note {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-top: 10px;
    font-size: 12px;
  }

  .redline-note.error {
    color: var(--color-danger, #d93025);
  }

  .redline-note.warn {
    color: var(--color-warning, #b45309);
  }

  .redline-note.done {
    color: var(--color-success, #188038);
    font-weight: 500;
  }
</style>
