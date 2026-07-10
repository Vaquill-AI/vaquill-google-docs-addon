/**
 * Pseudo-Suggestions Service
 *
 * Since Google Docs doesn't have a public Suggestion API,
 * this service implements a workaround using:
 * 1. Strikethrough formatting for deletions (red)
 * 2. Background color for insertions (green)
 * 3. Document properties for tracking suggestion state
 *
 * This mimics a tracked-changes visual style.
 */

// ============================================
// Types
// ============================================

interface Suggestion {
  id: string;
  originalText: string;
  suggestedText: string;
  charStart: number;
  charEnd: number;
  // Paragraph-relative positioning for accurate text location
  paragraphIndex?: number;
  paragraphOffset?: number;
  rationale: string;
  clauseType?: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  status: 'pending' | 'accepted' | 'rejected' | 'modified';
}

interface AppliedSuggestion {
  suggestionId: string;
  originalText: string;
  suggestedText: string;
  originalRange: {
    start: number;
    end: number;
  };
  insertedRange: {
    start: number;
    end: number;
  };
  rationale: string;
  severity: string;
  appliedAt: number;
}

// Colors for pseudo-suggestions (tracked-changes style)
const COLORS = {
  DELETION_TEXT: '#DC3545',      // Red for strikethrough text
  DELETION_BG: '#FEE2E2',        // Light red background for deletion
  INSERTION_BG: '#D4EDDA',       // Light green background
  INSERTION_TEXT: '#155724',     // Dark green text
  MARKER_BG: '#FEF3C7'           // Yellow marker for rationale reference
};

// Store applied suggestions in document properties
const SUGGESTIONS_KEY = 'vaquill_suggestions';
const SUGGESTION_MARKER = '⟨VAQUILL⟩'; // Invisible marker for tracking

/**
 * Length-preserving typography normalization (curly quotes, unicode dashes,
 * non-breaking / thin spaces) so anchoring survives differences between the
 * model's text and the document. One character maps to one, so offsets in the
 * normalized string are still valid in the original.
 */
function normalizeAnchorText(s: string): string {
  return s
    .replace(/[\u2018\u2019\u201A\u201B\u2032\u00B4\u0060]/g, "'")
    .replace(/[\u201C\u201D\u201E\u201F\u2033]/g, '"')
    .replace(/[\u2013\u2014\u2015\u2212]/g, '-')
    .replace(/[\u00A0\u2002\u2003\u2007\u2009\u202F]/g, ' ');
}

// ============================================
// Suggestion Application
// ============================================

/**
 * Finds text in a specific paragraph by index and offset.
 * This is more reliable than document-wide search for duplicate text.
 */
function findTextByParagraph(
  body: GoogleAppsScript.Document.Body,
  searchText: string,
  paragraphIndex?: number,
  paragraphOffset?: number
): { element: GoogleAppsScript.Document.Text; startOffset: number; endOffset: number } | null {
  // If we have paragraph context, use it for precise location
  if (paragraphIndex !== undefined && paragraphOffset !== undefined) {
    const paragraphs = body.getParagraphs();
    if (paragraphIndex < paragraphs.length) {
      const paragraph = paragraphs[paragraphIndex];
      const text = paragraph.editAsText();
      const paraText = text.getText();

      // Verify the text matches at the expected offset
      const foundText = paraText.substring(paragraphOffset, paragraphOffset + searchText.length);
      if (foundText === searchText || foundText.toLowerCase() === searchText.toLowerCase()) {
        return {
          element: text,
          startOffset: paragraphOffset,
          endOffset: paragraphOffset + searchText.length - 1
        };
      }

      // If exact offset doesn't match, search within this paragraph only
      const localIndex = paraText.indexOf(searchText);
      if (localIndex !== -1) {
        return {
          element: text,
          startOffset: localIndex,
          endOffset: localIndex + searchText.length - 1
        };
      }

      // Typography-tolerant retry (curly quotes, unicode dashes, nbsp). The
      // normalization is length-preserving, so the index stays valid.
      const normIndex = normalizeAnchorText(paraText).indexOf(normalizeAnchorText(searchText));
      if (normIndex !== -1) {
        return {
          element: text,
          startOffset: normIndex,
          endOffset: normIndex + searchText.length - 1
        };
      }
    }
  }

  // Fallback to document-wide search
  return findTextInDocument(body, searchText);
}

