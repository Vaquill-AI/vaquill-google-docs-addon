/**
 * GAS Client - Bridge between Svelte sidebar and Google Apps Script
 *
 * This service wraps google.script.run to provide a Promise-based API
 * for communicating with the GAS backend.
 */

import type {
  DocumentContent,
  DocumentFingerprint,
  Suggestion,
  ChatRequest,
  ChatResponse,
  ContractReviewResponse,
  NDATriageResponse,
  RiskAssessmentResponse,
  ComplianceReviewResponse,
  PlaybookConfig,
  Playbook,
  PlaybookTemplate,
  ClauseRewriteResult,
  ClauseExplainResult,
  DraftResult,
  LibraryClause,
  LibraryPrompt
} from '$shared/types';

// ============================================
// Error Handling
// ============================================

/** Standardized error class for GAS operations */
export class GASError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly originalError?: unknown
  ) {
    super(message);
    this.name = 'GASError';
  }
}

/** Error codes for categorizing failures */
export const GASErrorCodes = {
  NOT_AVAILABLE: 'GAS_NOT_AVAILABLE',
  FUNCTION_NOT_FOUND: 'FUNCTION_NOT_FOUND',
  API_ERROR: 'API_ERROR',
  NETWORK_ERROR: 'NETWORK_ERROR',
  TIMEOUT: 'TIMEOUT',
  UNKNOWN: 'UNKNOWN_ERROR'
} as const;

/** User-friendly error messages */
function getUserFriendlyMessage(code: string, functionName: string): string {
  switch (code) {
    case GASErrorCodes.NOT_AVAILABLE:
      return 'Unable to connect to Google Docs. Please reload the sidebar.';
    case GASErrorCodes.FUNCTION_NOT_FOUND:
      return `Feature "${functionName}" is not available. Please update the extension.`;
    case GASErrorCodes.API_ERROR:
      return 'The AI service encountered an error. Please try again.';
    case GASErrorCodes.NETWORK_ERROR:
      return 'Network error. Please check your connection and try again.';
    case GASErrorCodes.TIMEOUT:
      return 'The request timed out. Please try again.';
    default:
      return 'An unexpected error occurred. Please try again.';
  }
}

/** Parse error from GAS and return standardized GASError */
function parseGASError(error: unknown, functionName: string): GASError {
  const errorMessage = error instanceof Error ? error.message : String(error);

  // Detect error type from message patterns
  if (errorMessage.includes('not available') || errorMessage.includes('not defined')) {
    return new GASError(
      getUserFriendlyMessage(GASErrorCodes.NOT_AVAILABLE, functionName),
      GASErrorCodes.NOT_AVAILABLE,
      error
    );
  }

  if (errorMessage.includes('timeout') || errorMessage.includes('Timeout')) {
    return new GASError(
      getUserFriendlyMessage(GASErrorCodes.TIMEOUT, functionName),
      GASErrorCodes.TIMEOUT,
      error
    );
  }

  // Default: preserve a genuine, user-safe backend message (quota, "query too
  // long", validation, etc.) instead of masking it with a generic string.
  return new GASError(
    isUserSafeMessage(errorMessage)
      ? errorMessage
      : getUserFriendlyMessage(GASErrorCodes.UNKNOWN, functionName),
    GASErrorCodes.UNKNOWN,
    error
  );
}

/**
 * A message is considered safe to surface directly when it is a short,
 * single-line string that does not look like a raw runtime/stack trace.
 */
function isUserSafeMessage(message: string): boolean {
  const trimmed = message.trim();
  if (!trimmed) return false;
  if (trimmed.length > 300) return false;
  if (trimmed.includes('\n')) return false;
  // Stack-trace frames like "at fn (file:12:3)" are not user-safe.
  if (/\bat\s+.+:\d+:\d+/.test(trimmed)) return false;
  return true;
}

// Type for google.script.run (available in GAS environment).
// The chainable handler methods and the dynamically-named backend functions are
// declared separately so the fixed method signatures do not have to conform to
// the string index signature used for dynamic calls.
interface GASRunner {
  withSuccessHandler<T>(callback: (result: T) => void): GASRunner;
  withFailureHandler(callback: (error: Error) => void): GASRunner;
  withUserObject<T>(obj: T): GASRunner;
}

declare const google: {
  script: {
    run: GASRunner;
  };
};

