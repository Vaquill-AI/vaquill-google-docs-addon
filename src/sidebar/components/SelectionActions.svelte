<script lang="ts">
  import { Wand2, Sparkles, HelpCircle, MessageSquarePlus, Check, Replace, ShieldAlert, BookOpen, X } from '@lucide/svelte';
  import {
    getSelectedText,
    rewriteClause,
    explainClause,
    replaceSelection,
    applyRedlineSuggestions,
    addComment
  } from '$services/gasClient';
  import { documentStore } from '$stores/document.svelte';
  import { uiStore } from '$stores/ui.svelte';
  import type { ClauseRewriteResult, ClauseExplainResult } from '$shared/types';

  // Google Docs gives add-ons no selection event, so we poll the current
  // selection. The bar reveals itself when text is selected, mirroring the
  // TipTap bubble menu as closely as the platform allows.
  let selection = $state('');
  let busy = $state<null | 'simplify' | 'enhance' | 'explain' | 'comment'>(null);
  let rewrite = $state<ClauseRewriteResult | null>(null);
  let rewriteLabel = $state('');
  let explanation = $state<ClauseExplainResult | null>(null);
  let applying = $state(false);
  let applied = $state(false);

  let hasSelection = $derived(selection.trim().length >= 3);
  let show = $derived(hasSelection || rewrite !== null || explanation !== null || busy !== null);

  const SIMPLIFY_INSTRUCTION =
    'Rewrite this clause in plain, simple English a non-lawyer can understand, while preserving its exact legal meaning and effect. Return only the rewritten clause.';
  const ENHANCE_INSTRUCTION =
    'Strengthen and tighten this clause to reduce ambiguity and better protect the client, keeping it market-standard and enforceable. Return only the rewritten clause.';

  $effect(() => {
    if (!documentStore.hasDocument) return;
    let inFlight = false;
    let cancelled = false;
    let current = '';
    const poll = async () => {
      if (inFlight) return;
      inFlight = true;
      try {
        const sel = (await getSelectedText())?.trim() ?? '';
        if (!cancelled && sel !== current) {
          current = sel;
          selection = sel;
        }
      } catch {
        // selection polling is best-effort
      } finally {
        inFlight = false;
      }
    };
    void poll();
    const interval = setInterval(poll, 2500);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  });

  function clearResults() {
    rewrite = null;
    explanation = null;
    applied = false;
  }

  function requireEditable(): boolean {
    if (documentStore.content?.canEdit === false) {
      uiStore.showToast('error', 'You do not have edit access to this document.');
      return false;
    }
    return true;
  }

  async function runRewrite(mode: 'simplify' | 'enhance') {
    if (busy || !hasSelection) return;
    busy = mode;
    clearResults();
    try {
      rewrite = await rewriteClause(selection, mode === 'simplify' ? SIMPLIFY_INSTRUCTION : ENHANCE_INSTRUCTION);
      rewriteLabel = mode === 'simplify' ? 'Simplified' : 'Enhanced';
    } catch (err) {
      uiStore.showToast('error', err instanceof Error ? err.message : 'Could not rewrite the selection.');
    } finally {
      busy = null;
    }
  }

  async function runExplain() {
    if (busy || !hasSelection) return;
    busy = 'explain';
    clearResults();
    try {
      explanation = await explainClause(selection);
    } catch (err) {
      uiStore.showToast('error', err instanceof Error ? err.message : 'Could not explain the selection.');
    } finally {
      busy = null;
    }
  }

  async function runComment() {
    if (busy || !hasSelection) return;
    busy = 'comment';
    try {
      const ex = await explainClause(selection);
      let note = 'Vaquill note: ' + (ex.explanation || '');
      if (ex.risks && ex.risks.length) {
        note += '\n\nRisks:\n- ' + ex.risks.join('\n- ');
      }
      await addComment(selection, note);
      uiStore.showToast('success', 'Comment added to the document');
    } catch (err) {
      uiStore.showToast('error', err instanceof Error ? err.message : 'Could not add a comment.');
    } finally {
      busy = null;
    }
  }

  async function applyTracked() {
    if (!rewrite || applying || !requireEditable()) return;
    applying = true;
    try {
      const result = await applyRedlineSuggestions([
        {
          id: `sel_${Date.now()}`,
          originalText: rewrite.original,
          suggestedText: rewrite.rewritten,
          charStart: 0,
          charEnd: 0,
          rationale: rewrite.changesSummary,
          severity: 'medium',
          status: 'pending',
          createdAt: Date.now()
        }
      ]);
      if (result.applied && result.applied.length > 0) {
        applied = true;
        uiStore.showToast('success', result.mode === 'native' ? 'Added as a tracked change' : 'Change added to document');
      } else {
        uiStore.showToast('error', 'Could not locate the selected text in the document.');
      }
    } catch (err) {
      uiStore.showToast('error', err instanceof Error ? err.message : 'Could not apply the change.');
    } finally {
      applying = false;
    }
  }

  async function replaceWithRewrite() {
    if (!rewrite || applying || !requireEditable()) return;
    applying = true;
    try {
      // The selection may have moved since the rewrite was generated.
      const currentSel = (await getSelectedText())?.trim() ?? '';
      const norm = (s: string) => s.replace(/\s+/g, ' ').trim();
      if (!currentSel) {
        uiStore.showToast('info', 'Re-select the clause to replace, then try again.');
        return;
      }
      if (norm(currentSel) !== norm(rewrite.original)) {
        uiStore.showToast('info', 'Your selection changed. Re-select the original clause, then replace.');
        return;
      }
      const res = await replaceSelection(rewrite.rewritten);
      if (res.replaced) {
        applied = true;
        uiStore.showToast('success', 'Selection replaced');
      } else {
        uiStore.showToast('info', 'Re-select the clause in the document, then try again.');
      }
    } catch (err) {
      uiStore.showToast('error', err instanceof Error ? err.message : 'Could not replace the selection.');
    } finally {
      applying = false;
    }
  }

  let snippet = $derived(selection.length > 70 ? selection.slice(0, 70).trim() + '...' : selection);