/**
 * Finds text in the document body using text search.
 * Returns the element and offsets if found.
 */
function findTextInDocument(
  body: GoogleAppsScript.Document.Body,
  searchText: string
): { element: GoogleAppsScript.Document.Text; startOffset: number; endOffset: number } | null {
  // Escape special regex characters for literal search
  const escapedText = searchText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  // Try exact match first
  let searchResult = body.findText(escapedText);
  if (searchResult) {
    const element = searchResult.getElement();
    if (element.getType() === DocumentApp.ElementType.TEXT) {
      return {
        element: element.asText(),
        startOffset: searchResult.getStartOffset(),
        endOffset: searchResult.getEndOffsetInclusive()
      };
    }
  }

  // Try without escaping (for simple text)
  searchResult = body.findText(searchText);
  if (searchResult) {
    const element = searchResult.getElement();
    if (element.getType() === DocumentApp.ElementType.TEXT) {
      return {
        element: element.asText(),
        startOffset: searchResult.getStartOffset(),
        endOffset: searchResult.getEndOffsetInclusive()
      };
    }
  }

  // Typography-tolerant paragraph scan: findText cannot match across curly
  // quotes / unicode dashes, so normalize per paragraph and search there.
  const normSearch = normalizeAnchorText(searchText);
  const paragraphs = body.getParagraphs();
  for (let i = 0; i < paragraphs.length; i++) {
    const textEl = paragraphs[i].editAsText();
    const idx = normalizeAnchorText(textEl.getText()).indexOf(normSearch);
    if (idx !== -1) {
      return {
        element: textEl,
        startOffset: idx,
        endOffset: idx + searchText.length - 1
      };
    }
  }

  return null;
}

/**
 * Applies a suggestion to the document using pseudo-suggestion formatting.
 * Creates a visual "tracked change" effect.
 */
function applySuggestion(suggestion: Suggestion): { status: string; suggestionId: string } {
  const doc = DocumentApp.getActiveDocument();
  const body = doc.getBody();

  try {
    // Check if suggestion is already applied
    const existingSuggestion = getSuggestion(suggestion.id);
    if (existingSuggestion) {
      return { status: 'already_applied', suggestionId: suggestion.id };
    }

    // Find the text to be replaced (using paragraph context if available)
    const found = findTextByParagraph(
      body,
      suggestion.originalText,
      suggestion.paragraphIndex,
      suggestion.paragraphOffset
    );

    if (!found) {
      throw new Error(`Could not find text: "${suggestion.originalText.substring(0, 50)}..."`);
    }

    const { element: textElement, startOffset, endOffset } = found;

    // Step 1: Apply strikethrough and red color to original text (deletion style)
    textElement.setStrikethrough(startOffset, endOffset, true);
    textElement.setForegroundColor(startOffset, endOffset, COLORS.DELETION_TEXT);
    textElement.setBackgroundColor(startOffset, endOffset, COLORS.DELETION_BG);

    // Step 2: Insert the suggested text immediately after with a space separator
    const insertPosition = endOffset + 1;
    const insertText = ' ' + suggestion.suggestedText;
    textElement.insertText(insertPosition, insertText);

    // Step 3: Style the inserted text (insertion style)
    const insertEndOffset = insertPosition + insertText.length - 1;
    textElement.setBackgroundColor(insertPosition, insertEndOffset, COLORS.INSERTION_BG);
    textElement.setForegroundColor(insertPosition, insertEndOffset, COLORS.INSERTION_TEXT);
    textElement.setStrikethrough(insertPosition, insertEndOffset, false);
    textElement.setBold(insertPosition, insertEndOffset, false);

    // Step 4: Store the suggestion metadata for later accept/reject
    storeSuggestion(suggestion.id, {
      suggestionId: suggestion.id,
      originalText: suggestion.originalText,
      suggestedText: suggestion.suggestedText,
      originalRange: { start: startOffset, end: endOffset },
      insertedRange: { start: insertPosition, end: insertEndOffset },
      rationale: suggestion.rationale,
      severity: suggestion.severity,
      appliedAt: Date.now()
    });

    // Note: For rationale display, we could add a footnote or use the
    // sidebar to show details. Google Docs doesn't support programmatic
    // comment creation anchored to specific text ranges in Apps Script.

    return { status: 'applied', suggestionId: suggestion.id };
  } catch (error) {
    console.error('Failed to apply suggestion:', error);
    throw new Error(`Failed to apply suggestion: ${error}`);
  }
}

