// UI state store - Svelte 5 runes
import type { TabId } from '$shared/types';

// UI state
let activeTab = $state<TabId>('review');
let isLoading = $state(false);
let globalError = $state<string | null>(null);
let toastMessage = $state<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);

// Handle for the auto-dismiss timer so a new toast (or hideToast) can cancel a
// pending dismissal instead of letting an old timer clear the current toast.
let toastTimer: ReturnType<typeof setTimeout> | null = null;

// Actions
function setActiveTab(tab: TabId) {
  activeTab = tab;
}

function setLoading(loading: boolean) {
  isLoading = loading;
}

function setError(error: string | null) {
  globalError = error;
}

function showToast(type: 'success' | 'error' | 'info', message: string, duration = 3000) {
  if (toastTimer !== null) {
    clearTimeout(toastTimer);
    toastTimer = null;
  }

  toastMessage = { type, message };

  if (duration > 0) {
    toastTimer = setTimeout(() => {
      toastMessage = null;
      toastTimer = null;
    }, duration);
  }
}

function hideToast() {
  if (toastTimer !== null) {
    clearTimeout(toastTimer);
    toastTimer = null;
  }
  toastMessage = null;
}

function clearError() {
  globalError = null;
}

// Export reactive getters and actions
export const uiStore = {
  // Getters (reactive)
  get activeTab() { return activeTab; },
  get isLoading() { return isLoading; },
  get error() { return globalError; },
  get toast() { return toastMessage; },

  // Actions
  setActiveTab,
  setLoading,
  setError,
  showToast,
  hideToast,
  clearError
};
