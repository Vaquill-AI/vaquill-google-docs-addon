// Shared types between GAS and Svelte sidebar

// ============================================
// Document Types
// ============================================

export interface DocumentContent {
  documentId: string;
  title: string;
  text: string;
  paragraphs: ParagraphInfo[];
  wordCount: number;
  characterCount: number;
  /** Footnotes, header, and footer text, appended for backend analysis only. */
  extras?: string;
  /** Number of top-level document tabs (1 for a normal single-tab document). */
  tabCount?: number;
  /** Whether the current user can edit this document (false = view/comment only). */
  canEdit?: boolean;
}

export interface ParagraphInfo {
  index: number;
  text: string;
  charStart: number;
  charEnd: number;
  clauseType?: ClauseType;
}

export type ClauseType =
  | 'definitions'
  | 'indemnification'
  | 'limitation_of_liability'
  | 'confidentiality'
  | 'termination'
  | 'governing_law'
  | 'dispute_resolution'
  | 'force_majeure'
  | 'assignment'
  | 'notices'
  | 'warranties'
  | 'intellectual_property'
  | 'payment_terms'
  | 'representations'
  | 'data_protection'
  | 'insurance'
  | 'miscellaneous'
  | 'unknown';

// ============================================
// Chat Types
// ============================================

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  citations?: Citation[];
  timestamp: number;
  isStreaming?: boolean;
}

export interface Citation {
  text: string;
  charStart: number;
  charEnd: number;
  clauseType?: ClauseType;
  paragraphIndex?: number;
}

export interface ChatRequest {
  documentId: string;
  documentText: string;
  query: string;
  conversationHistory?: ChatMessage[];
  mode: ChatMode;
  /** Optional selected passage to guarantee is in context for large documents. */
  focusText?: string;
}

/** A cheap content fingerprint used to detect edits to the open document. */
export interface DocumentFingerprint {
  length: number;
  hash: string;
}

export type ChatMode = 'ask' | 'draft';

export interface ChatResponse {
  answer: string;
  citations: Citation[];
  suggestedFollowUps?: string[];
}

// ============================================
// Unified Risk/Severity Taxonomy
// ============================================

/**
 * Primary risk level indicator (traffic light system)
 * Used for visual display across all panels
 */
export type RiskLevel = 'green' | 'yellow' | 'red';

/**
 * Numeric severity scale for risk matrices (1-5)
 * Used in Risk Assessment for severity x likelihood calculations
 */
export type SeverityLevel = 1 | 2 | 3 | 4 | 5;
export type LikelihoodLevel = 1 | 2 | 3 | 4 | 5;

/**
 * Text-based severity for suggestions and issues
 * Maps to RiskLevel: low/medium -> green, high -> yellow, critical -> red
 */
export type Severity = 'low' | 'medium' | 'high' | 'critical';

/**
 * Priority levels for redline suggestions
 */
export type Priority = 'must-have' | 'should-have' | 'nice-to-have';

/**
 * Effectiveness/effort levels for mitigation options
 */
export type EffortLevel = 'low' | 'medium' | 'high';

export interface RiskClassification {
  level: RiskLevel;
  label: string;
  description: string;
  action: string;
}

// Severity to RiskLevel mapping (for consistent visual display)
// low -> green, medium -> green, high -> yellow, critical -> red

// ============================================
// Playbook Configuration Types
// ============================================

export interface PlaybookConfig {
  id: string;
  name: string;
  description: string;
  createdAt: number;
  updatedAt: number;
  clauses: ClausePlaybook;
  ndaDefaults: NDADefaults;
  responseTemplates: ResponseTemplate[];
}

export interface ClausePlaybook {
  limitation_of_liability: ClausePosition;
  indemnification: ClausePosition;
  intellectual_property: ClausePosition;
  data_protection: ClausePosition;
  confidentiality: ClausePosition;
  termination: ClausePosition;
  governing_law: ClausePosition;
  insurance: ClausePosition;
  assignment: ClausePosition;
  force_majeure: ClausePosition;
}

export interface ClausePosition {
  standardPosition: string;
  acceptableRange: string;
  escalationTriggers: string[];
  preferredLanguage?: string;
  fallbackLanguage?: string;
}