// Check if running in GAS environment
const isGASEnvironment = typeof google !== 'undefined' && Boolean(google.script?.run);

// Default client-side timeout for a GAS call. Long-running backend operations
// (review, generation) get a higher ceiling, still under the Apps Script
// server execution limit. Keyed by GAS function name.
const DEFAULT_GAS_TIMEOUT_MS = 90000;
const GAS_TIMEOUT_OVERRIDES: Record<string, number> = {
  runContractReview: 300000,
  runNDATriage: 300000,
  runComplianceReview: 300000,
  runRiskAssessment: 300000,
  generateContractReviewReport: 120000,
  generateComplianceReport: 120000,
  generateNDATriageReport: 120000,
  generateDraft: 240000,
  rewriteClause: 150000,
  explainClause: 150000,
  runChat: 180000
};

/**
 * Wrap a GAS function call in a Promise with standardized error handling
 */
function callGAS<T>(functionName: string, ...args: unknown[]): Promise<T> {
  return new Promise((resolve, reject) => {
    if (!isGASEnvironment) {
      // Mock for local development
      console.warn(`[GAS Mock] Called ${functionName} with:`, args);
      reject(new GASError(
        getUserFriendlyMessage(GASErrorCodes.NOT_AVAILABLE, functionName),
        GASErrorCodes.NOT_AVAILABLE
      ));
      return;
    }

    // A GAS function that never invokes either handler would otherwise leave
    // this promise (and any loading/streaming flag gated on it) pending
    // forever. A generous timeout rejects so the UI can recover.
    let settled = false;
    const timeoutMs = GAS_TIMEOUT_OVERRIDES[functionName] ?? DEFAULT_GAS_TIMEOUT_MS;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(new GASError(
        getUserFriendlyMessage(GASErrorCodes.TIMEOUT, functionName),
        GASErrorCodes.TIMEOUT
      ));
    }, timeoutMs);

    const runner = google.script.run
      .withSuccessHandler((result: T) => {
        clearTimeout(timer);
        if (settled) return;
        settled = true;
        resolve(result);
      })
      .withFailureHandler((error: Error) => {
        clearTimeout(timer);
        if (settled) return;
        settled = true;
        console.error(`[GAS Error] ${functionName}:`, error);
        reject(parseGASError(error, functionName));
      });

    // Call the function with arguments. Backend functions are named dynamically,
    // so index into the runner through a string-keyed record view.
    const dynamicRunner = runner as unknown as Record<string, (...args: unknown[]) => void>;
    const fn = dynamicRunner[functionName];
    if (typeof fn === 'function') {
      fn.apply(runner, args);
    } else {
      clearTimeout(timer);
      settled = true;
      reject(new GASError(
        getUserFriendlyMessage(GASErrorCodes.FUNCTION_NOT_FOUND, functionName),
        GASErrorCodes.FUNCTION_NOT_FOUND
      ));
    }
  });
}

// ============================================
// Document Operations
// ============================================

export async function getDocumentContent(): Promise<DocumentContent> {
  return callGAS<DocumentContent>('getDocumentContent');
}

/** Cheap length + hash fingerprint of the document body, for edit detection. */
export async function getDocumentFingerprint(): Promise<DocumentFingerprint> {
  return callGAS<DocumentFingerprint>('getDocumentFingerprint');
}

export async function navigateToOffset(charOffset: number): Promise<void> {
  return callGAS<void>('navigateToOffset', charOffset);
}

/** Returns the text the user currently has selected in the document. */
export async function getSelectedText(): Promise<string> {
  return callGAS<string>('getSelectedText');
}

/**
 * Generates supporting US authority for a clause and inserts it as a native
 * anchored comment in the document.
 */
export async function addClauseCitation(
  clauseText: string
): Promise<{ anchored: boolean; citations: string }> {
  return callGAS<{ anchored: boolean; citations: string }>('addClauseCitation', clauseText);
}

/** Adds an arbitrary note as a comment anchored to the given text. */
export async function addComment(
  clauseText: string,
  body: string
): Promise<{ anchored: boolean }> {
  return callGAS<{ anchored: boolean }>('addAnchoredComment', clauseText, body);
}

// ============================================
// Vaquill Account (backend auth)
// ============================================

export interface AuthStatus {
  signedIn: boolean;
  email: string;
  needsSignup: boolean;
  error?: string;
}

