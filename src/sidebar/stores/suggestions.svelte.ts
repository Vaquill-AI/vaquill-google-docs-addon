// Suggestions/Redlines store - Svelte 5 runes
import type { Suggestion, PlaybookConfig } from '$shared/types';

// Suggestions state
let suggestions = $state<Suggestion[]>([]);
let selectedPlaybook = $state<PlaybookConfig | null>(null);
let isReviewing = $state(false);
let reviewProgress = $state(0);

// Derived state
let totalSuggestions = $derived(suggestions.length);
let pendingSuggestions = $derived(suggestions.filter(s => s.status === 'pending'));
let acceptedSuggestions = $derived(suggestions.filter(s => s.status === 'accepted'));
let rejectedSuggestions = $derived(suggestions.filter(s => s.status === 'rejected'));
let pendingCount = $derived(pendingSuggestions.length);
let criticalCount = $derived(suggestions.filter(s => s.severity === 'critical' && s.status === 'pending').length);
let highCount = $derived(suggestions.filter(s => s.severity === 'high' && s.status === 'pending').length);

// Summary
let summary = $derived({
  total: totalSuggestions,
  pending: pendingCount,
  accepted: acceptedSuggestions.length,
  rejected: rejectedSuggestions.length,
  critical: criticalCount,
  high: highCount,
  medium: suggestions.filter(s => s.severity === 'medium' && s.status === 'pending').length,
  low: suggestions.filter(s => s.severity === 'low' && s.status === 'pending').length
});

// Generate unique ID
function generateId(): string {
  return `sug_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
}

// Actions
function setSuggestions(newSuggestions: Suggestion[]) {
  suggestions = newSuggestions.map(s => ({
    ...s,
    id: s.id || generateId()
  }));
}

function addSuggestion(suggestion: Omit<Suggestion, 'id' | 'createdAt' | 'status'>) {
  const newSuggestion: Suggestion = {
    ...suggestion,
    id: generateId(),
    status: 'pending',
    createdAt: Date.now()
  };
  suggestions = [...suggestions, newSuggestion];
  return newSuggestion.id;
}

function updateSuggestion(id: string, updates: Partial<Suggestion>) {
  suggestions = suggestions.map(s =>
    s.id === id ? { ...s, ...updates } : s
  );
}

function acceptSuggestion(id: string) {
  updateSuggestion(id, { status: 'accepted' });
}

function rejectSuggestion(id: string) {
  updateSuggestion(id, { status: 'rejected' });
}

function acceptAll() {
  suggestions = suggestions.map(s =>
    s.status === 'pending' ? { ...s, status: 'accepted' } : s
  );
}

function rejectAll() {
  suggestions = suggestions.map(s =>
    s.status === 'pending' ? { ...s, status: 'rejected' } : s
  );
}

function clearSuggestions() {
  suggestions = [];
  reviewProgress = 0;
  isReviewing = false;
}

function setPlaybook(playbook: PlaybookConfig | null) {
  selectedPlaybook = playbook;
}

function setReviewing(reviewing: boolean) {
  isReviewing = reviewing;
}

function setReviewProgress(progress: number) {
  reviewProgress = Math.min(100, Math.max(0, progress));
}

// Export reactive getters and actions
export const suggestionsStore = {
  // Getters (reactive)
  get suggestions() { return suggestions; },
  get selectedPlaybook() { return selectedPlaybook; },
  get isReviewing() { return isReviewing; },
  get reviewProgress() { return reviewProgress; },
  get pendingSuggestions() { return pendingSuggestions; },
  get acceptedSuggestions() { return acceptedSuggestions; },
  get rejectedSuggestions() { return rejectedSuggestions; },
  get summary() { return summary; },

  // Actions
  setSuggestions,
  addSuggestion,
  updateSuggestion,
  acceptSuggestion,
  rejectSuggestion,
  acceptAll,
  rejectAll,
  clearSuggestions,
  setPlaybook,
  setReviewing,
  setReviewProgress
};
