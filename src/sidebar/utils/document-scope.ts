/**
 * Document size and change helpers, shared across panels.
 *
 * The character limits below MUST match the caps enforced server-side in
 * src/gas/Code.ts (REVIEW_DOC_CHAR_LIMIT / CHAT_DOC_CHAR_LIMIT). They are
 * mirrored here so the UI can tell the user, before they run anything, how much
 * of a long document a feature will actually read.
 */

/** Characters sent to the backend per feature. Keep in sync with Code.ts. */
export const DOC_CHAR_LIMITS = {
  review: 200000,
  // Contract review chunks large documents (MAX_REVIEW_CHUNKS x review in
  // Code.ts), so the effective coverage ceiling is higher than a single call.
  reviewFull: 600000,
  chat: 80000
} as const;

/** Rough characters per contract page, for a human-readable page estimate. */
export const CHARS_PER_PAGE = 2800;

export interface DocScope {
  truncated: boolean;
  totalChars: number;
  sentChars: number;
  pagesTotal: number;
  pagesSent: number;
}

/** Given the document size and a feature cap, describe what will be analyzed. */
export function docScope(totalChars: number, limit: number): DocScope {
  const total = Math.max(0, totalChars || 0);
  const sent = Math.min(total, limit);
  return {
    truncated: total > limit,
    totalChars: total,
    sentChars: sent,
    pagesTotal: Math.max(1, Math.round(total / CHARS_PER_PAGE)),
    pagesSent: Math.max(1, Math.round(sent / CHARS_PER_PAGE))
  };
}

/**
 * djb2 string hash, returned as an unsigned 32-bit decimal string.
 *
 * This is byte-for-byte identical to djb2Hash in src/gas/Code.ts, so a hash
 * computed here over document text equals the one getDocumentFingerprint
 * returns from the server. That equality is what lets us detect edits.
 */
export function hashText(text: string): string {
  let h = 5381;
  for (let i = 0; i < text.length; i++) {
    h = ((h << 5) + h + text.charCodeAt(i)) | 0;
  }
  return String(h >>> 0);
}