/** Resolves the user's Vaquill account status via the backend identity exchange. */
export async function getAuthStatus(): Promise<AuthStatus> {
  return callGAS<AuthStatus>('getAuthStatus');
}

/** Clears the cached Vaquill session for this user. */
export async function signOutVaquill(): Promise<{ signedOut: boolean }> {
  return callGAS<{ signedOut: boolean }>('signOut');
}


export async function getUserEmail(): Promise<string> {
  return callGAS<string>('getUserEmail');
}

// ============================================
// Playbook Configuration
// ============================================

export async function getPlaybookConfig(): Promise<PlaybookConfig | null> {
  return callGAS<PlaybookConfig | null>('getPlaybookConfig');
}

export async function savePlaybookConfig(config: PlaybookConfig): Promise<void> {
  return callGAS<void>('savePlaybookConfig', config);
}

export async function deletePlaybookConfig(): Promise<void> {
  return callGAS<void>('deletePlaybookConfig');
}

// ============================================
// Playbooks (backend thin client)
// ============================================

/** List the user's negotiation playbooks (with per-clause positions). */
export async function listPlaybooks(): Promise<Playbook[]> {
  return callGAS<Playbook[]>('listPlaybooks');
}

/** List starter playbook templates that can be adopted in one click. */
export async function listPlaybookTemplates(): Promise<PlaybookTemplate[]> {
  return callGAS<PlaybookTemplate[]>('listPlaybookTemplates');
}

/** Adopt a starter template into a new user-owned playbook. Returns it. */
export async function createPlaybookFromTemplate(templateSlug: string): Promise<Playbook> {
  return callGAS<Playbook>('createPlaybookFromTemplate', templateSlug);
}

// ============================================
// Drafting (backend thin client)
// ============================================

/** Rewrite a clause per an instruction, grounded on the backend. */
export async function rewriteClause(clauseText: string, instruction: string): Promise<ClauseRewriteResult> {
  return callGAS<ClauseRewriteResult>('rewriteClause', clauseText, instruction);
}

/** Explain a clause (obligations, risks, applicable authority). */
export async function explainClause(clauseText: string): Promise<ClauseExplainResult> {
  return callGAS<ClauseExplainResult>('explainClause', clauseText);
}

/** Generate a full, template-constrained first draft. */
export async function generateDraft(
  category: string,
  title: string,
  specialInstructions?: string
): Promise<DraftResult> {
  return callGAS<DraftResult>('generateDraft', category, title, specialInstructions);
}

/** Insert text at the cursor (or append) in the document. */
export async function insertTextAtCursor(text: string): Promise<{ inserted: boolean }> {
  return callGAS<{ inserted: boolean }>('insertTextAtCursor', text);
}

/** Replace the current selection with new text. */
export async function replaceSelection(newText: string): Promise<{ replaced: boolean }> {
  return callGAS<{ replaced: boolean }>('replaceSelection', newText);
}

// ============================================
// Library (clauses + prompts)
// ============================================

/** List clauses from the clause library (saved + system). */
export async function listClauses(): Promise<LibraryClause[]> {
  return callGAS<LibraryClause[]>('listClauses');
}

/** List the user's saved prompts. */
export async function listPrompts(): Promise<LibraryPrompt[]> {
  return callGAS<LibraryPrompt[]>('listPrompts');
}

// ============================================
// Suggestion Operations (Pseudo-Suggestions)
// ============================================

export async function applySuggestion(suggestion: Suggestion): Promise<{ status: string }> {
  return callGAS<{ status: string }>('applySuggestion', suggestion);
}

export async function acceptSuggestion(suggestionId: string): Promise<{ status: string }> {
  return callGAS<{ status: string }>('acceptSuggestion', suggestionId);
}

export async function rejectSuggestion(suggestionId: string): Promise<{ status: string }> {
  return callGAS<{ status: string }>('rejectSuggestion', suggestionId);
}

export async function acceptAllSuggestions(): Promise<{ count: number }> {
  return callGAS<{ count: number }>('acceptAllSuggestions');
}

export async function rejectAllSuggestions(): Promise<{ count: number }> {
  return callGAS<{ count: number }>('rejectAllSuggestions');
}

// ============================================
// Native Google Docs Suggestions (Developer Preview)
// ============================================

/**
 * Applies redline suggestions to the document. When native suggestions are
 * enabled and the account supports them, these become real Google Docs
 * tracked-change suggestions. Otherwise the pseudo-suggestion engine is used.
 * The returned `mode` reports which path was taken.
 */