/**
 * Accepts a suggestion - removes strikethrough text, keeps suggested text.
 * The original (struck-through) text is deleted, leaving only the new text.
 */
function acceptSuggestion(suggestionId: string): { status: string } {
  const doc = DocumentApp.getActiveDocument();
  const body = doc.getBody();
  const stored = getSuggestion(suggestionId);

  if (!stored) {
    throw new Error(`Suggestion not found: ${suggestionId}`);
  }

  try {
    // Strategy: Find the original text (with strikethrough) and remove it,
    // then clear formatting from the suggested text

    // Find the strikethrough original text
    const originalFound = findTextInDocument(body, stored.originalText);

    if (originalFound) {
      const { element: textElement, startOffset, endOffset } = originalFound;

      // Check if it has our deletion formatting (strikethrough + red)
      if (textElement.isStrikethrough(startOffset)) {
        // Delete the original text
        textElement.deleteText(startOffset, endOffset);
      }
    }

    // Find and clean up the suggested text formatting
    const suggestedFound = findTextInDocument(body, stored.suggestedText);
    if (suggestedFound) {
      const { element: textElement, startOffset, endOffset } = suggestedFound;

      // Remove the green highlighting - make it normal text
      textElement.setBackgroundColor(startOffset, endOffset, null);
      textElement.setForegroundColor(startOffset, endOffset, '#000000');
    }

    // Remove from storage
    removeSuggestion(suggestionId);

    return { status: 'accepted' };
  } catch (error) {
    console.error('Failed to accept suggestion:', error);
    throw new Error(`Failed to accept suggestion: ${error}`);
  }
}

/**
 * Rejects a suggestion - removes suggested text, restores original.
 * The suggested (green) text is deleted, original text formatting is restored.
 */
function rejectSuggestion(suggestionId: string): { status: string } {
  const doc = DocumentApp.getActiveDocument();
  const body = doc.getBody();
  const stored = getSuggestion(suggestionId);

  if (!stored) {
    throw new Error(`Suggestion not found: ${suggestionId}`);
  }

  try {
    // Strategy: Find the suggested text and remove it,
    // then restore formatting on the original text

    // Find and delete the suggested text (green background)
    const suggestedFound = findTextInDocument(body, stored.suggestedText);
    if (suggestedFound) {
      const { element: textElement, startOffset, endOffset } = suggestedFound;

      // Check if it has our insertion formatting
      const bgColor = textElement.getBackgroundColor(startOffset);
      if (bgColor === COLORS.INSERTION_BG) {
        // Delete the suggested text. Only extend to the preceding character if
        // it is actually the separator space we inserted, so we never over-
        // delete a real character when the char before is not a space.
        const fullText = textElement.getText();
        const hasLeadingSpace = startOffset > 0 && fullText.charAt(startOffset - 1) === ' ';
        const deleteStart = hasLeadingSpace ? startOffset - 1 : startOffset;
        textElement.deleteText(deleteStart, endOffset);
      }
    }

    // Find and restore the original text formatting
    const originalFound = findTextInDocument(body, stored.originalText);
    if (originalFound) {
      const { element: textElement, startOffset, endOffset } = originalFound;

      // Remove strikethrough and restore normal formatting
      textElement.setStrikethrough(startOffset, endOffset, false);
      textElement.setForegroundColor(startOffset, endOffset, '#000000');
      textElement.setBackgroundColor(startOffset, endOffset, null);
    }

    // Remove from storage
    removeSuggestion(suggestionId);

    return { status: 'rejected' };
  } catch (error) {
    console.error('Failed to reject suggestion:', error);
    throw new Error(`Failed to reject suggestion: ${error}`);
  }
}

