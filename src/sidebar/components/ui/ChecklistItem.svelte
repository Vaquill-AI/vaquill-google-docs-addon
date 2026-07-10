<script lang="ts">
  import { ChevronDown, ChevronUp } from '@lucide/svelte';
  import {
    getComplianceStatusColor,
    getComplianceStatusIcon,
    getComplianceStatusLabel
  } from '../../utils/riskHelpers';
  import type { ComplianceStatus } from '../../utils/riskHelpers';

  interface Props {
    category: string;
    requirement: string;
    status: ComplianceStatus;
    notes?: string;
    reference?: string;
    expanded: boolean;
    onToggle: () => void;
  }

  let { category, requirement, status, notes, reference, expanded, onToggle }: Props = $props();

  let StatusIcon = $derived(getComplianceStatusIcon(status));
</script>

<div class="checklist-item" class:expanded>
  <button class="checklist-header" onclick={onToggle} aria-expanded={expanded}>
    <div class="checklist-status {getComplianceStatusColor(status)}">
      <StatusIcon size={16} />
    </div>
    <div class="checklist-content">
      <span class="checklist-category">{category}</span>
      <span class="checklist-requirement">{requirement}</span>
    </div>
    <div class="expand-icon">
      {#if expanded}
        <ChevronUp size={16} />
      {:else}
        <ChevronDown size={16} />
      {/if}
    </div>
  </button>
  {#if expanded}
    <div class="checklist-details">
      <div class="detail-row">
        <span class="detail-label">Status:</span>
        <span class="detail-value {getComplianceStatusColor(status)}">{getComplianceStatusLabel(status)}</span>
      </div>
      {#if notes}
        <div class="detail-row">
          <span class="detail-label">Notes:</span>
          <span class="detail-value">{notes}</span>
        </div>
      {/if}
      {#if reference}
        <div class="detail-row">
          <span class="detail-label">Reference:</span>
          <span class="detail-value reference">{reference}</span>
        </div>
      {/if}
    </div>
  {/if}
</div>

<style>
  .checklist-item {
    border: 1px solid var(--color-gray-300);
    border-radius: 6px;
    overflow: hidden;
  }

  .checklist-header {
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
    padding: 10px;
    background: white;
    border: none;
    cursor: pointer;
    text-align: left;
  }

  .checklist-header:hover {
    background: var(--color-gray-50);
  }

  .checklist-status {
    flex-shrink: 0;
  }

  .checklist-content {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }

  .checklist-category {
    font-size: 10px;
    font-weight: 600;
    color: var(--color-gray-600);
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .checklist-requirement {
    font-size: 12px;
    color: var(--color-gray-800);
  }

  .expand-icon {
    flex-shrink: 0;
    color: #bdc1c6;
  }

  .checklist-details {
    padding: 10px;
    background: var(--color-gray-50);
    border-top: 1px solid var(--color-gray-300);
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .detail-row {
    display: flex;
    gap: 8px;
    font-size: 11px;
  }

  .detail-label {
    font-weight: 500;
    color: var(--color-gray-600);
    flex-shrink: 0;
    width: 60px;
  }

  .detail-value {
    color: var(--color-gray-800);
  }

  .detail-value.reference {
    font-family: monospace;
    font-size: 10px;
    color: var(--color-primary, #1a73e8);
  }

  .text-green-600 { color: #188038; }
  .text-yellow-600 { color: #e37400; }
  .text-red-600 { color: var(--color-danger); }
  .text-gray-400 { color: #bdc1c6; }
  .text-gray-500 { color: #80868b; }
</style>
