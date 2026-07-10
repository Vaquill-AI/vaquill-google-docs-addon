<script lang="ts">
  import { X, CheckCircle, AlertCircle, Info } from '@lucide/svelte';

  interface Props {
    type: 'success' | 'error' | 'info';
    message: string;
    onClose: () => void;
  }

  let { type, message, onClose }: Props = $props();

  const icons = {
    success: CheckCircle,
    error: AlertCircle,
    info: Info
  };

  const Icon = $derived(icons[type]);
</script>

<div class="toast toast-{type}" role="alert">
  <Icon size={16} />
  <span class="toast-message">{message}</span>
  <button class="toast-close" onclick={onClose} aria-label="Close">
    <X size={14} />
  </button>
</div>

<style>
  .toast {
    position: fixed;
    bottom: var(--spacing-lg);
    left: var(--spacing-md);
    right: var(--spacing-md);
    display: flex;
    align-items: center;
    gap: var(--spacing-sm);
    padding: var(--spacing-sm) var(--spacing-md);
    border-radius: var(--radius-md);
    box-shadow: var(--shadow-lg);
    animation: slideUp 0.2s ease-out;
    z-index: 1000;
  }

  @keyframes slideUp {
    from {
      opacity: 0;
      transform: translateY(10px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  .toast-success {
    background-color: var(--color-success-bg);
    color: var(--color-secondary-dark);
    border: 1px solid var(--color-success);
  }

  .toast-error {
    background-color: var(--color-danger-bg);
    color: var(--color-danger);
    border: 1px solid var(--color-danger);
  }

  .toast-info {
    background-color: #e8f0fe;
    color: #1765cc;
    border: 1px solid #1a73e8;
  }

  .toast-message {
    flex: 1;
    font-size: 0.875rem;
  }

  .toast-close {
    display: flex;
    align-items: center;
    justify-content: center;
    min-width: 24px;
    min-height: 24px;
    padding: 6px;
    border: none;
    background: none;
    cursor: pointer;
    opacity: 0.7;
    transition: opacity var(--transition-fast);
  }

  .toast-close:hover {
    opacity: 1;
  }
</style>
