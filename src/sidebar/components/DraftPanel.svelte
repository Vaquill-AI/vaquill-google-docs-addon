<script lang="ts">
  import { Sparkles, FileText, HelpCircle, Check, Replace, ShieldAlert, BookOpen } from '@lucide/svelte';
  import {
    getSelectedText,
    rewriteClause,
    explainClause,
    generateDraft,
    insertTextAtCursor,
    replaceSelection,
    applyRedlineSuggestions
  } from '$services/gasClient';
  import { uiStore } from '$stores/ui.svelte';
  import { documentStore } from '$stores/document.svelte';
  import InfoTip from './ui/InfoTip.svelte';
  import type { ClauseRewriteResult, ClauseExplainResult } from '$shared/types';

  // Rewrite state
  let instruction = $state('');
  let rewriting = $state(false);
  let rewriteResult = $state<ClauseRewriteResult | null>(null);
  let applyingRewrite = $state(false);
  let rewriteApplied = $state(false);

  // Explain state
  let explaining = $state(false);
  let explainResult = $state<ClauseExplainResult | null>(null);

  // Generate state
  let category = $state('nda');
  let title = $state('');
  let genInstructions = $state('');
  let generating = $state(false);

  const categories = [
    { value: 'nda', label: 'NDA' },
    { value: 'service', label: 'Services Agreement' },
    { value: 'consulting', label: 'Consulting Agreement' },
    { value: 'vendor_agreement', label: 'Vendor Agreement' },
    { value: 'dpa', label: 'Data Processing Agreement' },
    { value: 'baa', label: 'Business Associate Agreement' },
    { value: 'statement_of_work', label: 'Statement of Work' },
    { value: 'order_form', label: 'Order Form' },
    { value: 'employment', label: 'Employment Agreement' },
    { value: 'offer_letter', label: 'Offer Letter' },
    { value: 'independent_contractor', label: 'Independent Contractor' },
    { value: 'ip_assignment', label: 'IP Assignment' },
    { value: 'supply', label: 'Supply Agreement' },
    { value: 'sale', label: 'Sale Agreement' },
    { value: 'lease', label: 'Lease' },
    { value: 'loan', label: 'Loan Agreement' },
    { value: 'partnership', label: 'Partnership Agreement' }
  ];

  async function readSelection(): Promise<string> {
    const text = (await getSelectedText())?.trim() ?? '';
    return text;
  }

  async function handleRewrite() {
    if (rewriting) return;
    if (!instruction.trim()) {
      uiStore.showToast('info', 'Describe how to change the clause first.');
      return;
    }
    const selection = await readSelection();
    if (!selection) {
      uiStore.showToast('info', 'Select the clause in the document first.');
      return;
    }
    rewriting = true;
    rewriteResult = null;
    rewriteApplied = false;
    try {
      rewriteResult = await rewriteClause(selection, instruction.trim());
    } catch (err) {
      uiStore.showToast('error', err instanceof Error ? err.message : 'Could not rewrite the clause.');
    } finally {
      rewriting = false;
    }
  }

  async function applyRewriteAsTrackedChange() {
    if (!rewriteResult || applyingRewrite) return;
    applyingRewrite = true;
    try {
      const result = await applyRedlineSuggestions([
        {
          id: `draft_${Date.now()}`,
          originalText: rewriteResult.original,
          suggestedText: rewriteResult.rewritten,
          charStart: 0,
          charEnd: 0,
          rationale: rewriteResult.changesSummary,
          severity: 'medium',
          status: 'pending',
          createdAt: Date.now()
        }
      ]);
      if (result.applied && result.applied.length > 0) {
        rewriteApplied = true;
        uiStore.showToast('success', result.mode === 'native' ? 'Added as a tracked change' : 'Rewrite added to document');
      } else {
        uiStore.showToast('error', 'Could not locate the clause in the document.');
      }
    } catch (err) {
      uiStore.showToast('error', err instanceof Error ? err.message : 'Could not apply the rewrite.');
    } finally {
      applyingRewrite = false;
    }
  }

  async function replaceWithRewrite() {
    if (!rewriteResult || applyingRewrite) return;
    if (documentStore.content?.canEdit === false) {
      uiStore.showToast('error', 'You do not have edit access to this document.');
      return;
    }
    applyingRewrite = true;
    try {
      // Guard the race where the user moved the selection after generating the
      // rewrite: replacing then would overwrite the wrong text.
      const currentSel = await readSelection();
      if (!currentSel) {
        uiStore.showToast('info', 'Select the clause to replace first.');
        return;
      }
      const norm = (s: string) => s.replace(/\s+/g, ' ').trim();
      if (norm(currentSel) !== norm(rewriteResult.original)) {
        uiStore.showToast('info', 'Your selection changed. Re-select the original clause, then replace.');
        return;
      }
      const res = await replaceSelection(rewriteResult.rewritten);
      if (res.replaced) {
        rewriteApplied = true;
        uiStore.showToast('success', 'Selection replaced');
      } else {
        uiStore.showToast('info', 'Re-select the clause in the document, then try again.');
      }
    } catch (err) {
      uiStore.showToast('error', err instanceof Error ? err.message : 'Could not replace the selection.');
    } finally {
      applyingRewrite = false;
    }
  }

  async function handleExplain() {
    if (explaining) return;
    const selection = await readSelection();
    if (!selection) {
      uiStore.showToast('info', 'Select the clause in the document first.');
      return;
    }
    explaining = true;
    explainResult = null;
    try {
      explainResult = await explainClause(selection);
    } catch (err) {
      uiStore.showToast('error', err instanceof Error ? err.message : 'Could not explain the clause.');
    } finally {
      explaining = false;
    }
  }

  async function handleGenerate() {
    if (generating) return;
    if (documentStore.content?.canEdit === false) {
      uiStore.showToast('error', 'You do not have edit access to insert a draft here.');
      return;
    }
    if (!title.trim()) {
      uiStore.showToast('info', 'Give the document a title first.');
      return;
    }
    generating = true;
    try {
      const draft = await generateDraft(category, title.trim(), genInstructions.trim() || undefined);
      if (draft && draft.fullText) {
        await insertTextAtCursor(draft.fullText);
        uiStore.showToast('success', 'Draft inserted at your cursor');
      } else {
        uiStore.showToast('error', 'The draft came back empty.');
      }
    } catch (err) {
      uiStore.showToast('error', err instanceof Error ? err.message : 'Could not generate the draft.');
    } finally {
      generating = false;
    }
  }
