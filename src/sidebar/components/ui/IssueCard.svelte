<script lang="ts">
  import type { RiskLevel } from '$shared/types';
  import { getRiskBadgeClasses } from '../../utils/riskHelpers';

  interface Props {
    requirement: string;
    severity: RiskLevel | string;
    currentState: string;
    expectedState: string;
    remediation: string;
    deadline?: string;
  }

  let { requirement, severity, currentState, expectedState, remediation, deadline }: Props = $props();
</script>

<div class="issue-card {getRiskBadgeClasses(severity as RiskLevel)}">
  <div class="issue-header">
    <span class="issue-requirement">{requirement}</span>
    <span class="severity-badge">{String(severity).toUpperCase()}</span>
  </div>
  <div class="issue-body">
    <div class="issue-row">
      <span class="issue-label">Current State:</span>
      <span class="issue-value">{currentState}</span>
    </div>
    <div class="issue-row">
      <span class="issue-label">Expected:</span>
      <span class="issue-value">{expectedState}</span>
    </div>
    <div class="issue-row">
      <span class="issue-label">Remediation:</span>
      <span class="issue-value remediation">{remediation}</span>
    </div>
    {#if deadline}
      <div class="issue-row">
        <span class="issue-label">Deadline:</span>
        <span class="issue-value deadline">{deadline}</span>
      </div>
    {/if}
  </div>
</div>

<style>
  .issue-card {
    padding: 12px;
    border-radius: 6px;
    border: 1px solid;
  }

  .issue-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 8px;
    margin-bottom: 8px;
  }

  .issue-requirement {
    font-size: 12px;
    font-weight: 600;
    color: var(--color-gray-800);
  }

  .severity-badge {
    padding: 2px 6px;
    border-radius: 3px;
    font-size: 9px;
    font-weight: 600;
    background: rgba(0,0,0,0.1);
  }

  .issue-body {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .issue-row {
    display: flex;
    gap: 8px;
    font-size: 11px;
  }

  .issue-label {
    font-weight: 500;
    color: rgba(0,0,0,0.6);
    flex-shrink: 0;
    width: 80px;
  }

  .issue-value {
    color: var(--color-gray-800);
  }

  .issue-value.remediation {
    color: var(--color-success);
  }

  .issue-value.deadline {
    color: var(--color-danger);
    font-weight: 500;
  }
</style>
