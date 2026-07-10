<script lang="ts">
  interface Props {
    title: string;
    description?: string;
    level: number;
    maxLevel?: number;
    rationale?: string;
  }

  let { title, description, level, maxLevel = 5, rationale }: Props = $props();

  let percentage = $derived(
    Math.min(100, Math.max(0, maxLevel ? (level / maxLevel) * 100 : 0))
  );
</script>

<div class="assessment-breakdown">
  <div class="assessment-row">
    <div class="assessment-label">
      <span class="label-title">{title}</span>
      {#if description}
        <span class="label-desc">{description}</span>
      {/if}
    </div>
    <div
      class="assessment-bar"
      role="progressbar"
      aria-valuenow={level}
      aria-valuemin={0}
      aria-valuemax={maxLevel}
    >
      <div class="bar-fill" style="width: {percentage}%"></div>
    </div>
    <span class="assessment-value">{level}/{maxLevel}</span>
  </div>
  {#if rationale}
    <p class="assessment-rationale">{rationale}</p>
  {/if}
</div>

<style>
  .assessment-breakdown {
    padding: var(--spacing-md, 16px);
    background-color: var(--color-gray-50, #f8f9fa);
    border-radius: var(--radius-md, 8px);
  }

  .assessment-row {
    display: flex;
    align-items: center;
    gap: var(--spacing-sm, 8px);
  }

  .assessment-label {
    min-width: 100px;
  }

  .label-title {
    display: block;
    font-size: 0.813rem;
    font-weight: 600;
    color: var(--color-gray-700, #3c4043);
  }

  .label-desc {
    display: block;
    font-size: 0.75rem;
    color: var(--color-gray-500, #5f6368);
  }

  .assessment-bar {
    flex: 1;
    height: 8px;
    background-color: var(--color-gray-200, #e8eaed);
    border-radius: var(--radius-full, 9999px);
    overflow: hidden;
  }

  .bar-fill {
    height: 100%;
    background-color: var(--color-primary, #1a73e8);
    border-radius: var(--radius-full, 9999px);
    transition: width 0.3s ease;
  }

  .assessment-value {
    font-size: 0.875rem;
    font-weight: 600;
    color: var(--color-gray-700, #3c4043);
    min-width: 32px;
    text-align: right;
  }

  .assessment-rationale {
    font-size: 0.75rem;
    color: var(--color-gray-600, #5f6368);
    margin: var(--spacing-xs, 4px) 0 0;
    padding-left: 100px;
  }
</style>
