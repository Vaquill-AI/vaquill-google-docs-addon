<script lang="ts">
  import { Loader2 } from '@lucide/svelte';
  import type { Component } from 'svelte';

  interface Props {
    onclick: () => void;
    disabled?: boolean;
    loading?: boolean;
    loadingText?: string;
    icon?: Component;
    variant?: 'primary' | 'success' | 'secondary';
    children?: any;
  }

  let {
    onclick,
    disabled = false,
    loading = false,
    loadingText = 'Loading...',
    icon: Icon,
    variant = 'primary',
    children
  }: Props = $props();
</script>

<button
  type="button"
  class="action-button {variant}"
  class:loading
  {onclick}
  disabled={disabled || loading}
>
  {#if loading}
    <Loader2 size={16} class="spin" />
    <span>{loadingText}</span>
  {:else}
    {#if Icon}
      <Icon size={16} />
    {/if}
    {@render children?.()}
  {/if}
</button>

<style>
  .action-button {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 10px 16px;
    border: none;
    border-radius: 6px;
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    transition: background 0.2s;
    width: 100%;
  }

  .action-button.primary {
    background: var(--color-primary, #1a73e8);
    color: white;
  }

  .action-button.primary:hover:not(:disabled) {
    background: var(--color-primary-dark, #1765cc);
  }

  .action-button.success {
    background: var(--color-success, #34a853);
    color: white;
  }

  .action-button.success:hover:not(:disabled) {
    background: var(--color-secondary-dark);
  }

  .action-button.secondary {
    background: var(--color-gray-100, #f1f3f4);
    color: var(--color-gray-700, #3c4043);
    border: 1px solid var(--color-gray-200, #e8eaed);
  }

  .action-button.secondary:hover:not(:disabled) {
    background: var(--color-gray-200, #e8eaed);
  }

  /* A genuinely disabled button greys out; a loading button keeps its variant
     color (with a spinner) so it reads as working, not dead. */
  .action-button:disabled:not(.loading) {
    background: var(--color-gray-400, #bdc1c6);
    cursor: not-allowed;
  }

  .action-button.loading {
    cursor: progress;
    opacity: 0.92;
  }

  :global(.spin) {
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }
</style>