/**
 * Accepts all pending suggestions.
 */
function acceptAllSuggestions(): { count: number } {
  let count = 0;

  // Accept native suggestions first when enabled and supported by the account.
  const g = globalThis as any;
  if (g.isNativeSuggestionsEnabled && g.isNativeSuggestionsEnabled() && g.acceptAllNativeSuggestions) {
    try {
      const nativeResult = g.acceptAllNativeSuggestions();
      count += (nativeResult && nativeResult.count) || 0;
    } catch (error) {
      console.warn('Native accept-all unavailable, using pseudo-suggestions only:', error);
    }
  }

  // Accept any pseudo-suggestions stored in document properties.
  const suggestions = getAllSuggestions();
  for (const suggestionId of Object.keys(suggestions)) {
    try {
      acceptSuggestion(suggestionId);
      count++;
    } catch (error) {
      console.error(`Failed to accept suggestion ${suggestionId}:`, error);
    }
  }

  return { count };
}

/**
 * Rejects all pending suggestions.
 */
function rejectAllSuggestions(): { count: number } {
  let count = 0;

  // Reject native suggestions first when enabled and supported by the account.
  const g = globalThis as any;
  if (g.isNativeSuggestionsEnabled && g.isNativeSuggestionsEnabled() && g.rejectAllNativeSuggestions) {
    try {
      const nativeResult = g.rejectAllNativeSuggestions();
      count += (nativeResult && nativeResult.count) || 0;
    } catch (error) {
      console.warn('Native reject-all unavailable, using pseudo-suggestions only:', error);
    }
  }

  // Reject any pseudo-suggestions stored in document properties.
  const suggestions = getAllSuggestions();
  for (const suggestionId of Object.keys(suggestions)) {
    try {
      rejectSuggestion(suggestionId);
      count++;
    } catch (error) {
      console.error(`Failed to reject suggestion ${suggestionId}:`, error);
    }
  }

  return { count };
}

// ============================================
// Suggestion Storage (Document Properties)
// ============================================

/**
 * Stores a suggestion in document properties.
 */
function storeSuggestion(suggestionId: string, data: AppliedSuggestion): void {
  const props = PropertiesService.getDocumentProperties();
  const suggestions = getAllSuggestions();
  suggestions[suggestionId] = data;
  props.setProperty(SUGGESTIONS_KEY, JSON.stringify(suggestions));
}

/**
 * Gets a specific suggestion from storage.
 */
function getSuggestion(suggestionId: string): AppliedSuggestion | null {
  const suggestions = getAllSuggestions();
  return suggestions[suggestionId] || null;
}

/**
 * Gets all stored suggestions.
 */
function getAllSuggestions(): Record<string, AppliedSuggestion> {
  const props = PropertiesService.getDocumentProperties();
  const stored = props.getProperty(SUGGESTIONS_KEY);
  return stored ? JSON.parse(stored) : {};
}

/**
 * Gets all stored suggestions as an array with IDs.
 */
function getAllSuggestionsArray(): (AppliedSuggestion & { id: string })[] {
  const suggestions = getAllSuggestions();
  return Object.entries(suggestions).map(([id, data]) => ({
    ...data,
    id
  }));
}

/**
 * Removes a suggestion from storage.
 */
function removeSuggestion(suggestionId: string): void {
  const props = PropertiesService.getDocumentProperties();
  const suggestions = getAllSuggestions();
  delete suggestions[suggestionId];
  props.setProperty(SUGGESTIONS_KEY, JSON.stringify(suggestions));
}

/**
 * Clears all suggestions from storage and removes formatting.
 */
