<script lang="ts">
  import { Play, FileInput, CheckCircle, AlertTriangle, XCircle, ChevronDown, ChevronUp, BookOpen, Shield, FileSearch, FileCheck, Sparkles, RefreshCw } from '@lucide/svelte';
  import { documentStore } from '$stores/document.svelte';
  import { uiStore } from '$stores/ui.svelte';
  import { playbookStore } from '$stores/playbook.svelte';
  import {
    runNDATriage,
    runContractReview,
    runComplianceReview,
    generateNDATriageReport,
    generateContractReviewReport,
    generateComplianceReport,
    insertReportInDocument,
    navigateToOffset,
    applyRedlineSuggestions,
    getSelectedText,
    addClauseCitation,
    getDocumentContent,
    getDocumentFingerprint
  } from '$services/gasClient';
  import type {
    NDATriageResponse,
    ContractReviewResponse,
    ComplianceReviewResponse,
    ClauseAnalysis,
    RiskLevel
  } from '$shared/types';
  import { getRiskColor, getRiskBg, getStatusIcon, getStatusColor, getRiskIcon } from '../utils/riskHelpers';

  // UI Components
  import ErrorMessage from './ui/ErrorMessage.svelte';
  import ActionButton from './ui/ActionButton.svelte';
  import SectionTitle from './ui/SectionTitle.svelte';
  import IssueCard from './ui/IssueCard.svelte';
  import InfoTip from './ui/InfoTip.svelte';
  import DocScopeNotice from './ui/DocScopeNotice.svelte';
  import StatsBar from './ui/StatsBar.svelte';
  import { DOC_CHAR_LIMITS, hashText } from '../utils/document-scope';
  import RegulationTags from './ui/RegulationTags.svelte';
  import ChecklistItem from './ui/ChecklistItem.svelte';
  import RedlineApplyBar from './RedlineApplyBar.svelte';

  // ============================================
  // Document Type Detection
  // ============================================

  type DocumentType = 'nda' | 'contract' | 'dpa' | 'unknown';
  type ReviewMode = 'auto' | 'nda' | 'contract' | 'compliance';

  let reviewMode = $state<ReviewMode>('auto');
  let detectedType = $state<DocumentType>('unknown');

  // Review states
  let isLoading = $state(false);
  let error = $state<string | null>(null);

  // Results (only one will be populated at a time)
  let ndaResult = $state<NDATriageResponse | null>(null);
  let contractResult = $state<ContractReviewResponse | null>(null);
  let complianceResult = $state<ComplianceReviewResponse | null>(null);

  // Change-since-review detection: the hash of the document at the time the
  // current result was produced, and whether the live document has since moved.
  let reviewedHash = $state<string | null>(null);
  let documentChanged = $state(false);

  // Long-review UX: a friendly rotating status and a cancel that abandons the
  // in-flight result. The backend call is non-streaming, so these steps are
  // reassurance, not real progress; the run id lets cancel discard late results.
  const REVIEW_STEPS = [
    'Reading the document...',
    'Identifying the key clauses...',
    'Checking against standards...',
    'Drafting suggestions...',
    'Finalizing the findings...'
  ];
  let reviewStepIndex = $state(0);
  let reviewRunId = 0;

  $effect(() => {
    if (!isLoading) {
      reviewStepIndex = 0;
      return;
    }
    let i = 0;
    const t = setInterval(() => {
      i = (i + 1) % REVIEW_STEPS.length;
      reviewStepIndex = i;
    }, 2500);
    return () => clearInterval(t);
  });

  function cancelReview() {
    reviewRunId++; // invalidate the in-flight run so its result is discarded
    isLoading = false;
    ndaResult = null;
    contractResult = null;
    complianceResult = null;
  }

  // Form states for contract review
  let userSide = $state<string>('customer');
  let contractType = $state<string>('');
  let focusAreas = $state<string[]>([]);
  let negotiationPosture = $state<'conservative' | 'balanced' | 'aggressive'>('balanced');

  // Form states for compliance
  let complianceType = $state<'dpa' | 'privacy_policy' | 'dsr' | 'general'>('dpa');
  // The backend checks against ONE regulation per run, so this is single-select.
  let selectedRegulation = $state<string>('gdpr');

  // UI state
  let expandedFindings = $state<Set<number>>(new Set());
  let expandedItems = $state<Set<number>>(new Set());

  // Playbook integration
  let hasPlaybook = $derived(playbookStore.activeId !== null);

  // Has any result
  let hasResult = $derived(ndaResult !== null || contractResult !== null || complianceResult !== null);

  // ============================================
  // Redline items for the Apply bar (normalized across result types)
  // ============================================

  function riskToSeverity(risk: RiskLevel): 'low' | 'medium' | 'high' | 'critical' {
    if (risk === 'red') return 'high';
    if (risk === 'yellow') return 'medium';
    return 'low';
  }

  let contractRedlineItems = $derived(
    (contractResult?.keyFindings || [])
      .filter((f) => f.redlineSuggestion?.originalText && f.redlineSuggestion?.suggestedText)
      .map((f) => ({
        originalText: f.redlineSuggestion!.originalText,
        suggestedText: f.redlineSuggestion!.suggestedText,
        rationale: f.redlineSuggestion!.rationale,
        severity: riskToSeverity(f.riskLevel),
        charStart: f.charStart,
        charEnd: f.charEnd
      }))
  );

  let ndaRedlineItems = $derived(
    (ndaResult?.issuesFound || [])
      .filter((i) => i.originalText && i.suggestedText)
      .map((i) => ({
        originalText: i.originalText!,
        suggestedText: i.suggestedText!,
        rationale: i.suggestedFix || i.risk,
        severity: riskToSeverity(i.severity),
        charStart: i.charStart,
        charEnd: i.charEnd
      }))
  );

  // ============================================
  // Document Type Detection Logic
  // ============================================

  function detectDocumentType(text: string): DocumentType {
    const lowerText = text.toLowerCase();

    // NDA patterns
    const ndaPatterns = [
      'non-disclosure agreement',
      'nondisclosure agreement',
      'confidentiality agreement',
      'mutual nda',
      'unilateral nda',
      'confidential information',
      'disclosing party',
      'receiving party'
    ];

    // DPA patterns
    const dpaPatterns = [
      'data processing agreement',
      'data protection agreement',
      'gdpr',
      'data controller',
      'data processor',
      'personal data',
      'data subject',
      'article 28',
      'subprocessor'
    ];

    // Contract patterns (general)
    const contractPatterns = [
      'master services agreement',
      'service agreement',
      'license agreement',
      'subscription agreement',
      'saas agreement',
      'software license',
      'terms of service',
      'limitation of liability',
      'indemnification',
      'intellectual property rights'
    ];

    // Score each type
    let ndaScore = ndaPatterns.filter(p => lowerText.includes(p)).length;
    let dpaScore = dpaPatterns.filter(p => lowerText.includes(p)).length;
    let contractScore = contractPatterns.filter(p => lowerText.includes(p)).length;

    // Weight certain patterns more heavily
    if (lowerText.includes('non-disclosure') || lowerText.includes('nondisclosure') || lowerText.includes('confidentiality agreement')) {
      ndaScore += 3;
    }
    if (lowerText.includes('data processing agreement') || lowerText.includes('data protection agreement')) {
      dpaScore += 3;
    }

    // Determine winner
    const maxScore = Math.max(ndaScore, dpaScore, contractScore);
    if (maxScore === 0) return 'unknown';

    if (ndaScore === maxScore && ndaScore > 0) return 'nda';
    if (dpaScore === maxScore && dpaScore > 0) return 'dpa';
    if (contractScore === maxScore && contractScore > 0) return 'contract';

    return 'unknown';
  }

  // Auto-detect on mount
  $effect(() => {
    if (documentStore.hasDocument && documentStore.content && !hasResult) {
      detectedType = detectDocumentType(documentStore.content.text);
    }
  });

  // ============================================
  // Review Handlers
  // ============================================

  async function handleReview() {
    if (!documentStore.hasDocument) {
      error = 'No document loaded';
      return;
    }

    // Refresh the cached document so the length gate and auto-detected type
    // reflect edits made since the add-on opened. Non-fatal if it fails.
    try {
      const fresh = await getDocumentContent();
      documentStore.setDocument(fresh);
      detectedType = detectDocumentType(fresh.text);
    } catch {
      // keep the previously loaded document content
    }

    // The backend needs enough text to analyze; catch an empty or near-empty
    // document here rather than after a confusing round trip.
    const docText = documentStore.content?.text?.trim() ?? '';
    if (docText.length < 100) {
      error = 'This document is too short to analyze. Open the contract you want to review, then try again.';
      return;
    }

    isLoading = true;
    error = null;
    documentChanged = false;
    const myRun = ++reviewRunId;

    // Clear previous results
    ndaResult = null;
    contractResult = null;
    complianceResult = null;

    try {
      const effectiveMode = reviewMode === 'auto' ? detectedType : reviewMode;

      switch (effectiveMode) {
        case 'nda':
          ndaResult = await runNDATriage();
          break;

        case 'contract':
          contractResult = await runContractReview({
            userSide,
            contractType: contractType || undefined,
            focusAreas: focusAreas.length > 0 ? focusAreas : undefined,
            playbookId: playbookStore.activeId ?? undefined,
            posture: negotiationPosture
          });
          break;

        case 'dpa':
        case 'compliance':
          // The backend reads the active document itself, so we only pass the
          // review type and regulations here.
          complianceResult = await runComplianceReview({
            reviewType: complianceType,
            applicableRegulations: [selectedRegulation]
          });
          break;

        default:
          // Unknown - default to contract review
          contractResult = await runContractReview({
            userSide,
            contractType: contractType || undefined,
            focusAreas: focusAreas.length > 0 ? focusAreas : undefined,
            playbookId: playbookStore.activeId ?? undefined,
            posture: negotiationPosture
          });
      }

      // If the run was cancelled (or superseded) while awaiting, discard the
      // result that just came back.
      if (myRun !== reviewRunId) {
        ndaResult = null;
        contractResult = null;
        complianceResult = null;
        return;
      }

      // Baseline the document state this result reflects, so later edits can be
      // detected. The hash matches getDocumentFingerprint (same djb2 over body text).
      reviewedHash = hashText(documentStore.content?.text ?? '');
      documentChanged = false;

      uiStore.showToast('success', 'Review completed');
    } catch (err) {
      // A stale/cancelled run should not surface its error over a newer run.
      if (myRun !== reviewRunId) return;
      const msg = err instanceof Error ? err.message : 'Failed to complete review';
      // A deleted active playbook makes the backend reject the run. Clear it so
      // a retry falls back to market standards instead of a dead reference.
      if (playbookStore.activeId && /playbook|not found|404/i.test(msg)) {
        playbookStore.setActivePlaybook(null);
        error = 'The selected playbook is no longer available, so it was cleared. Run the review again to use market standards.';
      } else {
        error = msg;
      }
      uiStore.showToast('error', 'Review failed');
    } finally {
      // Only the current run may clear the loading flag; a superseded run must
      // not turn off a newer run's spinner.
      if (myRun === reviewRunId) isLoading = false;
    }
  }

  async function handleInsertReport() {
    if (documentStore.content?.canEdit === false) {
      uiStore.showToast('error', 'You do not have edit access to add a report to this document.');
      return;
    }
    try {
      let reportMarkdown = '';

      if (ndaResult) {
        reportMarkdown = await generateNDATriageReport(ndaResult);
      } else if (contractResult) {
        reportMarkdown = await generateContractReviewReport(contractResult);
      } else if (complianceResult) {
        reportMarkdown = await generateComplianceReport(complianceResult);
      }

      if (reportMarkdown) {
        await insertReportInDocument(reportMarkdown);
        uiStore.showToast('success', 'Report inserted into document');
      }
    } catch (err) {
      uiStore.showToast('error', 'Failed to insert report');
    }
  }

  function handleReset() {
    ndaResult = null;
    contractResult = null;
    complianceResult = null;
    error = null;
    reviewedHash = null;
    documentChanged = false;
  }

  // While a result is shown, poll the live document fingerprint. When it differs
  // from the reviewed state, flag that the findings may be stale. Polling stops
  // once a change is detected or the result is cleared.
  $effect(() => {
    if (!hasResult || !reviewedHash || documentChanged) return;
    let cancelled = false;
    const check = async () => {
      try {
        const fp = await getDocumentFingerprint();
        if (!cancelled && reviewedHash && fp.hash !== reviewedHash) {
          documentChanged = true;
          // Refresh the store so the header word count and scope notice reflect
          // the edit. This runs once (polling stops after a change is detected).
          try {
            const fresh = await getDocumentContent();
            if (!cancelled) documentStore.setDocument(fresh);
          } catch {
            // keep the previously loaded content
          }
        }
      } catch {
        // best-effort; ignore transient failures
      }
    };
    const interval = setInterval(check, 7000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  });

  async function rerunReview() {
    documentChanged = false;
    await handleReview();
  }

  async function handleNavigate(charStart?: number) {
    if (charStart !== undefined) {
      try {
        await navigateToOffset(charStart);
      } catch (err) {
        console.error('Navigation failed:', err);
      }
    }
  }

  // Per-finding apply: insert a single redline as a native suggestion.
  let appliedFindings = $state<Set<number>>(new Set());
  let applyingFinding = $state<number | null>(null);

  async function applyOneRedline(finding: ClauseAnalysis, index: number, useFallback = false) {
    const redline = finding.redlineSuggestion;
    if (!redline?.originalText || !redline?.suggestedText) return;
    if (documentChanged) {
      uiStore.showToast('info', 'The document changed since this review. Re-run it first so redlines target the current text.');
      return;
    }
    // The fallback (compromise) position is the one-tap counter-draft.
    const suggested = useFallback && redline.fallbackPosition ? redline.fallbackPosition : redline.suggestedText;
    applyingFinding = index;
    try {
      const result = await applyRedlineSuggestions([
        {
          id: `finding_${index}`,
          originalText: redline.originalText,
          suggestedText: suggested,
          charStart: finding.charStart ?? 0,
          charEnd: finding.charEnd ?? 0,
          rationale: redline.rationale,
          severity: riskToSeverity(finding.riskLevel),
          status: 'pending',
          createdAt: Date.now()
        }
      ]);
      if (result.applied && result.applied.length > 0) {
        appliedFindings = new Set(appliedFindings).add(index);
        uiStore.showToast(
          'success',
          result.mode === 'native' ? 'Added as a tracked change' : 'Redline added to document'
        );
      } else {
        uiStore.showToast('error', 'Could not locate this clause in the document');
      }
    } catch (err) {
      uiStore.showToast('error', 'Could not apply this redline');
    } finally {
      applyingFinding = null;
    }
  }

  // Per-finding cite authority: insert supporting US authority as a Docs comment.
  let citedFindings = $state<Set<number>>(new Set());
  let citingFinding = $state<number | null>(null);

  async function citeAuthority(finding: ClauseAnalysis, index: number) {
    if (!finding.currentLanguage) return;
    citingFinding = index;
    try {
      await addClauseCitation(finding.currentLanguage);
      citedFindings = new Set(citedFindings).add(index);
      uiStore.showToast('success', 'Authority added as a comment');
    } catch (err) {
      uiStore.showToast('error', 'Could not add authority for this clause');
    } finally {
      citingFinding = null;
    }
  }

  // ============================================
  // Clause map + bi-directional selection sync
  // ============================================

  let syncedFinding = $state<number | null>(null);

  // Open a finding, scroll its card into view, and move the Docs cursor to it.
  function focusFinding(index: number) {
    if (!expandedFindings.has(index)) {
      expandedFindings = new Set(expandedFindings).add(index);
    }
    const el = document.getElementById(`finding-${index}`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    const charStart = contractResult?.keyFindings?.[index]?.charStart;
    if (charStart !== undefined) {
      void handleNavigate(charStart);
    }
  }

  // Poll the document selection; when it matches a finding's clause text, focus
  // that finding in the sidebar. This is the doc -> sidebar half of the sync.
  $effect(() => {
    if (!contractResult) {
      syncedFinding = null;
      return;
    }
    const findings = contractResult.keyFindings || [];
    let cancelled = false;

    const poll = async () => {
      try {
        const selection = (await getSelectedText())?.trim();
        if (cancelled || !selection || selection.length < 12) return;
        const needle = selection.toLowerCase();
        const match = findings.findIndex((f) => {
          const lang = (f.currentLanguage || '').toLowerCase();
          return lang && (lang.includes(needle) || needle.includes(lang.substring(0, 40)));
        });
        if (match !== -1 && match !== syncedFinding) {
          syncedFinding = match;
          if (!expandedFindings.has(match)) {
            expandedFindings = new Set(expandedFindings).add(match);
          }
        }
      } catch {
        // Selection polling is best-effort; ignore transient failures.
      }
    };

    const interval = setInterval(poll, 2000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  });

  function toggleFinding(index: number) {
    const newSet = new Set(expandedFindings);
    if (newSet.has(index)) {
      newSet.delete(index);
    } else {
      newSet.add(index);
    }
    expandedFindings = newSet;
  }

  function toggleExpand(index: number) {
    const newSet = new Set(expandedItems);
    if (newSet.has(index)) {
      newSet.delete(index);
    } else {
      newSet.add(index);
    }
    expandedItems = newSet;
  }

  function toggleFocusArea(area: string) {
    if (focusAreas.includes(area)) {
      focusAreas = focusAreas.filter(a => a !== area);
    } else {
      focusAreas = [...focusAreas, area];
    }
  }


  // ============================================
  // Config Options
  // ============================================

  const userSideOptions = [
    { value: 'vendor', label: 'Vendor / Seller' },
    { value: 'customer', label: 'Customer / Buyer' },
    { value: 'licensor', label: 'Licensor' },
    { value: 'licensee', label: 'Licensee' },
    { value: 'partner', label: 'Partner' },
    { value: 'other', label: 'Other' }
  ];

  const focusAreaOptions = [
    'limitation_of_liability',
    'indemnification',
    'intellectual_property',
    'data_protection',
    'confidentiality',
    'termination',
    'governing_law',
    'insurance',
    'assignment',
    'force_majeure'
  ];

  const complianceTypes = [
    { value: 'dpa', label: 'Data Processing Agreement' },
    { value: 'privacy_policy', label: 'Privacy Policy' },
    { value: 'dsr', label: 'Data Subject Request' },
    { value: 'general', label: 'General Compliance' }
  ];

  // The 14 regulations the Vaquill backend has full requirement checklists for.
  const regulations = [
    { value: 'gdpr', label: 'GDPR (EU)' },
    { value: 'uk_gdpr', label: 'UK GDPR' },
    { value: 'ccpa', label: 'CCPA (California)' },
    { value: 'hipaa', label: 'HIPAA (healthcare)' },
    { value: 'glba', label: 'GLBA (financial)' },
    { value: 'ferpa', label: 'FERPA (education)' },
    { value: 'tcpa', label: 'TCPA (telecom)' },
    { value: 'sox', label: 'SOX (financial reporting)' },
    { value: 'pci_dss', label: 'PCI DSS (payments)' },
    { value: 'soc2', label: 'SOC 2' },
    { value: 'dpdp', label: 'DPDP (India)' },
    { value: 'lgpd', label: 'LGPD (Brazil)' },
    { value: 'dora', label: 'DORA (EU)' },
    { value: 'nis2', label: 'NIS2 (EU)' }
  ];

  // Helper functions
  function getDocTypeLabel(type: DocumentType): string {
    switch (type) {
      case 'nda': return 'NDA';
      case 'contract': return 'Contract';
      case 'dpa': return 'DPA / Compliance';
      default: return 'Document';
    }
  }

  // Calculate compliance stats
  let complianceStats = $derived(() => {
    if (!complianceResult) return null;
    const total = complianceResult.checklistResults.length;
    const compliant = complianceResult.checklistResults.filter(c => c.status === 'compliant').length;
    const partial = complianceResult.checklistResults.filter(c => c.status === 'partial').length;
    const nonCompliant = complianceResult.checklistResults.filter(c => c.status === 'non-compliant').length;
    const na = complianceResult.checklistResults.filter(c => c.status === 'not-applicable').length;
    const applicableTotal = total - na;
    const score = applicableTotal > 0 ? Math.round(((compliant + (partial * 0.5)) / applicableTotal) * 100) : 0;
    return { total, compliant, partial, nonCompliant, na, score };
  });
</script>

<div class="panel">
  <div class="panel-header">
    <div class="panel-title-row">
      <h2 class="panel-title">Review</h2>
      <InfoTip
        align="right"
        text="Analyzes the open document. Auto detects NDAs, contracts, and DPAs, or pick a mode. Contract review can run against an active playbook. Findings apply as tracked changes and can cite supporting authority."
      />
    </div>
    <p class="panel-subtitle">
      {#if detectedType !== 'unknown' && !hasResult}
        <span class="detected-badge">
          <Sparkles size={12} />
          Detected: {getDocTypeLabel(detectedType)}
        </span>
      {:else}
        Intelligent document analysis
      {/if}
    </p>
  </div>

  {#if !hasResult}
    <!-- ============================================ -->
    <!-- Configuration Form -->
    <!-- ============================================ -->
    <div class="form-section">
      <!-- Mode Selector -->
      <div class="mode-selector">
        <button
          class="mode-btn"
          class:active={reviewMode === 'auto'}
          onclick={() => reviewMode = 'auto'}
        >
          <Sparkles size={14} />
          <span>Auto</span>
        </button>
        <button
          class="mode-btn"
          class:active={reviewMode === 'nda'}
          onclick={() => reviewMode = 'nda'}
        >
          <FileSearch size={14} />
          <span>NDA</span>
        </button>
        <button
          class="mode-btn"
          class:active={reviewMode === 'contract'}
          onclick={() => reviewMode = 'contract'}
        >
          <FileCheck size={14} />
          <span>Contract</span>
        </button>
        <button
          class="mode-btn"
          class:active={reviewMode === 'compliance'}
          onclick={() => reviewMode = 'compliance'}
        >
          <Shield size={14} />
          <span>DPA</span>
        </button>
      </div>

      <!-- NDA Info (shown when NDA mode) -->
      {#if reviewMode === 'nda' || (reviewMode === 'auto' && detectedType === 'nda')}
        <div class="info-box nda">
          <FileSearch size={14} />
          <span>10-point screening checklist for rapid NDA assessment</span>
        </div>

        <div class="classification-legend">
          <div class="legend-item green">
            <CheckCircle size={14} />
            <span><strong>GREEN</strong> - Standard Approval</span>
          </div>
          <div class="legend-item yellow">
            <AlertTriangle size={14} />
            <span><strong>YELLOW</strong> - Counsel Review</span>
          </div>
          <div class="legend-item red">
            <XCircle size={14} />
            <span><strong>RED</strong> - Significant Issues</span>
          </div>
        </div>
      {/if}

      <!-- Contract Review Options (shown when contract mode) -->
      {#if reviewMode === 'contract' || (reviewMode === 'auto' && detectedType === 'contract')}
        <div class="form-group">
          <label class="form-label" for="review-user-side">Your Side in Transaction</label>
          <select id="review-user-side" class="form-select" bind:value={userSide}>
            {#each userSideOptions as option}
              <option value={option.value}>{option.label}</option>
            {/each}
          </select>
        </div>

        <div class="form-group">
          <span class="form-label">Negotiation Posture</span>
          <div class="posture-toggle" role="radiogroup" aria-label="Negotiation posture">
            {#each [{ v: 'conservative', l: 'Conservative' }, { v: 'balanced', l: 'Balanced' }, { v: 'aggressive', l: 'Aggressive' }] as opt}
              <button
                type="button"
                class="posture-option"
                class:active={negotiationPosture === opt.v}
                role="radio"
                aria-checked={negotiationPosture === opt.v}
                onclick={() => (negotiationPosture = opt.v as typeof negotiationPosture)}
              >
                {opt.l}
              </button>
            {/each}
          </div>
          <span class="posture-hint">
            {negotiationPosture === 'conservative'
              ? 'Minimal, market-standard edits a counterparty will likely accept.'
              : negotiationPosture === 'aggressive'
                ? 'Strong, ambitious positions that push hard in your favor.'
                : 'Protects what matters while keeping the deal moving.'}
          </span>
        </div>

        <div class="form-group">
          <label class="form-label" for="review-contract-type">Contract Type (Optional)</label>
          <input
            id="review-contract-type"
            type="text"
            class="form-input"
            placeholder="e.g., MSA, SaaS, License"
            bind:value={contractType}
          />
        </div>

        <div class="form-group">
          <span class="form-label form-label-row">
            Focus Areas (Optional)
            <InfoTip
              align="right"
              text="Pick the clauses you most want scrutinized. Leaving all unchecked reviews the whole contract."
            />
          </span>
          <div class="checkbox-grid">
            {#each focusAreaOptions as area}
              <label class="checkbox-label">
                <input
                  type="checkbox"
                  checked={focusAreas.includes(area)}
                  onchange={() => toggleFocusArea(area)}
                />
                <span>{area.replace(/_/g, ' ')}</span>
              </label>
            {/each}
          </div>
        </div>

        <!-- Playbook Status -->
        <div class="playbook-status" class:active={hasPlaybook}>
          <BookOpen size={14} />
          {#if hasPlaybook}
            <span>Using playbook: <strong>{playbookStore.activeName}</strong></span>
          {:else}
            <span>No playbook selected. Choose one in the Playbooks tab, or review against market standards.</span>
          {/if}
        </div>
      {/if}

      <!-- Compliance Options (shown when compliance mode) -->
      {#if reviewMode === 'compliance' || (reviewMode === 'auto' && detectedType === 'dpa')}
        <div class="form-group">
          <label class="form-label" for="review-compliance-type">Review Type</label>
          <select id="review-compliance-type" class="form-select" bind:value={complianceType}>
            {#each complianceTypes as ct}
              <option value={ct.value}>{ct.label}</option>
            {/each}
          </select>
        </div>

        <div class="form-group">
          <label class="form-label" for="review-regulation">Regulation</label>
          <select id="review-regulation" class="form-select" bind:value={selectedRegulation}>
            {#each regulations as reg}
              <option value={reg.value}>{reg.label}</option>
            {/each}
          </select>
        </div>
      {/if}

      {#if documentStore.hasDocument}
        <DocScopeNotice
          totalChars={documentStore.characterCount}
          limit={DOC_CHAR_LIMITS.reviewFull}
          feature="Review"
        />
      {/if}

      <ErrorMessage message={error || ''} />

      <ActionButton
        onclick={handleReview}
        disabled={!documentStore.hasDocument}
        loading={isLoading}
        loadingText="Reviewing..."
        icon={Play}
      >
        Start Review
      </ActionButton>

      {#if isLoading}
        <div class="review-progress" role="status">
          <span class="progress-dot"></span>
          <span class="progress-msg">{REVIEW_STEPS[reviewStepIndex]}</span>
          <button type="button" class="cancel-btn" onclick={cancelReview}>Cancel</button>
        </div>
      {/if}
    </div>

  {:else}
    <!-- ============================================ -->
    <!-- Results Display -->
    <!-- ============================================ -->
    <div class="results-section">

      {#if documentChanged}
        <div class="changed-banner" role="status">
          <AlertTriangle size={15} />
          <span>This document changed after the review. The findings below may be out of date.</span>
          <button type="button" class="rerun" onclick={rerunReview} disabled={isLoading}>
            <RefreshCw size={13} />
            Re-run
          </button>
        </div>
      {/if}

      <!-- NDA Results -->
      {#if ndaResult}
        <!-- Classification Banner -->
        <div class="classification-banner" style="--class-color: {getRiskColor(ndaResult.classification)}; --class-bg: {getRiskBg(ndaResult.classification)}">
          <div class="classification-content">
            {#if ndaResult.classification === 'green'}
              <CheckCircle size={32} />
            {:else if ndaResult.classification === 'yellow'}
              <AlertTriangle size={32} />
            {:else}
              <XCircle size={32} />
            {/if}
            <div class="classification-text">
              <span class="classification-label">{ndaResult.classificationLabel || ndaResult.classification?.toUpperCase()}</span>
              <span class="classification-type">{ndaResult.ndaType?.replace(/-/g, ' ')}</span>
            </div>
          </div>
        </div>

        <!-- NDA Details -->
        <div class="details-card">
          <div class="detail-row">
            <span class="detail-label">Parties:</span>
            <span class="detail-value">{ndaResult.parties?.join(' & ') || 'Unknown'}</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">Term:</span>
            <span class="detail-value">{ndaResult.term || 'Not specified'}</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">Governing Law:</span>
            <span class="detail-value">{ndaResult.governingLaw || 'Not specified'}</span>
          </div>
        </div>

        <!-- Screening Results -->
        <div class="section-card">
          <SectionTitle>Screening Results</SectionTitle>
          <div class="screening-list">
            {#each ndaResult.screeningResults || [] as item}
              {@const StatusIcon = getStatusIcon(item.status)}
              <div class="screening-item" style="--status-color: {getStatusColor(item.status)}">
                <div class="screening-status">
                  <StatusIcon size={16} />
                </div>
                <div class="screening-content">
                  <span class="screening-criterion">{item.criterion}</span>
                  <span class="screening-notes">{item.notes}</span>
                </div>
              </div>
            {/each}
          </div>
        </div>

        <!-- Apply NDA redlines to the document (only issues with a concrete fix) -->
        <RedlineApplyBar items={ndaRedlineItems} />

        <!-- Issues Found -->
        {#if ndaResult.issuesFound && ndaResult.issuesFound.length > 0}
          <div class="section-card">
            <SectionTitle count={ndaResult.issuesFound.length}>Issues Found</SectionTitle>
            <div class="issues-list">
              {#each ndaResult.issuesFound as issue}
                <IssueCard
                  requirement={issue.title}
                  severity={issue.severity}
                  currentState={issue.description}
                  expectedState={issue.risk}
                  remediation={issue.suggestedFix}
                />
              {/each}
            </div>
          </div>
        {/if}

        <!-- Recommendation -->
        <div class="section-card">
          <SectionTitle>Recommendation</SectionTitle>
          <p class="section-text">{ndaResult.recommendation || 'No specific recommendation.'}</p>
        </div>

        <!-- Next Steps -->
        {#if ndaResult.nextSteps && ndaResult.nextSteps.length > 0}
          <div class="section-card">
            <SectionTitle>Next Steps</SectionTitle>
            <ol class="steps-list">
              {#each ndaResult.nextSteps as step}
                <li>{step}</li>
              {/each}
            </ol>
          </div>
        {/if}
      {/if}

      <!-- Contract Results -->
      {#if contractResult}
        {@const OverallRiskIcon = getRiskIcon(contractResult.overallRisk)}
        <!-- Sticky verdict header + apply bar: stays pinned while findings scroll -->
        <div class="review-sticky">
          <div class="risk-summary" style="--risk-color: {getRiskColor(contractResult.overallRisk)}">
            <div class="risk-badge">
              <OverallRiskIcon size={24} />
              <span class="risk-label">{contractResult.overallRisk?.toUpperCase()}</span>
            </div>
            <div class="doc-info">
              <span class="doc-title">{contractResult.documentInfo?.title || 'Contract'}</span>
              <span class="doc-type">{contractResult.documentInfo?.contractType || 'Unknown type'}</span>
            </div>
          </div>

          <!-- Apply redlines to the document (native tracked changes, with fallback) -->
          <RedlineApplyBar items={contractRedlineItems} />
        </div>

        {#if contractResult.reviewCoverage && contractResult.reviewCoverage.chunks > 1}
          <p class="coverage-note">
            Long document reviewed in {contractResult.reviewCoverage.chunks} merged sections.
            {#if contractResult.reviewCoverage.partial}
              It was too long to cover fully, so the later part was not reviewed.
            {/if}
          </p>
        {/if}

        <!-- Key Findings -->
        <div class="section-card">
          <SectionTitle count={contractResult.keyFindings?.length || 0}>Key Findings</SectionTitle>

          {#if contractResult.keyFindings && contractResult.keyFindings.length > 0}
            <div class="findings-layout">
              {#if contractResult.keyFindings.length > 1}
                <div class="clause-rail" aria-label="Clause map">
                  {#each contractResult.keyFindings as f, i}
                    <button
                      class="tick"
                      class:active={expandedFindings.has(i)}
                      class:synced={syncedFinding === i}
                      style="--risk-color: {getRiskColor(f.riskLevel)}"
                      title={f.clauseTitle}
                      aria-label={f.clauseTitle}
                      onclick={() => focusFinding(i)}
                    ></button>
                  {/each}
                </div>
              {/if}
              <div class="findings-list">
              {#each contractResult.keyFindings as finding, index}
                {@const isOpen = expandedFindings.has(index)}
                {@const canApply = !!(finding.redlineSuggestion?.originalText && finding.redlineSuggestion?.suggestedText)}
                <div
                  id="finding-{index}"
                  class="finding-card"
                  class:applied={appliedFindings.has(index)}
                  class:synced={syncedFinding === index}
                  style="--risk-color: {getRiskColor(finding.riskLevel)}"
                >
                  <button class="finding-header" onclick={() => toggleFinding(index)} aria-expanded={isOpen}>
                    <span class="sev-dot"></span>
                    <span class="finding-heading">
                      <span class="finding-name">{finding.clauseTitle}</span>
                      {#if !isOpen}
                        <span class="finding-preview">{finding.deviation}</span>
                      {/if}
                    </span>
                    {#if isOpen}
                      <ChevronUp size={16} class="finding-chevron" />
                    {:else}
                      <ChevronDown size={16} class="finding-chevron" />
                    {/if}
                  </button>

                  {#if isOpen}
                    <div class="finding-body">
                      <div class="finding-field">
                        <span class="field-label">Current language</span>
                        <p class="field-value quote">"{finding.currentLanguage}"</p>
                      </div>

                      <div class="finding-field">
                        <span class="field-label">Deviation</span>
                        <p class="field-value">{finding.deviation}</p>
                      </div>

                      <div class="finding-field">
                        <span class="field-label">Business impact</span>
                        <p class="field-value">{finding.businessImpact}</p>
                      </div>

                      {#if finding.redlineSuggestion}
                        <div class="finding-field suggestion">
                          <span class="field-label">Suggested change</span>
                          <p class="field-value">{finding.redlineSuggestion.suggestedText}</p>
                          <p class="field-rationale">{finding.redlineSuggestion.rationale}</p>
                        </div>
                      {/if}

                      <div class="finding-actions">
                        {#if finding.charStart !== undefined}
                          <button class="finding-action" onclick={() => handleNavigate(finding.charStart)}>
                            <FileSearch size={14} />
                            Go to clause
                          </button>
                        {/if}
                        {#if canApply}
                          {#if appliedFindings.has(index)}
                            <span class="finding-applied">
                              <CheckCircle size={14} />
                              Applied
                            </span>
                          {:else}
                            <button
                              class="finding-action primary"
                              disabled={applyingFinding === index}
                              onclick={() => applyOneRedline(finding, index)}
                            >
                              <Sparkles size={14} />
                              {applyingFinding === index ? 'Applying...' : 'Apply redline'}
                            </button>
                            {#if finding.redlineSuggestion?.fallbackPosition}
                              <button
                                class="finding-action"
                                disabled={applyingFinding === index}
                                onclick={() => applyOneRedline(finding, index, true)}
                                title="Apply the compromise position instead"
                              >
                                Use fallback
                              </button>
                            {/if}
                          {/if}
                        {/if}
                        {#if citedFindings.has(index)}
                          <span class="finding-applied">
                            <CheckCircle size={14} />
                            Cited
                          </span>
                        {:else}
                          <button
                            class="finding-action"
                            disabled={citingFinding === index}
                            onclick={() => citeAuthority(finding, index)}
                          >
                            <BookOpen size={14} />
                            {citingFinding === index ? 'Researching...' : 'Cite authority'}
                          </button>
                        {/if}
                      </div>
                    </div>
                  {/if}
                </div>
              {/each}
              </div>
            </div>
          {:else}
            <p class="no-findings">No significant issues found.</p>
          {/if}
        </div>

        <!-- Negotiation Strategy -->
        {#if contractResult.negotiationStrategy}
          <div class="section-card">
            <SectionTitle>Negotiation Strategy</SectionTitle>
            <p class="section-text">{contractResult.negotiationStrategy.overallApproach}</p>

            {#if contractResult.negotiationStrategy.tier1MustHaves?.length > 0}
              <div class="strategy-tier">
                <h4 class="tier-title red">Must-Have</h4>
                <ul class="tier-list">
                  {#each contractResult.negotiationStrategy.tier1MustHaves as item}
                    <li>{item}</li>
                  {/each}
                </ul>
              </div>
            {/if}

            {#if contractResult.negotiationStrategy.tier2ShouldHaves?.length > 0}
              <div class="strategy-tier">
                <h4 class="tier-title yellow">Should-Have</h4>
                <ul class="tier-list">
                  {#each contractResult.negotiationStrategy.tier2ShouldHaves as item}
                    <li>{item}</li>
                  {/each}
                </ul>
              </div>
            {/if}
          </div>
        {/if}

        <!-- Next Steps -->
        {#if contractResult.nextSteps && contractResult.nextSteps.length > 0}
          <div class="section-card">
            <SectionTitle>Next Steps</SectionTitle>
            <ol class="steps-list">
              {#each contractResult.nextSteps as step}
                <li>{step}</li>
              {/each}
            </ol>
          </div>
        {/if}
      {/if}

      <!-- Compliance Results -->
      {#if complianceResult}
        <!-- Score Header -->
        <div class="compliance-header" style="--risk-color: {getRiskColor(complianceResult.overallStatus)}">
          <div class="score-circle">
            <span class="score-value">{complianceStats()?.score || 0}%</span>
          </div>
          <div class="score-info">
            <span class="score-label">Compliance Score</span>
            <span class="score-subtitle">{complianceResult.reviewType}</span>
          </div>
        </div>

        {#if complianceStats()}
          <StatsBar
            compliant={complianceStats()!.compliant}
            partial={complianceStats()!.partial}
            nonCompliant={complianceStats()!.nonCompliant}
          />
        {/if}

        <RegulationTags regulations={complianceResult.applicableRegulations} />

        <!-- Checklist Results -->
        <div class="section-card">
          <SectionTitle>Checklist Results</SectionTitle>
          <div class="checklist">
            {#each complianceResult.checklistResults as item, index}
              <ChecklistItem
                category={item.category}
                requirement={item.requirement}
                status={item.status}
                notes={item.notes}
                reference={item.reference}
                expanded={expandedItems.has(index)}
                onToggle={() => toggleExpand(index)}
              />
            {/each}
          </div>
        </div>

        <!-- Issues Found -->
        {#if complianceResult.issues.length > 0}
          <div class="section-card">
            <SectionTitle count={complianceResult.issues.length}>Issues Found</SectionTitle>
            <div class="issues-list">
              {#each complianceResult.issues as issue}
                <IssueCard
                  requirement={issue.requirement}
                  severity={issue.severity}
                  currentState={issue.currentState}
                  expectedState={issue.expectedState}
                  remediation={issue.remediation}
                  deadline={issue.deadline}
                />
              {/each}
            </div>
          </div>
        {/if}

        <!-- Recommendations -->
        {#if complianceResult.recommendations.length > 0}
          <div class="section-card">
            <SectionTitle>Recommendations</SectionTitle>
            <ul class="steps-list">
              {#each complianceResult.recommendations as rec}
                <li>{rec}</li>
              {/each}
            </ul>
          </div>
        {/if}

        <!-- Next Steps -->
        {#if complianceResult.nextSteps.length > 0}
          <div class="section-card">
            <SectionTitle>Next Steps</SectionTitle>
            <ol class="steps-list">
              {#each complianceResult.nextSteps as step}
                <li>{step}</li>
              {/each}
            </ol>
          </div>
        {/if}
      {/if}

      <!-- Action Buttons -->
      <div class="action-buttons">
        <ActionButton onclick={handleReset} variant="secondary">
          Start Over
        </ActionButton>
        <ActionButton onclick={handleInsertReport} icon={FileInput}>
          Add to Document
        </ActionButton>
      </div>
    </div>
  {/if}
</div>

<style>
  .panel {
    /* The panel container already applies padding; keep this flush so Review
       lines up with the other tabs instead of being double-inset. */
    padding: 0;
  }

  .panel-header {
    margin-bottom: var(--spacing-lg);
  }

  .panel-title-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 6px;
  }

  .panel-title {
    font-size: 1.125rem;
    font-weight: 600;
    color: var(--color-gray-900);
    margin: 0;
  }

  .form-label-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 6px;
  }

  .panel-subtitle {
    font-size: 0.875rem;
    color: var(--color-gray-500);
    margin: var(--spacing-xs) 0 0;
  }

  .detected-badge {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 2px 8px;
    background: #e8f0fe;
    color: var(--color-primary);
    border-radius: var(--radius-full);
    font-size: 0.75rem;
    font-weight: 500;
  }

  /* Mode Selector */
  .mode-selector {
    display: flex;
    gap: 4px;
    padding: 4px;
    background-color: var(--color-gray-100);
    border-radius: var(--radius-lg);
  }

  .mode-btn {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
    padding: var(--spacing-sm) var(--spacing-xs);
    border: none;
    background: none;
    border-radius: var(--radius-md);
    font-size: 0.75rem;
    color: var(--color-gray-600);
    cursor: pointer;
    transition: all var(--transition-fast);
  }

  .mode-btn:hover {
    color: var(--color-gray-800);
    background-color: var(--color-gray-50);
  }

  .mode-btn.active {
    background-color: white;
    color: var(--color-primary);
    box-shadow: var(--shadow-sm);
  }

  /* Form Section */
  .form-section {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-md);
  }

  .review-progress {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 10px;
    background: var(--color-gray-50);
    border: 1px solid var(--color-gray-200);
    border-radius: var(--radius-sm);
    font-size: 12px;
    color: var(--color-gray-600);
  }

  .progress-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--color-primary);
    flex-shrink: 0;
    animation: progress-pulse 1.2s ease-in-out infinite;
  }

  @keyframes progress-pulse {
    0%, 100% { opacity: 0.3; }
    50% { opacity: 1; }
  }

  .progress-msg {
    flex: 1;
    min-width: 0;
  }

  .cancel-btn {
    flex-shrink: 0;
    padding: 4px 10px;
    border: 1px solid var(--color-gray-300);
    border-radius: var(--radius-sm);
    background: white;
    color: var(--color-gray-700);
    font-size: 12px;
    font-weight: 500;
    cursor: pointer;
  }

  .cancel-btn:hover {
    background: var(--color-gray-100);
  }

  .form-group {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-xs);
  }

  .form-label {
    font-size: 0.875rem;
    font-weight: 500;
    color: var(--color-gray-700);
  }

  .form-select,
  .form-input {
    padding: var(--spacing-sm);
    border: 1px solid var(--color-gray-300);
    border-radius: var(--radius-md);
    font-size: 0.875rem;
  }

  .checkbox-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--spacing-xs);
  }

  .checkbox-label {
    display: flex;
    align-items: center;
    gap: var(--spacing-xs);
    font-size: 0.75rem;
    color: var(--color-gray-600);
    cursor: pointer;
  }

  .checkbox-label input {
    margin: 0;
  }

  .info-box {
    display: flex;
    align-items: center;
    gap: var(--spacing-sm);
    padding: var(--spacing-sm);
    background-color: var(--color-gray-100);
    border-radius: var(--radius-md);
    font-size: 0.813rem;
    color: var(--color-gray-600);
  }

  .info-box.nda {
    background-color: #e8f0fe;
    color: var(--color-primary);
  }

  .classification-legend {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-xs);
  }

  .legend-item {
    display: flex;
    align-items: center;
    gap: var(--spacing-xs);
    font-size: 0.75rem;
    padding: var(--spacing-xs) var(--spacing-sm);
    border-radius: var(--radius-sm);
  }

  .legend-item.green { background-color: var(--color-success-bg, #f0fdf4); color: var(--color-success); }
  .legend-item.yellow { background-color: var(--color-warning-bg, #fffbeb); color: var(--color-warning); }
  .legend-item.red { background-color: var(--color-danger-bg, #fce8e6); color: var(--color-danger); }

  .playbook-status {
    display: flex;
    align-items: center;
    gap: var(--spacing-xs);
    padding: var(--spacing-sm);
    background-color: var(--color-gray-100);
    border-radius: var(--radius-md);
    font-size: 0.75rem;
    color: var(--color-gray-500);
  }

  .playbook-status.active {
    background-color: var(--color-primary-light, #eff6ff);
    color: var(--color-primary);
  }

  /* Results Section */
  .results-section {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-lg);
  }

  .coverage-note {
    margin: 0;
    padding: 6px 10px;
    background: var(--color-gray-50);
    border: 1px solid var(--color-gray-200);
    border-radius: var(--radius-sm);
    font-size: 11px;
    line-height: 1.45;
    color: var(--color-gray-600);
  }

  .changed-banner {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 10px;
    background: var(--color-warning-bg);
    border: 1px solid #f6d38a;
    border-radius: var(--radius-sm);
    font-size: 11px;
    line-height: 1.4;
    color: #8a5300;
  }

  .changed-banner :global(svg) {
    flex-shrink: 0;
    color: var(--color-warning);
  }

  .changed-banner span {
    flex: 1;
    min-width: 0;
  }

  .changed-banner .rerun {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    flex-shrink: 0;
    padding: 5px 10px;
    border: 1px solid var(--color-warning);
    border-radius: var(--radius-sm);
    background: white;
    color: #8a5300;
    font-size: 11px;
    font-weight: 500;
    cursor: pointer;
  }

  .changed-banner .rerun:hover:not(:disabled) {
    background: #fff3d6;
  }

  .changed-banner .rerun:disabled {
    opacity: 0.6;
    cursor: default;
  }

  /* Classification Banner (NDA) */
  .classification-banner {
    padding: var(--spacing-lg);
    background-color: var(--class-bg);
    border-radius: var(--radius-lg);
    border-left: 4px solid var(--class-color);
  }

  .classification-content {
    display: flex;
    align-items: center;
    gap: var(--spacing-md);
    color: var(--class-color);
  }

  .classification-text {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .classification-label {
    font-size: 1.125rem;
    font-weight: 700;
  }

  .classification-type {
    font-size: 0.875rem;
    text-transform: capitalize;
    opacity: 0.8;
  }

  /* Details Card */
  .details-card {
    padding: var(--spacing-md);
    background-color: var(--color-gray-50);
    border-radius: var(--radius-md);
  }

  .detail-row {
    display: flex;
    gap: var(--spacing-sm);
    padding: var(--spacing-xs) 0;
    border-bottom: 1px solid var(--color-gray-200);
  }

  .detail-row:last-child {
    border-bottom: none;
  }

  .detail-label {
    font-size: 0.813rem;
    font-weight: 600;
    color: var(--color-gray-600);
    min-width: 100px;
  }

  .detail-value {
    font-size: 0.813rem;
    color: var(--color-gray-800);
  }

  /* Section Card */
  .section-card {
    padding: var(--spacing-md);
    background-color: var(--color-gray-50);
    border-radius: var(--radius-md);
  }

  .section-text {
    font-size: 0.875rem;
    color: var(--color-gray-700);
    margin: 0;
    line-height: 1.5;
  }

  /* Screening List (NDA) */
  .screening-list {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-xs);
  }

  .screening-item {
    display: flex;
    gap: var(--spacing-sm);
    padding: var(--spacing-xs);
    background-color: white;
    border-radius: var(--radius-sm);
    border-left: 3px solid var(--status-color);
  }

  .screening-status {
    color: var(--status-color);
    flex-shrink: 0;
  }

  .screening-content {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }

  .screening-criterion {
    font-size: 0.813rem;
    font-weight: 500;
    color: var(--color-gray-800);
  }

  .screening-notes {
    font-size: 0.75rem;
    color: var(--color-gray-500);
  }

  .issues-list {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-sm);
  }

  .steps-list {
    margin: 0;
    padding-left: var(--spacing-lg);
    font-size: 0.875rem;
    color: var(--color-gray-700);
    line-height: 1.6;
  }

  .steps-list li {
    margin-bottom: var(--spacing-xs);
  }

  /* Risk Summary (Contract) */
  .risk-summary {
    display: flex;
    align-items: center;
    gap: var(--spacing-md);
    padding: var(--spacing-md);
    background-color: var(--color-gray-50);
    border-radius: var(--radius-lg);
    border-left: 4px solid var(--risk-color);
  }

  .risk-badge {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--spacing-xs);
    color: var(--risk-color);
  }

  .risk-label {
    font-size: 0.75rem;
    font-weight: 700;
  }

  .doc-info {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .doc-title {
    font-weight: 600;
    color: var(--color-gray-900);
  }

  .doc-type {
    font-size: 0.75rem;
    color: var(--color-gray-500);
  }

  /* Findings List (Contract) */
  .findings-layout {
    display: flex;
    gap: var(--spacing-sm);
    align-items: flex-start;
  }

  .clause-rail {
    position: sticky;
    top: 96px;
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding-top: 4px;
    flex-shrink: 0;
  }

  .tick {
    width: 10px;
    height: 18px;
    padding: 0;
    border: none;
    border-radius: 3px;
    background: var(--risk-color);
    opacity: 0.35;
    cursor: pointer;
    transition: opacity 0.15s ease, transform 0.15s ease;
  }

  .tick:hover {
    opacity: 0.7;
  }

  .tick.active {
    opacity: 1;
  }

  .tick.synced {
    opacity: 1;
    transform: scaleX(1.4);
  }

  .findings-list {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: var(--spacing-sm);
  }

  .finding-card.synced {
    box-shadow: 0 0 0 2px var(--color-primary, #1a73e8);
  }

  .posture-toggle {
    display: flex;
    gap: 4px;
    background: var(--color-gray-100, #f1f3f4);
    padding: 3px;
    border-radius: 8px;
  }

  .posture-option {
    flex: 1;
    padding: 6px 4px;
    border: none;
    border-radius: 6px;
    background: transparent;
    font-size: 0.75rem;
    font-weight: 500;
    color: var(--color-gray-600, #5f6368);
    cursor: pointer;
    transition: background 0.15s ease, color 0.15s ease;
  }

  .posture-option.active {
    background: white;
    color: var(--color-primary, #1a73e8);
    box-shadow: 0 1px 2px rgba(15, 23, 42, 0.12);
  }

  .posture-hint {
    display: block;
    margin-top: 6px;
    font-size: 0.7rem;
    color: var(--color-gray-500, #5f6368);
    line-height: 1.4;
  }

  .finding-card {
    border: 1px solid var(--color-gray-200);
    border-radius: var(--radius-md);
    border-left: 3px solid var(--risk-color);
    overflow: hidden;
    background-color: white;
  }

  .finding-header {
    display: flex;
    align-items: center;
    gap: var(--spacing-sm);
    width: 100%;
    padding: var(--spacing-sm);
    background: none;
    border: none;
    cursor: pointer;
    text-align: left;
    transition: background 0.15s ease;
  }

  .finding-header:hover {
    background: var(--color-gray-50, #f8f9fa);
  }

  .sev-dot {
    flex-shrink: 0;
    width: 9px;
    height: 9px;
    border-radius: 50%;
    background: var(--risk-color);
  }

  .finding-heading {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
    flex: 1;
  }

  .finding-name {
    font-size: 0.875rem;
    font-weight: 600;
    color: var(--color-gray-900, #202124);
  }

  .finding-preview {
    font-size: 0.75rem;
    color: var(--color-gray-500, #5f6368);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 100%;
  }

  :global(.finding-chevron) {
    flex-shrink: 0;
    color: var(--color-gray-400, #bdc1c6);
  }

  .finding-actions {
    display: flex;
    gap: var(--spacing-xs);
    flex-wrap: wrap;
    margin-top: 4px;
  }

  .finding-action {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    font-size: 0.75rem;
    font-weight: 500;
    padding: 6px 10px;
    border-radius: var(--radius-sm, 6px);
    border: 1px solid var(--color-gray-200, #e8eaed);
    background: white;
    color: var(--color-gray-700, #3c4043);
    cursor: pointer;
    transition: background 0.15s ease;
  }

  .finding-action:hover:not(:disabled) {
    background: var(--color-gray-50, #f8f9fa);
  }

  .finding-action.primary {
    border-color: var(--color-primary, #1a73e8);
    color: var(--color-primary, #1a73e8);
  }

  .finding-action.primary:hover:not(:disabled) {
    background: color-mix(in srgb, var(--color-primary, #1a73e8) 8%, transparent);
  }

  .finding-action:disabled {
    opacity: 0.6;
    cursor: default;
  }

  .finding-applied {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    font-size: 0.75rem;
    font-weight: 500;
    color: var(--color-success, #34a853);
  }

  .finding-card.applied {
    opacity: 0.9;
  }

  .review-sticky {
    position: sticky;
    top: calc(var(--spacing-md) * -1);
    z-index: 10;
    background: var(--color-gray-50, #f8f9fa);
    padding: var(--spacing-sm) 0;
    margin-bottom: var(--spacing-xs);
    box-shadow: 0 6px 10px -8px rgba(15, 23, 42, 0.3);
  }

  .finding-body {
    padding: var(--spacing-sm);
    padding-top: 0;
    display: flex;
    flex-direction: column;
    gap: var(--spacing-sm);
  }

  .finding-field {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .field-label {
    font-size: 0.75rem;
    font-weight: 600;
    color: var(--color-gray-600);
  }

  .field-value {
    font-size: 0.813rem;
    color: var(--color-gray-700);
    margin: 0;
  }

  .field-value.quote {
    font-style: italic;
    background-color: var(--color-gray-50);
    padding: var(--spacing-xs);
    border-radius: var(--radius-sm);
  }

  .field-rationale {
    font-size: 0.75rem;
    color: var(--color-gray-500);
    margin: var(--spacing-xs) 0 0;
  }

  .finding-field.suggestion {
    background-color: var(--color-primary-light);
    padding: var(--spacing-sm);
    border-radius: var(--radius-sm);
  }

  .no-findings {
    font-size: 0.875rem;
    color: var(--color-gray-500);
    text-align: center;
    padding: var(--spacing-md);
  }

  .strategy-tier {
    margin-top: var(--spacing-sm);
  }

  .tier-title {
    font-size: 0.75rem;
    font-weight: 600;
    margin: 0 0 var(--spacing-xs);
  }

  .tier-title.red { color: var(--color-danger); }
  .tier-title.yellow { color: var(--color-warning); }

  .tier-list {
    margin: 0;
    padding-left: var(--spacing-lg);
    font-size: 0.813rem;
    color: var(--color-gray-600);
  }

  .tier-list li {
    margin-bottom: 2px;
  }

  /* Compliance Header */
  .compliance-header {
    display: flex;
    align-items: center;
    gap: var(--spacing-md);
    padding: var(--spacing-md);
    background-color: var(--color-gray-50);
    border-radius: var(--radius-lg);
    border-left: 4px solid var(--risk-color);
  }

  .score-circle {
    width: 64px;
    height: 64px;
    border-radius: 50%;
    background-color: white;
    display: flex;
    align-items: center;
    justify-content: center;
    border: 3px solid var(--risk-color);
  }

  .score-value {
    font-size: 1.25rem;
    font-weight: 700;
    color: var(--risk-color);
  }

  .score-info {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .score-label {
    font-size: 1rem;
    font-weight: 600;
    color: var(--color-gray-900);
  }

  .score-subtitle {
    font-size: 0.813rem;
    color: var(--color-gray-500);
    text-transform: capitalize;
  }

  .checklist {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .action-buttons {
    display: flex;
    gap: var(--spacing-sm);
  }

  .action-buttons :global(.btn) {
    flex: 1;
  }
</style>