export interface NDADefaults {
  mutualRequired: boolean;
  standardTerm: string;
  maxTerm: string;
  requiredCarveouts: string[];
  prohibitedProvisions: string[];
  acceptableJurisdictions: string[];
}

export interface ResponseTemplate {
  id: string;
  category: string;
  name: string;
  useCase: string;
  escalationTriggers: string[];
  variables: TemplateVariable[];
  subjectLine: string;
  body: string;
  followUpActions: string[];
}

export interface TemplateVariable {
  name: string;
  description: string;
  example: string;
}

// ============================================
// Contract Review Types
// ============================================

export interface ContractReviewRequest {
  documentId: string;
  documentText: string;
  contractType?: string;
  userSide: 'vendor' | 'customer' | 'licensor' | 'licensee' | 'partner' | 'other';
  deadline?: string;
  focusAreas?: string[];
  dealContext?: string;
  playbookConfig?: PlaybookConfig;
}

export interface ContractReviewResponse {
  documentInfo: {
    title: string;
    parties: string[];
    userSide: string;
    contractType: string;
    reviewBasis: 'playbook' | 'generic';
  };
  keyFindings: ClauseAnalysis[];
  clauseAnalysis: ClauseAnalysis[];
  negotiationStrategy: NegotiationStrategy;
  nextSteps: string[];
  overallRisk: RiskLevel;
  /** Present when a long document was reviewed in multiple merged sections. */
  reviewCoverage?: { chunks: number; partial: boolean };
}

export interface ClauseAnalysis {
  clauseType: ClauseType;
  clauseTitle: string;
  riskLevel: RiskLevel;
  currentLanguage: string;
  playbookPosition?: string;
  deviation: string;
  businessImpact: string;
  redlineSuggestion?: RedlineSuggestion;
  charStart?: number;
  charEnd?: number;
}

export interface RedlineSuggestion {
  originalText: string;
  suggestedText: string;
  rationale: string;
  priority: Priority;
  fallbackPosition?: string;
}

export interface NegotiationStrategy {
  overallApproach: string;
  tier1MustHaves: string[];
  tier2ShouldHaves: string[];
  tier3Concessions: string[];
  timelineConsiderations?: string;
}

// ============================================
// NDA Triage Types
// ============================================

export interface NDATriageRequest {
  documentId: string;
  documentText: string;
  playbookConfig?: PlaybookConfig;
}

export interface NDATriageResponse {
  classification: RiskLevel;
  classificationLabel: 'Standard Approval' | 'Counsel Review' | 'Significant Issues';
  parties: string[];
  ndaType: 'mutual' | 'unilateral-disclosing' | 'unilateral-receiving';
  term: string;
  governingLaw: string;
  reviewBasis: 'playbook' | 'defaults';
  screeningResults: NDAScreeningResult[];
  issuesFound: NDAIssue[];
  recommendation: string;
  nextSteps: string[];
}

export interface NDAScreeningResult {
  criterion: string;
  status: 'pass' | 'flag' | 'fail';
  notes: string;
}

export interface NDAIssue {
  severity: RiskLevel;
  title: string;
  description: string;
  risk: string;
  suggestedFix: string;
  // When the issue is a fixable clause, these carry the exact text to replace
  // and its replacement, so the redline can be applied to the document.
  originalText?: string;
  suggestedText?: string;
  charStart?: number;
  charEnd?: number;
}

// ============================================
// Risk Assessment Types
// ============================================

export interface RiskAssessmentRequest {
  documentId: string;
  documentText: string;
  matterDescription: string;
  category: RiskCategory;
}

export type RiskCategory =
  | 'contract'
  | 'regulatory'
  | 'litigation'
  | 'ip'
  | 'data_privacy'
  | 'employment'
  | 'corporate'
  | 'other';