function clearAllSuggestions(): void {
  const doc = DocumentApp.getActiveDocument();
  const body = doc.getBody();
  const suggestions = getAllSuggestions();

  // Try to clean up any remaining formatting
  for (const [id, stored] of Object.entries(suggestions)) {
    try {
      // Restore original text formatting
      const originalFound = findTextInDocument(body, stored.originalText);
      if (originalFound) {
        const { element, startOffset, endOffset } = originalFound;
        element.setStrikethrough(startOffset, endOffset, false);
        element.setForegroundColor(startOffset, endOffset, '#000000');
        element.setBackgroundColor(startOffset, endOffset, null);
      }

      // Try to remove suggested text
      const suggestedFound = findTextInDocument(body, stored.suggestedText);
      if (suggestedFound) {
        const { element, startOffset, endOffset } = suggestedFound;
        const bgColor = element.getBackgroundColor(startOffset);
        if (bgColor === COLORS.INSERTION_BG) {
          const deleteStart = startOffset > 0 ? startOffset - 1 : startOffset;
          element.deleteText(deleteStart, endOffset);
        }
      }
    } catch (e) {
      console.error(`Failed to clean up suggestion ${id}:`, e);
    }
  }

  // Clear storage
  const props = PropertiesService.getDocumentProperties();
  props.deleteProperty(SUGGESTIONS_KEY);
}

/**
 * Gets count of pending suggestions.
 */
function getPendingSuggestionsCount(): number {
  return Object.keys(getAllSuggestions()).length;
}

// ============================================
// Batch Operations
// ============================================

/**
 * Applies multiple suggestions at once.
 * More efficient than applying one by one.
 */
function applyMultipleSuggestions(suggestions: Suggestion[]): {
  applied: string[];
  failed: Array<{ id: string; error: string }>;
  mode?: string;
} {
  // Native-suggestions-first: create real Google Docs tracked-change
  // suggestions when enabled and the account is enrolled in Developer Preview.
  // Any failure (for example an account without preview access) falls through
  // to the pseudo-suggestion engine below, so the user still gets redlines.
  const g = globalThis as any;
  if (g.isNativeSuggestionsEnabled && g.isNativeSuggestionsEnabled()) {
    try {
      const nativeResult = g.applyNativeSuggestions(
        suggestions.map((s) => ({
          id: s.id,
          originalText: s.originalText,
          suggestedText: s.suggestedText
        }))
      );
      // Only accept the native result if it actually applied something.
      // Otherwise fall through so the pseudo engine can try its own text search.
      if (nativeResult && nativeResult.applied && nativeResult.applied.length > 0) {
        return { applied: nativeResult.applied, failed: nativeResult.failed || [], mode: 'native' };
      }
    } catch (error) {
      console.warn('Native suggestions unavailable, falling back to pseudo-suggestions:', error);
    }
  }

  const applied: string[] = [];
  const failed: Array<{ id: string; error: string }> = [];

  // Sort by charStart descending to avoid position shifts
  const sorted = [...suggestions].sort((a, b) => b.charStart - a.charStart);

  for (const suggestion of sorted) {
    try {
      const result = applySuggestion(suggestion);
      if (result.status === 'applied') {
        applied.push(suggestion.id);
      }
    } catch (error) {
      failed.push({
        id: suggestion.id,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  return { applied, failed, mode: 'pseudo' };
}

/**
 * Highlights a text range temporarily (for navigation).
 */
function highlightTextRange(charStart: number, charEnd: number): void {
  const doc = DocumentApp.getActiveDocument();
  const body = doc.getBody();
  const text = body.getText();

  // Extract the text at the given position
  const targetText = text.substring(charStart, charEnd);
  if (!targetText) return;

  const found = findTextInDocument(body, targetText);
  if (found) {
    // Create cursor position at the start
    const position = doc.newPosition(found.element.getParent(), found.startOffset);
    doc.setCursor(position);
  }
}

// ============================================
// Exports for GAS
// ============================================

(globalThis as any).applySuggestion = applySuggestion;
(globalThis as any).acceptSuggestion = acceptSuggestion;
(globalThis as any).rejectSuggestion = rejectSuggestion;
(globalThis as any).acceptAllSuggestions = acceptAllSuggestions;
(globalThis as any).rejectAllSuggestions = rejectAllSuggestions;
(globalThis as any).clearAllSuggestions = clearAllSuggestions;
(globalThis as any).applyMultipleSuggestions = applyMultipleSuggestions;
(globalThis as any).getAllSuggestionsArray = getAllSuggestionsArray;
(globalThis as any).getPendingSuggestionsCount = getPendingSuggestionsCount;
(globalThis as any).highlightTextRange = highlightTextRange;