</script>

{#if show}
  <div class="sel-bar">
    <div class="sel-head">
      <span class="sel-snippet" title={selection}>{snippet || 'Select text to act on it'}</span>
      {#if rewrite || explanation}
        <button type="button" class="dismiss" aria-label="Dismiss result" onclick={clearResults}>
          <X size={13} />
        </button>
      {/if}
    </div>

    <div class="sel-actions">
      <button type="button" class="act" disabled={!hasSelection || busy !== null} onclick={() => runRewrite('simplify')}>
        <Wand2 size={13} />
        {busy === 'simplify' ? '...' : 'Simplify'}
      </button>
      <button type="button" class="act" disabled={!hasSelection || busy !== null} onclick={() => runRewrite('enhance')}>
        <Sparkles size={13} />
        {busy === 'enhance' ? '...' : 'Enhance'}
      </button>
      <button type="button" class="act" disabled={!hasSelection || busy !== null} onclick={runExplain}>
        <HelpCircle size={13} />
        {busy === 'explain' ? '...' : 'Explain'}
      </button>
      <button type="button" class="act" disabled={!hasSelection || busy !== null} onclick={runComment}>
        <MessageSquarePlus size={13} />
        {busy === 'comment' ? '...' : 'Comment'}
      </button>
    </div>

    {#if rewrite}
      <div class="sel-result">
        <span class="result-label">{rewriteLabel}</span>
        <p class="result-text">{rewrite.rewritten}</p>
        {#if rewrite.changesSummary}<p class="result-note">{rewrite.changesSummary}</p>{/if}
        {#if applied}
          <span class="done"><Check size={13} /> Applied to document</span>
        {:else}
          <div class="result-acts">
            <button type="button" class="mini primary" disabled={applying} onclick={applyTracked}>
              <Check size={13} /> Apply as tracked change
            </button>
            <button type="button" class="mini" disabled={applying} onclick={replaceWithRewrite}>
              <Replace size={13} /> Replace
            </button>
          </div>
        {/if}
      </div>
    {/if}

    {#if explanation}
      <div class="sel-result">
        <p class="result-text">{explanation.explanation}</p>
        {#if explanation.risks && explanation.risks.length > 0}
          <div class="facet">
            <span class="facet-label"><ShieldAlert size={12} /> Risks</span>
            <ul>{#each explanation.risks as r}<li>{r}</li>{/each}</ul>
          </div>
        {/if}
        {#if explanation.applicableActs && explanation.applicableActs.length > 0}
          <div class="facet">
            <span class="facet-label"><BookOpen size={12} /> Authority</span>
            <div class="acts-list">{#each explanation.applicableActs as a}<span class="chip">{a}</span>{/each}</div>
          </div>
        {/if}
      </div>
    {/if}
  </div>
{/if}

<style>
  .sel-bar {
    margin-bottom: var(--spacing-md);
    border: 1px solid var(--color-primary);
    border-radius: var(--radius-md);
    background: #f5f9ff;
    overflow: hidden;
  }

  .sel-head {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 10px;
    background: #e8f0fe;
    border-bottom: 1px solid #d2e3fc;
  }

  .sel-snippet {
    flex: 1;
    min-width: 0;
    font-size: 11px;
    font-style: italic;
    color: var(--color-gray-700);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .dismiss {
    flex-shrink: 0;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 20px;
    height: 20px;
    border: none;
    border-radius: 4px;
    background: transparent;
    color: var(--color-gray-500);
    cursor: pointer;
  }

  .dismiss:hover {
    background: #d2e3fc;
    color: var(--color-gray-700);
  }

  .sel-actions {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 6px;
    padding: 8px 10px;
  }

  .act {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 5px;
    padding: 7px 8px;
    border: 1px solid var(--color-gray-300);
    border-radius: var(--radius-sm);
    background: white;
    color: var(--color-gray-700);
    font-size: 12px;
    font-weight: 500;
    cursor: pointer;
    transition: background 0.15s ease, border-color 0.15s ease;
  }

  .act:hover:not(:disabled) {
    background: #e8f0fe;
    border-color: var(--color-primary);
    color: var(--color-primary);
  }

  .act:disabled {
    opacity: 0.55;
    cursor: default;
  }

  .sel-result {
    padding: 10px;
    margin: 0 10px 10px;
    border: 1px solid var(--color-gray-200);
    border-radius: var(--radius-sm);
    background: white;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .result-label {
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--color-gray-500);
  }

  .result-text {
    font-size: 12px;
    line-height: 1.55;
    color: var(--color-gray-800);
    margin: 0;
    white-space: pre-wrap;
  }

  .result-note {
    font-size: 11px;
    color: var(--color-gray-600);
    line-height: 1.5;
    margin: 0;
  }

  .result-acts {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
  }

  .mini {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 6px 10px;
    border: 1px solid var(--color-gray-200);
    border-radius: var(--radius-sm);
    background: white;
    color: var(--color-gray-700);
    font-size: 12px;
    font-weight: 500;
    cursor: pointer;
  }

  .mini:hover:not(:disabled) {
    background: var(--color-gray-50);
  }

  .mini.primary {
    border-color: var(--color-primary);
    color: var(--color-primary);
  }

  .mini.primary:hover:not(:disabled) {
    background: #e8f0fe;
  }

  .mini:disabled {
    opacity: 0.6;
    cursor: default;
  }

  .done {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    font-size: 12px;
    font-weight: 500;
    color: var(--color-success);
  }

  .facet {
    display: flex;
    flex-direction: column;
    gap: 3px;
  }

  .facet-label {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--color-danger);
  }

  .facet ul {
    margin: 0;
    padding-left: 16px;
  }

  .facet li {
    font-size: 12px;
    color: var(--color-gray-700);
    line-height: 1.5;
  }

  .acts-list {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
  }

  .chip {
    font-size: 10px;
    padding: 1px 7px;
    border-radius: 999px;
    background: #e8f0fe;
    color: var(--color-primary);
  }
</style>
