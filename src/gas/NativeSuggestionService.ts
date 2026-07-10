/**
 * Native Suggestions Service
 *
 * Creates REAL Google Docs tracked-change suggestions (the ones that show up in
 * Google's own Suggesting mode, attributable and accept/reject-able in the Docs
 * UI), instead of the pseudo-suggestion workaround (strikethrough + colors).
 *
 * This uses the Google Docs REST API documents.batchUpdate endpoint with
 * writeControl.writeMode = "SUGGEST". That capability is currently gated behind
 * the Google Workspace Developer Preview Program, so the calling account must be
 * enrolled for it to work. We deliberately call the REST endpoint RAW via
 * UrlFetchApp (not the Advanced Docs Service), because the generally available
 * client libraries and the Advanced Docs Service do not expose preview-only
 * requests. When the account is not enrolled, the batch call fails and the
 * caller falls back to the pseudo-suggestion engine.
 *
 * Coverage: body paragraphs and text inside tables (recursively) are indexed
 * in the body segment, which is where contract clauses live. Headers, footers,
 * and footnotes use separate segments and are out of scope for this first cut;
 * suggestions there fall back to the pseudo engine.
 *
 * First-cut limitation (acceptable, fallback covers it):
 * - Overlapping suggested ranges are not de-conflicted.
 */

// ============================================
// Configuration
// ============================================

var DOCS_API_BASE = 'https://docs.googleapis.com/v1/documents/';
var NATIVE_FLAG_KEY = 'NATIVE_SUGGESTIONS';

interface NativeRange {
  startIndex: number;
  endIndex: number;
}

interface NativeSuggestionInput {
  id: string;
  originalText: string;
  suggestedText: string;
}

interface NativeApplyResult {
  applied: string[];
  failed: Array<{ id: string; error: string }>;
  native: boolean;
}

// ============================================
// Feature flag
// ============================================

/**
 * Native suggestions are ON unless explicitly disabled. This is intentional:
 * we lead with the native experience and fall back transparently when the
 * account is not enrolled in Developer Preview.
 */
function isNativeSuggestionsEnabled() {
  var value = PropertiesService.getScriptProperties().getProperty(NATIVE_FLAG_KEY);
  return value !== 'false';
}

/** Enable or disable native suggestions (persisted in script properties). */
function setNativeSuggestions(enabled) {
  PropertiesService.getScriptProperties().setProperty(NATIVE_FLAG_KEY, enabled ? 'true' : 'false');
  return { enabled: enabled };
}

/** Report whether native suggestions are enabled, for the settings UI. */
function getNativeSuggestionsStatus() {
  return { enabled: isNativeSuggestionsEnabled() };
}

// ============================================
// REST helpers
// ============================================

function getActiveDocId() {
  return DocumentApp.getActiveDocument().getId();
}

function docsApiGet(docId) {
  var url = DOCS_API_BASE + encodeURIComponent(docId) + '?suggestionsViewMode=SUGGESTIONS_INLINE';
  var response = UrlFetchApp.fetch(url, {
    method: 'get',
    headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() },
    muteHttpExceptions: true
  });
  var code = response.getResponseCode();
  if (code !== 200) {
    throw new Error('Docs API get failed (' + code + '): ' + response.getContentText());
  }
  return JSON.parse(response.getContentText());
}

function docsApiBatchUpdate(docId, requests, writeMode) {
  var payload = { requests: requests };
  if (writeMode) {
    payload.writeControl = { writeMode: writeMode };
  }
  var url = DOCS_API_BASE + encodeURIComponent(docId) + ':batchUpdate';
  var response = UrlFetchApp.fetch(url, {
    method: 'post',
    contentType: 'application/json',
    headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });
  var code = response.getResponseCode();
  if (code !== 200) {
    // A 400 here usually means the account is not enrolled in the Developer
    // Preview (SUGGEST write mode is rejected). The caller treats a throw as a
    // signal to fall back to the pseudo-suggestion engine.
    throw new Error('Docs API batchUpdate failed (' + code + '): ' + response.getContentText());
  }
  return JSON.parse(response.getContentText());
}

// ============================================
// Index mapping (flat text -> document indexes)
// ============================================

/**
 * Recursively appends paragraph text runs to the character and index buffers.
 * Recurses into table cells so clauses inside tables are locatable.
 */
function indexContent(content, chars, map) {
  for (var i = 0; i < content.length; i++) {
    var el = content[i];
    if (el.paragraph && el.paragraph.elements) {
      var elements = el.paragraph.elements;
      for (var j = 0; j < elements.length; j++) {
        var run = elements[j].textRun;
        if (!run || typeof run.content !== 'string') {
          continue;
        }
        var start = elements[j].startIndex;
        var text = run.content;
        for (var k = 0; k < text.length; k++) {
          chars.push(text[k]);
          map.push(start + k);
        }
      }
    } else if (el.table && el.table.tableRows) {
      var rows = el.table.tableRows;
      for (var r = 0; r < rows.length; r++) {
        var cells = rows[r].tableCells || [];
        for (var c = 0; c < cells.length; c++) {
          if (cells[c].content) {
            indexContent(cells[c].content, chars, map);
          }
        }
      }
    }
  }
}