</script>

<div class="draft">
  <p class="intro">
    Rewrite a selected clause, explain one in plain English, or generate a full first draft, all inserted straight into your document.
  </p>

  <!-- Rewrite a clause -->
  <section class="block">
    <div class="block-head">
      <span class="block-head-main">
        <Sparkles size={14} />
        <span>Rewrite a clause</span>
      </span>
      <InfoTip
        align="right"
        text="Select the clause in the document, describe the change, then apply it as a tracked change or replace the selection. Needs a text selection."
      />
    </div>
    <p class="hint">Select a clause in the document, describe the change, and apply it as a tracked change.</p>
    <textarea
      class="input"
      rows="2"
      placeholder="e.g. Add a mutual liability cap at fees paid"
      bind:value={instruction}
    ></textarea>
    <button class="primary" disabled={rewriting} onclick={handleRewrite}>
      <Sparkles size={14} />
      {rewriting ? 'Rewriting...' : 'Rewrite selected clause'}
    </button>

    {#if rewriteResult}
      <div class="result">
        <span class="result-label">Suggested rewrite</span>
        <p class="result-text">{rewriteResult.rewritten}</p>
        {#if rewriteResult.changesSummary}
          <p class="result-note">{rewriteResult.changesSummary}</p>
        {/if}
        {#if rewriteApplied}
          <span class="applied"><Check size={13} /> Applied to document</span>
        {:else}
          <div class="result-actions">
            <button class="action primary-outline" disabled={applyingRewrite} onclick={applyRewriteAsTrackedChange}>
              <Check size={13} /> Apply as tracked change
            </button>
            <button class="action" disabled={applyingRewrite} onclick={replaceWithRewrite}>
              <Replace size={13} /> Replace selection
            </button>
          </div>
        {/if}
      </div>
    {/if}
  </section>

  <!-- Explain a clause -->
  <section class="block">
    <div class="block-head">
      <span class="block-head-main">
        <HelpCircle size={14} />
        <span>Explain a clause</span>
      </span>
      <InfoTip
        align="right"
        text="Select any clause to get a plain-English explanation with its obligations, risks, and the authority it touches. Needs a text selection."
      />
    </div>
    <p class="hint">Select a clause to get a plain-English explanation, its obligations, risks, and the authority it touches.</p>
    <button class="secondary" disabled={explaining} onclick={handleExplain}>
      <HelpCircle size={14} />
      {explaining ? 'Reading...' : 'Explain selected clause'}
    </button>

    {#if explainResult}
      <div class="result">
        <p class="result-text">{explainResult.explanation}</p>
        {#if explainResult.keyObligations.length > 0}
          <div class="facet">
            <span class="facet-label">Key obligations</span>
            <ul>{#each explainResult.keyObligations as o}<li>{o}</li>{/each}</ul>
          </div>
        {/if}
        {#if explainResult.risks.length > 0}
          <div class="facet risk">
            <span class="facet-label"><ShieldAlert size={12} /> Risks</span>
            <ul>{#each explainResult.risks as r}<li>{r}</li>{/each}</ul>
          </div>
        {/if}
        {#if explainResult.applicableActs.length > 0}
          <div class="facet">
            <span class="facet-label"><BookOpen size={12} /> Applicable authority</span>
            <div class="acts">{#each explainResult.applicableActs as a}<span class="act">{a}</span>{/each}</div>
          </div>
        {/if}
      </div>
    {/if}
  </section>

  <!-- Generate a draft -->
  <section class="block">
    <div class="block-head">
      <span class="block-head-main">
        <FileText size={14} />
        <span>Generate a draft</span>
      </span>
      <InfoTip
        align="right"
        text="Pick a document type and title to create a full first draft, inserted at your cursor. No selection needed."
      />
    </div>
    <p class="hint">Create a full first draft and insert it at your cursor.</p>
    <label class="field-label" for="draft-category">Document type</label>
    <select id="draft-category" class="input" bind:value={category}>
      {#each categories as c}<option value={c.value}>{c.label}</option>{/each}
    </select>
    <label class="field-label" for="draft-title">Title</label>
    <input id="draft-title" class="input" type="text" placeholder="e.g. Mutual NDA - Acme and Vaquill" bind:value={title} />
    <textarea class="input" rows="2" placeholder="Special instructions (optional)" bind:value={genInstructions}></textarea>
    <button class="primary" disabled={generating} onclick={handleGenerate}>
      <FileText size={14} />
      {generating ? 'Generating...' : 'Generate draft'}
    </button>
  </section>
</div>

<style>
  .draft {
    display: flex;
    flex-direction: column;
    gap: 18px;
  }

  .intro {
    font-size: 12px;
    line-height: 1.5;
    color: var(--color-gray-600);
    margin: 0;
  }

  .block {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .block-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 6px;
    font-size: 13px;
    font-weight: 600;
    color: var(--color-gray-900);
  }

  .block-head-main {
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }

  .hint {
    font-size: 11px;
    line-height: 1.5;
    color: var(--color-gray-600);
    margin: 0;
  }

  .field-label {
    font-size: 11px;
    font-weight: 500;
    color: var(--color-gray-600);
  }

  .input {
    width: 100%;
    padding: 8px 10px;
    border: 1px solid var(--color-gray-300);
    border-radius: var(--radius-sm);
    background: white;
    color: var(--color-gray-800);
    font-size: 12px;
    font-family: inherit;
    resize: vertical;
  }

  .input:focus {
    outline: none;
    border-color: var(--color-primary);
    box-shadow: 0 0 0 2px rgba(26, 115, 232, 0.15);
  }

  .primary,
  .secondary {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    padding: 9px 12px;
    border-radius: var(--radius-sm);
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    border: 1px solid transparent;
  }

  .primary {
    background: var(--color-primary);
    color: white;
  }

  .primary:hover:not(:disabled) {
    background: var(--color-primary-dark);
  }

  .secondary {
    background: var(--color-gray-100);
    color: var(--color-gray-700);
    border-color: var(--color-gray-200);
  }

  .secondary:hover:not(:disabled) {
    background: var(--color-gray-200);
  }

  .primary:disabled,
  .secondary:disabled {
    opacity: 0.6;
    cursor: default;
  }

  .result {
    border: 1px solid var(--color-gray-200);
    border-radius: var(--radius-md);
    background: var(--color-gray-50);
    padding: 10px;
    display: flex;
    flex-direction: column;
    gap: 8px;
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

  .result-actions {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
  }

  .action {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 6px 10px;
    border-radius: var(--radius-sm);
    border: 1px solid var(--color-gray-200);
    background: white;
    color: var(--color-gray-700);
    font-size: 12px;
    font-weight: 500;
    cursor: pointer;
  }

  .action:hover:not(:disabled) {
    background: var(--color-gray-50);
  }

  .action.primary-outline {
    border-color: var(--color-primary);
    color: var(--color-primary);
  }

  .action.primary-outline:hover:not(:disabled) {
    background: #e8f0fe;
  }

  .action:disabled {
    opacity: 0.6;
    cursor: default;
  }

  .applied {
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
    color: var(--color-gray-500);
  }

  .facet.risk .facet-label {
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

  .acts {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
  }

  .act {
    font-size: 10px;
    padding: 1px 7px;
    border-radius: 999px;
    background: #e8f0fe;
    color: var(--color-primary);
  }
</style>
