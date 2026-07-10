<script lang="ts">
  import { AlertCircle } from '@lucide/svelte';
  import { getRiskColor, getRiskBg, getRiskLabel } from '../../utils/riskHelpers';
  import type { RiskLevel } from '$shared/types';

  interface Props {
    riskScore: number;
    riskLevel: RiskLevel;
    category?: string;
    escalationRequired?: boolean;
  }

  let { riskScore, riskLevel, category, escalationRequired = false }: Props = $props();
</script>

<div class="risk-score-card" style="--risk-color: {getRiskColor(riskLevel)}; --risk-bg: {getRiskBg(riskLevel)}">
  <div class="score-circle">
    <span class="score-value">{riskScore}</span>
    <span class="score-max">/25</span>
  </div>
  <div class="score-info">
    <span class="score-label">{getRiskLabel(riskScore)}</span>
    {#if category}
      <span class="score-category">{category.replace(/_/g, ' ')}</span>
    {/if}
  </div>
  {#if escalationRequired}
    <div class="escalation-badge">
      <AlertCircle size={14} />
      Escalation Required
    </div>
  {/if}
</div>

<style>
  .risk-score-card {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: var(--spacing-md, 16px);
    padding: var(--spacing-lg, 24px);
    background-color: var(--risk-bg);
    border-radius: var(--radius-lg, 12px);
    border-left: 4px solid var(--risk-color);
  }

  .score-circle {
    width: 64px;
    height: 64px;
    border-radius: 50%;
    background-color: white;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    border: 3px solid var(--risk-color);
  }

  .score-value {
    font-size: 1.5rem;
    font-weight: 700;
    color: var(--risk-color);
    line-height: 1;
  }

  .score-max {
    font-size: 0.75rem;
    color: var(--color-gray-500, #5f6368);
  }

  .score-info {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .score-label {
    font-size: 1rem;
    font-weight: 700;
    color: var(--risk-color);
  }

  .score-category {
    font-size: 0.813rem;
    color: var(--color-gray-600, #5f6368);
    text-transform: capitalize;
  }

  .escalation-badge {
    display: inline-flex;
    align-items: center;
    gap: var(--spacing-xs, 4px);
    padding: var(--spacing-xs, 4px) var(--spacing-sm, 8px);
    background-color: var(--color-danger, #d93025);
    color: white;
    font-size: 0.75rem;
    font-weight: 600;
    border-radius: var(--radius-full, 9999px);
  }
</style>
