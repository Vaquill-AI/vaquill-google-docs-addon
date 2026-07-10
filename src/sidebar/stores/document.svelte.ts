// Document store - Svelte 5 runes
import type { DocumentContent, ClauseMapItem } from '$shared/types';

// Document state using Svelte 5 runes
let documentContent = $state<DocumentContent | null>(null);
let clauseMap = $state<ClauseMapItem[]>([]);
let isLoading = $state(false);
let error = $state<string | null>(null);

// Derived state
let hasDocument = $derived(documentContent !== null);
let wordCount = $derived(documentContent?.wordCount ?? 0);
let characterCount = $derived(documentContent?.characterCount ?? 0);

// Actions
function setDocument(content: DocumentContent) {
  documentContent = content;
  error = null;
}

function setClauseMap(clauses: ClauseMapItem[]) {
  clauseMap = clauses;
}

function setLoading(loading: boolean) {
  isLoading = loading;
}

function setError(err: string | null) {
  error = err;
  isLoading = false;
}

function clearDocument() {
  documentContent = null;
  clauseMap = [];
  error = null;
}

// Export reactive getters and actions
export const documentStore = {
  // Getters (reactive)
  get content() { return documentContent; },
  get clauses() { return clauseMap; },
  get isLoading() { return isLoading; },
  get error() { return error; },
  get hasDocument() { return hasDocument; },
  get wordCount() { return wordCount; },
  get characterCount() { return characterCount; },

  // Actions
  setDocument,
  setClauseMap,
  setLoading,
  setError,
  clearDocument
};
