<script lang="ts">
  import type { RiskLevel } from '$shared/types';
  import { getRiskSolidBg } from '../../utils/riskHelpers';

  interface Props {
    score: number;
    scoreLabel: string;
    subtitle: string;
    riskLevel: RiskLevel;
    onReset: () => void;
  }

  let { score, scoreLabel, subtitle, riskLevel, onReset }: Props = $props();
</script>

<div class="results-header">
  <div class="score-display">
    <div class="score-circle {getRiskSolidBg(riskLevel)}">
      <span class="score-value">{score}%</span>
    </div>
    <div class="score-details">
      <span class="score-label">{scoreLabel}</span>
      <span class="subtitle">{subtitle}</span>
    </div>
  </div>
  <button class="back-button" onclick={onReset}>Start Over</button>
</div>

<style>
  .results-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding-bottom: 12px;
    border-bottom: 1px solid var(--color-gray-200, #e8eaed);
  }

  .score-display {
    display: flex;
    align-items: center;
    gap: 12px;
    min-width: 0;
  }

  .score-circle {
    width: 56px;
    height: 56px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    color: white;
    flex-shrink: 0;
  }

  .score-value {
    font-size: 16px;
    font-weight: 700;
  }

  .score-details {
    display: flex;
    flex-direction: column;
    min-width: 0;
  }

  .score-label {
    font-size: 14px;
    font-weight: 600;
    color: var(--color-gray-900, #202124);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .subtitle {
    font-size: 11px;
    color: var(--color-gray-500, #5f6368);
  }

  .back-button {
    padding: 6px 12px;
    background: var(--color-gray-100, #f1f3f4);
    border: 1px solid var(--color-gray-200, #e8eaed);
    border-radius: 4px;
    font-size: 12px;
    color: var(--color-gray-500, #5f6368);
    cursor: pointer;
    flex-shrink: 0;
  }

  .back-button:hover {
    background: var(--color-gray-200, #e8eaed);
  }
</style>