/**
 * Length-preserving normalization so anchoring survives typographic differences
 * between the model's text and the document: curly quotes, unicode dashes, and
 * non-breaking / thin spaces. Every replacement is one character for one, so
 * offsets in the normalized string still map back through the index array.
 */
function normalizeForMatch(s) {
  return s
    .replace(/[\u2018\u2019\u201A\u201B\u2032\u00B4\u0060]/g, "'")
    .replace(/[\u201C\u201D\u201E\u201F\u2033]/g, '"')
    .replace(/[\u2013\u2014\u2015\u2212]/g, '-')
    .replace(/[\u00A0\u2002\u2003\u2007\u2009\u202F]/g, ' ');
}

/**
 * Builds a flat string of the body text (including table cell text) plus a
 * parallel array mapping each character to its absolute document index. Also
 * carries a normalized copy of the flat text for typography-tolerant matching.
 */
function buildFlatIndex(docJson) {
  var chars = [];
  var map = [];
  var content = docJson && docJson.body && docJson.body.content ? docJson.body.content : [];
  indexContent(content, chars, map);
  var flat = chars.join('');
  return { flat: flat, map: map, normalized: normalizeForMatch(flat) };
}

/**
 * Locates search text at or after fromPos (a flat-string offset, default 0) and
 * returns its absolute document range (end exclusive) plus the flat-string match
 * positions so callers can advance past it. Tries an exact match, then a
 * case-insensitive match. Returns null when not found.
 */
function findDocRange(flatIndex, searchText, fromPos) {
  if (!searchText) {
    return null;
  }
  var start = fromPos || 0;
  var pos = flatIndex.flat.indexOf(searchText, start);
  if (pos === -1) {
    pos = flatIndex.flat.toLowerCase().indexOf(searchText.toLowerCase(), start);
  }
  if (pos === -1 && flatIndex.normalized) {
    // Typography-tolerant match (curly quotes, unicode dashes, nbsp). The
    // normalized index is length-identical, so positions still map correctly.
    var ns = normalizeForMatch(searchText);
    pos = flatIndex.normalized.indexOf(ns, start);
    if (pos === -1) {
      pos = flatIndex.normalized.toLowerCase().indexOf(ns.toLowerCase(), start);
    }
  }
  if (pos === -1) {
    return null;
  }
  var last = pos + searchText.length - 1;
  if (last >= flatIndex.map.length) {
    return null;
  }
  return {
    startIndex: flatIndex.map[pos],
    endIndex: flatIndex.map[last] + 1,
    flatStart: pos,
    flatEnd: pos + searchText.length
  };
}

// ============================================
// Create native suggestions
// ============================================

/**
 * Applies redline suggestions as native Google Docs suggestions in a single
 * batch. Each redline becomes a suggested deletion of the original text plus a
 * suggested insertion of the replacement.
 *
 * Throws if the batch call fails so the caller can fall back. Returns a per-item
 * applied/failed summary when the call succeeds.
 */
function applyNativeSuggestions(suggestions) {
  if (!suggestions || suggestions.length === 0) {
    return { applied: [], failed: [], native: true };
  }

  var docId = getActiveDocId();
  var docJson = docsApiGet(docId);
  var flatIndex = buildFlatIndex(docJson);

  var located = [];
  var failed = [];
  // Per-text cursor so that N redlines for the same repeated clause map to N
  // successive occurrences instead of all colliding on the first match.
  var cursor = {};
  // Claimed doc-index intervals, to reject any overlapping edit (which would
  // corrupt the batch).
  var occupied = [];

  for (var i = 0; i < suggestions.length; i++) {
    var s = suggestions[i];
    var from = cursor[s.originalText] || 0;
    var range = findDocRange(flatIndex, s.originalText, from);
    if (!range && from > 0) {
      // Ran out of later occurrences; retry from the start once.
      range = findDocRange(flatIndex, s.originalText, 0);
    }
    if (!range) {
      failed.push({ id: s.id, error: 'Text not found in document body' });
      continue;
    }
    cursor[s.originalText] = range.flatEnd;

    var overlaps = false;
    for (var k = 0; k < occupied.length; k++) {
      if (range.startIndex < occupied[k].end && range.endIndex > occupied[k].start) {
        overlaps = true;
        break;
      }
    }
    if (overlaps) {
      failed.push({ id: s.id, error: 'Overlaps another change' });
      continue;
    }
    occupied.push({ start: range.startIndex, end: range.endIndex });
    located.push({ id: s.id, range: range, suggestedText: s.suggestedText });
  }

  if (located.length === 0) {
    return { applied: [], failed: failed, native: true };
  }

  // Apply from the end of the document backwards so earlier (higher-index)
  // edits do not invalidate the indexes of later (lower-index) edits.
  located.sort(function (a, b) {
    return b.range.startIndex - a.range.startIndex;
  });

  var requests = [];
  for (var m = 0; m < located.length; m++) {
    var item = located[m];
    // Suggested deletion of the original range. In suggest mode this flags the
    // text rather than removing it, so it does not shift indexes.
    requests.push({
      deleteContentRange: {
        range: { startIndex: item.range.startIndex, endIndex: item.range.endIndex }
      }
    });
    // Suggested insertion of the replacement at the start of the original range.
    requests.push({
      insertText: {
        text: item.suggestedText,
        location: { index: item.range.startIndex }
      }
    });
  }

  // A throw here propagates to the dispatcher, which falls back to pseudo.
  docsApiBatchUpdate(docId, requests, 'SUGGEST');

  var applied = [];
  for (var n = 0; n < located.length; n++) {
    applied.push(located[n].id);
  }
  return { applied: applied, failed: failed, native: true };
}