export interface RiskAssessmentResponse {
  date: string;
  matter: string;
  category: RiskCategory;
  riskDescription: string;
  backgroundContext: string;
  severityAssessment: {
    level: SeverityLevel;
    label: string;
    rationale: string;
  };
  likelihoodAssessment: {
    level: LikelihoodLevel;
    label: string;
    rationale: string;
  };
  riskScore: number;
  riskLevel: RiskLevel;
  contributingFactors: string[];
  mitigatingFactors: string[];
  mitigationOptions: MitigationOption[];
  recommendedApproach: string;
  residualRisk: string;
  monitoringPlan: string;
  nextSteps: ActionItem[];
  escalationRequired: boolean;
  escalationPath?: string;
}

export interface MitigationOption {
  option: string;
  effectiveness: EffortLevel;
  costEffort: EffortLevel;
  recommended: boolean;
}

export interface ActionItem {
  action: string;
  owner: string;
  deadline: string;
}

// ============================================
// Compliance / DPA Review Types
// ============================================

export interface ComplianceReviewRequest {
  documentId: string;
  documentText: string;
  reviewType: 'dpa' | 'privacy_policy' | 'dsr' | 'general';
  applicableRegulations?: string[];
}

export interface ComplianceReviewResponse {
  reviewType: string;
  applicableRegulations: string[];
  overallStatus: RiskLevel;
  checklistResults: ComplianceCheckItem[];
  issues: ComplianceIssue[];
  recommendations: string[];
  nextSteps: string[];
}

export interface ComplianceCheckItem {
  category: string;
  requirement: string;
  status: 'compliant' | 'partial' | 'non-compliant' | 'not-applicable';
  notes: string;
  reference?: string;
}

export interface ComplianceIssue {
  severity: RiskLevel;
  requirement: string;
  currentState: string;
  expectedState: string;
  remediation: string;
  deadline?: string;
}

// ============================================
// Suggestion Types (for pseudo-suggestions in Google Docs)
// ============================================

export interface Suggestion {
  id: string;
  originalText: string;
  suggestedText: string;
  charStart: number;
  charEnd: number;
  // Paragraph-relative positioning for accurate text location
  paragraphIndex?: number;
  paragraphOffset?: number;
  rationale: string;
  clauseType?: ClauseType;
  severity: Severity;
  status: 'pending' | 'accepted' | 'rejected' | 'modified';
  createdAt: number;
}

// ============================================
// Navigation / Clause Map Types
// ============================================

export interface ClauseMapItem {
  clauseType: ClauseType;
  label: string;
  charStart: number;
  charEnd: number;
  paragraphIndex: number;
  riskLevel?: RiskLevel;
}

export interface NavigationRequest {
  documentId: string;
  documentText: string;
}

export interface NavigationResponse {
  clauses: ClauseMapItem[];
  documentStructure: {
    sections: number;
    paragraphs: number;
    estimatedPages: number;
  };
}

// ============================================
// Summary Types
// ============================================

export type AudienceType = 'ceo' | 'cfo' | 'legal' | 'general';

export interface SummaryRequest {
  documentId: string;
  documentText: string;
  audience: AudienceType;
  includeRisks?: boolean;
  includeObligations?: boolean;
}

export interface SummaryResponse {
  summary: string;
  keyPoints: string[];
  risks: SummaryRisk[];
  obligations: SummaryObligation[];
  nextSteps?: string[];
}

export interface SummaryRisk {
  description: string;
  severity: Severity;
  clauseReference?: string;
}

export interface SummaryObligation {
  party: string;
  obligation: string;
  deadline?: string;
  clauseReference?: string;
}

// ============================================
// Report Generation Types
// ============================================

export interface ReportGenerationRequest {
  reportType: 'contract-review' | 'nda-triage' | 'risk-assessment' | 'compliance';
  data: ContractReviewResponse | NDATriageResponse | RiskAssessmentResponse | ComplianceReviewResponse;
  insertIntoDocument: boolean;
}


// ============================================
// API Response Types
// ============================================

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: ApiError;
}

export interface ApiError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

// ============================================
// GAS Bridge Types
// ============================================

export interface GASBridge {
  // Document operations
  getDocumentContent(): Promise<DocumentContent>;
  navigateToOffset(charOffset: number): Promise<void>;
  insertTextAtCursor(text: string): Promise<void>;