export async function applyRedlineSuggestions(
  suggestions: Suggestion[]
): Promise<{ applied: string[]; failed: Array<{ id: string; error: string }>; mode?: string }> {
  return callGAS<{ applied: string[]; failed: Array<{ id: string; error: string }>; mode?: string }>(
    'applyMultipleSuggestions',
    suggestions
  );
}

export async function getNativeSuggestionsStatus(): Promise<{ enabled: boolean }> {
  return callGAS<{ enabled: boolean }>('getNativeSuggestionsStatus');
}

export async function setNativeSuggestions(enabled: boolean): Promise<{ enabled: boolean }> {
  return callGAS<{ enabled: boolean }>('setNativeSuggestions', enabled);
}

// ============================================
// Backend-powered API functions (via GAS)
// ============================================

/**
 * Send a chat message. Routes through runChat, which runs the grounded Vaquill
 * backend RAG chat over the open document (Vaquill is the only path).
 */
export async function sendChatMessage(request: ChatRequest): Promise<ChatResponse> {
  return callGAS<ChatResponse>('runChat', {
    documentText: request.documentText,
    query: request.query,
    mode: request.mode,
    focusText: request.focusText,
    conversationHistory: request.conversationHistory?.map(m => ({
      role: m.role,
      content: m.content
    }))
  });
}

/**
 * Quick answer for fast single-turn responses, via the grounded Vaquill chat.
 */
export async function quickAnswer(documentText: string, question: string): Promise<string> {
  return callGAS<string>('runQuickAnswer', documentText, question);
}

// ============================================
// Legal Workflow Functions
// ============================================

/**
 * Run comprehensive contract review with playbook-based analysis.
 */
export async function runContractReview(request: {
  contractType?: string;
  userSide: string;
  focusAreas?: string[];
  usePlaybook?: boolean;
  playbookId?: string;
  posture?: string;
}): Promise<ContractReviewResponse> {
  return callGAS<ContractReviewResponse>('runContractReview', request);
}

/**
 * Run NDA triage with 10-point screening checklist.
 */
export async function runNDATriage(): Promise<NDATriageResponse> {
  return callGAS<NDATriageResponse>('runNDATriage');
}

/**
 * Run risk assessment using severity x likelihood matrix.
 */
export async function runRiskAssessment(request: {
  matterDescription: string;
  category: string;
}): Promise<RiskAssessmentResponse> {
  return callGAS<RiskAssessmentResponse>('runRiskAssessment', request);
}

/**
 * Run compliance/DPA review against regulatory requirements.
 */
export async function runComplianceReview(request: {
  reviewType: string;
  applicableRegulations?: string[];
}): Promise<ComplianceReviewResponse> {
  return callGAS<ComplianceReviewResponse>('runComplianceReview', request);
}

// ============================================
// Report Generation
// ============================================

/**
 * Insert a formatted report into the document.
 */
export async function insertReportInDocument(reportMarkdown: string): Promise<void> {
  return callGAS<void>('insertReportInDocument', reportMarkdown);
}

/**
 * Generate markdown report from contract review results.
 */
export async function generateContractReviewReport(result: ContractReviewResponse): Promise<string> {
  return callGAS<string>('generateContractReviewReport', result);
}

/**
 * Generate markdown report from NDA triage results.
 */
export async function generateNDATriageReport(result: NDATriageResponse): Promise<string> {
  return callGAS<string>('generateNDATriageReport', result);
}

/**
 * Generate markdown report from risk assessment results.
 */
export async function generateRiskAssessmentReport(result: RiskAssessmentResponse): Promise<string> {
  return callGAS<string>('generateRiskAssessmentReport', result);
}

/**
 * Generate markdown report from compliance review results.
 */
export async function generateComplianceReport(result: ComplianceReviewResponse): Promise<string> {
  return callGAS<string>('generateComplianceReport', result);
}

/**
 * Chat over the open document. The Vaquill backend performs RAG and any web
 * grounding itself, so there is no separate client-side research step.
 */
export async function hybridChat(request: ChatRequest): Promise<ChatResponse> {
  return sendChatMessage(request);
}

// ============================================
// Development Helpers
// ============================================

/**
 * Check if running in GAS environment
 */
export function isInGASEnvironment(): boolean {
  return isGASEnvironment;
}