// ============================================
// Manage native suggestion threads
// ============================================

/** Recursively collects suggestion ids from content, including table cells. */
function collectIdsFromContent(content, ids) {
  for (var i = 0; i < content.length; i++) {
    var el = content[i];
    if (el.paragraph && el.paragraph.elements) {
      var elements = el.paragraph.elements;
      for (var j = 0; j < elements.length; j++) {
        var run = elements[j].textRun;
        if (!run) {
          continue;
        }
        var lists = [run.suggestedInsertionIds, run.suggestedDeletionIds];
        for (var l = 0; l < lists.length; l++) {
          var arr = lists[l];
          if (arr) {
            for (var a = 0; a < arr.length; a++) {
              ids[arr[a]] = true;
            }
          }
        }
      }
    } else if (el.table && el.table.tableRows) {
      var rows = el.table.tableRows;
      for (var r = 0; r < rows.length; r++) {
        var cells = rows[r].tableCells || [];
        for (var c = 0; c < cells.length; c++) {
          if (cells[c].content) {
            collectIdsFromContent(cells[c].content, ids);
          }
        }
      }
    }
  }
}

/** Collects every unique suggestion id present in the document. */
function collectSuggestionIds(docJson) {
  var ids = {};
  var content = docJson && docJson.body && docJson.body.content ? docJson.body.content : [];
  collectIdsFromContent(content, ids);
  return Object.keys(ids);
}

/**
 * Accepts every native suggestion in the document. Users can also accept
 * individually in Google's own Suggesting UI, this is the bulk action.
 */
function acceptAllNativeSuggestions() {
  var docId = getActiveDocId();
  var docJson = docsApiGet(docId);
  var ids = collectSuggestionIds(docJson);
  if (ids.length === 0) {
    return { count: 0 };
  }
  var requests = [];
  for (var i = 0; i < ids.length; i++) {
    requests.push({ acceptSuggestion: { suggestionId: ids[i] } });
  }
  docsApiBatchUpdate(docId, requests, null);
  return { count: ids.length };
}

/** Rejects every native suggestion in the document. */
function rejectAllNativeSuggestions() {
  var docId = getActiveDocId();
  var docJson = docsApiGet(docId);
  var ids = collectSuggestionIds(docJson);
  if (ids.length === 0) {
    return { count: 0 };
  }
  var requests = [];
  for (var i = 0; i < ids.length; i++) {
    requests.push({ rejectSuggestion: { suggestionId: ids[i] } });
  }
  docsApiBatchUpdate(docId, requests, null);
  return { count: ids.length };
}

// ============================================
// Anchored comments (Developer Preview)
// ============================================

/**
 * Inserts a native Google Docs comment anchored to the first occurrence of
 * searchText. Uses the Developer-Preview InsertCommentRequest via raw REST, so
 * the calling account must be enrolled. Throws on failure so the caller can
 * surface a fallback message.
 */
function insertNativeComment(searchText, content) {
  var docId = getActiveDocId();
  var docJson = docsApiGet(docId);
  var flatIndex = buildFlatIndex(docJson);
  var range = findDocRange(flatIndex, searchText);
  if (!range) {
    throw new Error('Could not locate the clause text to anchor the comment');
  }

  var requests = [
    {
      insertComment: {
        content: content,
        range: { startIndex: range.startIndex, endIndex: range.endIndex }
      }
    }
  ];
  docsApiBatchUpdate(docId, requests, null);
  return { anchored: true };
}

// ============================================
// Exports for GAS
// ============================================

(globalThis as any).isNativeSuggestionsEnabled = isNativeSuggestionsEnabled;
(globalThis as any).setNativeSuggestions = setNativeSuggestions;
(globalThis as any).getNativeSuggestionsStatus = getNativeSuggestionsStatus;
(globalThis as any).applyNativeSuggestions = applyNativeSuggestions;
(globalThis as any).acceptAllNativeSuggestions = acceptAllNativeSuggestions;
(globalThis as any).rejectAllNativeSuggestions = rejectAllNativeSuggestions;
(globalThis as any).insertNativeComment = insertNativeComment;