  // Suggestion operations
  applySuggestion(suggestion: Suggestion): Promise<{ status: string }>;
  acceptSuggestion(suggestionId: string): Promise<{ status: string }>;
  rejectSuggestion(suggestionId: string): Promise<{ status: string }>;
  acceptAllSuggestions(): Promise<{ count: number }>;
  rejectAllSuggestions(): Promise<{ count: number }>;

  // Playbook configuration
  getPlaybookConfig(): Promise<PlaybookConfig | null>;
  savePlaybookConfig(config: PlaybookConfig): Promise<void>;

  // User info
  getUserEmail(): Promise<string>;
}

// ============================================
// UI State Types
// ============================================

export type TabId = 'review' | 'playbooks' | 'draft' | 'library' | 'chat' | 'compare';

// ============================================
// Backend Playbooks (thin client)
// ============================================

/** A negotiation position for one clause type (the fallback-ladder moat). */
export interface PlaybookPosition {
  standardPosition?: string;
  acceptableRange?: string;
  escalationTriggers?: string[];
  fallbackLadder?: string[];
  dealBreaker?: string | null;
  priority?: 'must_have' | 'should_have' | 'nice_to_have' | null;
}

/** A firm negotiation playbook with per-clause positions, from the backend. */
export interface Playbook {
  id: string;
  name: string;
  description?: string | null;
  contractType: string;
  isDefault: boolean;
  positions: Record<string, PlaybookPosition>;
}

/** A starter template a user can adopt in one click. */
export interface PlaybookTemplate {
  slug: string;
  name: string;
  description?: string;
  category?: string;
  contractType?: string;
  featured?: boolean;
}

// ============================================
// Backend Drafting (thin client)
// ============================================

export interface ClauseRewriteResult {
  original: string;
  rewritten: string;
  changesSummary: string;
}

export interface ClauseExplainResult {
  explanation: string;
  keyObligations: string[];
  risks: string[];
  applicableActs: string[];
}

export interface DraftResult {
  draftId: string;
  title: string;
  category: string;
  fullText: string;
  qualityScore?: number;
}

// ============================================
// Library (clauses + prompts)
// ============================================

export interface LibraryClause {
  id: string;
  name: string;
  clauseType: string;
  content: string;
  tone?: string;
  tags?: string[];
  isSystem?: boolean;
}

export interface LibraryPrompt {
  id: string;
  title: string;
  body: string;
  category?: string;
}

export interface UIState {
  activeTab: TabId;
  isLoading: boolean;
  error: string | null;
  selectedPlaybookId: string | null;
}


// ============================================
// Version Comparison Types
// ============================================

/**
 * Type of change detected in comparison
 */
export type ChangeType = 'added' | 'removed' | 'modified' | 'moved';

/**
 * Legal significance of a change
 */
export type ChangeSignificance = 'critical' | 'high' | 'medium' | 'low' | 'cosmetic';

/**
 * Individual change detected between versions
 */
export interface VersionChange {
  id: string;
  changeType: ChangeType;
  significance: ChangeSignificance;
  clauseType?: ClauseType;
  originalText: string;
  newText: string;
  charStart: number;
  charEnd: number;
  legalAnalysis: string;
  businessImpact: string;
  recommendation: 'accept' | 'reject' | 'negotiate';
  negotiationNotes?: string;
}

/**
 * Summary statistics for a comparison
 */
export interface ComparisonStats {
  totalChanges: number;
  criticalChanges: number;
  highChanges: number;
  mediumChanges: number;
  lowChanges: number;
  cosmeticChanges: number;
  addedClauses: number;
  removedClauses: number;
  modifiedClauses: number;
}

/**
 * Request for version comparison
 */
export interface CompareVersionsRequest {
  originalDocumentId: string;
  originalText: string;
  revisedText: string;
  userSide?: 'vendor' | 'customer' | 'licensor' | 'licensee' | 'partner' | 'other';
  focusAreas?: string[];
}

/**
 * Response from version comparison
 */
export interface CompareVersionsResponse {
  stats: ComparisonStats;
  changes: VersionChange[];
  summary: string;
  overallRisk: RiskLevel;
  recommendations: string[];
  nextSteps: string[];
}
