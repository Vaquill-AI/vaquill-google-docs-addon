<script lang="ts">
  interface Props {
    title: string;
    titleColor?: 'default' | 'red' | 'green';
    highlight?: boolean;
    children?: any;
  }

  let { title, titleColor = 'default', highlight = false, children }: Props = $props();
</script>

<div class="section-card" class:highlight>
  <h3 class="section-title {titleColor}">{title}</h3>
  <div class="section-content">
    {@render children?.()}
  </div>
</div>

<style>
  .section-card {
    padding: var(--spacing-md, 16px);
    background-color: var(--color-gray-50, #f8f9fa);
    border-radius: var(--radius-md, 8px);
  }

  .section-card.highlight {
    background-color: var(--color-primary-light, #eff6ff);
    border-left: 3px solid var(--color-primary, #1a73e8);
  }

  .section-title {
    font-size: 0.875rem;
    font-weight: 600;
    color: var(--color-gray-800, #202124);
    margin: 0 0 var(--spacing-sm, 8px);
  }

  .section-title.red { color: var(--color-danger, #d93025); }
  .section-title.green { color: var(--color-success, #34a853); }

  .section-content {
    font-size: 0.875rem;
    color: var(--color-gray-700, #3c4043);
    line-height: 1.5;
  }

  .section-content :global(p) {
    margin: 0;
  }

  .section-content :global(ul),
  .section-content :global(ol) {
    margin: 0;
    padding-left: var(--spacing-lg, 24px);
    font-size: 0.813rem;
    color: var(--color-gray-600, #5f6368);
  }

  .section-content :global(li) {
    margin-bottom: var(--spacing-xs, 4px);
  }
</style>
