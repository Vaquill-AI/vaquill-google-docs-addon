/**
 * Vaquill Legal AI Contract Copilot - Google Apps Script Entry Point
 *
 * This is the main entry point for the Google Docs add-on.
 * It handles menu creation, sidebar display, and coordinates all GAS services.
 */

// ============================================
// Type Definitions (inline for GAS compatibility)
// ============================================

/** Playbook configuration stored in user properties */
interface PlaybookConfig {
  id: string;
  name: string;
  description: string;
  createdAt: number;
  updatedAt: number;
  clauses: Record<string, ClausePosition>;
  ndaDefaults: NDADefaults;
  responseTemplates: ResponseTemplate[];
}

interface ClausePosition {
  standardPosition: string;
  acceptableRange: string;
  escalationTriggers: string[];
  preferredLanguage?: string;
  fallbackLanguage?: string;
}

interface NDADefaults {
  mutualRequired: boolean;
  standardTerm: string;
  maxTerm: string;
  requiredCarveouts: string[];
  prohibitedProvisions: string[];
  acceptableJurisdictions: string[];
}

interface ResponseTemplate {
  id: string;
  category: string;
  name: string;
  useCase: string;
  escalationTriggers: string[];
  variables: { name: string; description: string; example: string }[];
  subjectLine: string;
  body: string;
  followUpActions: string[];
}

/** Risk level (traffic light system) */
type RiskLevel = 'green' | 'yellow' | 'red';

/** Contract review response from the Vaquill backend */
interface ContractReviewResponse {
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
  reviewCoverage?: { chunks: number; partial: boolean };
}

interface ClauseAnalysis {
  clauseType: string;
  clauseTitle: string;
  riskLevel: RiskLevel;
  currentLanguage: string;
  playbookPosition?: string;
  deviation: string;
  businessImpact: string;
  redlineSuggestion?: {
    originalText: string;
    suggestedText: string;
    rationale: string;
    priority: string;
    fallbackPosition?: string;
  };
  charStart?: number;
  charEnd?: number;
}

interface NegotiationStrategy {
  overallApproach: string;
  tier1MustHaves: string[];
  tier2ShouldHaves: string[];
  tier3Concessions: string[];
  timelineConsiderations?: string;
}

/** NDA triage response from the Vaquill backend */
interface NDATriageResponse {
  classification: RiskLevel;
  classificationLabel: 'Standard Approval' | 'Counsel Review' | 'Significant Issues';
  parties: string[];
  ndaType: 'mutual' | 'unilateral-disclosing' | 'unilateral-receiving';
  term: string;
  governingLaw: string;
  reviewBasis: 'playbook' | 'defaults';
  screeningResults: { criterion: string; status: 'pass' | 'flag' | 'fail'; notes: string }[];
  issuesFound: {
    severity: RiskLevel;
    title: string;
    description: string;
    risk: string;
    suggestedFix: string;
    charStart?: number;
    charEnd?: number;
  }[];
  recommendation: string;
  nextSteps: string[];
}

/** Risk assessment response from the Vaquill backend */
interface RiskAssessmentResponse {
  date: string;
  matter: string;
  category: string;
  riskDescription: string;
  backgroundContext: string;
  severityAssessment: { level: number; label: string; rationale: string };
  likelihoodAssessment: { level: number; label: string; rationale: string };
  riskScore: number;
  riskLevel: RiskLevel;
  contributingFactors: string[];
  mitigatingFactors: string[];
  mitigationOptions: { option: string; effectiveness: string; costEffort: string; recommended: boolean }[];
  recommendedApproach: string;
  residualRisk: string;
  monitoringPlan: string;
  nextSteps: { action: string; owner: string; deadline: string }[];
  escalationRequired: boolean;
  escalationPath?: string;
}

/** Compliance review response from the Vaquill backend */
interface ComplianceReviewResponse {
  reviewType: string;
  applicableRegulations: string[];
  overallStatus: RiskLevel;
  checklistResults: {
    category: string;
    requirement: string;
    status: 'compliant' | 'partial' | 'non-compliant' | 'not-applicable';
    notes: string;
    reference?: string;
  }[];
  issues: {
    severity: RiskLevel;
    requirement: string;
    currentState: string;
    expectedState: string;
    remediation: string;
    deadline?: string;
  }[];
  recommendations: string[];
  nextSteps: string[];
}

/** Change types for version comparison */
type ChangeType = 'added' | 'removed' | 'modified' | 'moved';
type ChangeSignificance = 'critical' | 'high' | 'medium' | 'low' | 'cosmetic';

/** Version comparison response from the Vaquill backend */
interface CompareVersionsResponse {
  stats: {
    totalChanges: number;
    criticalChanges: number;
    highChanges: number;
    mediumChanges: number;
    lowChanges: number;
    cosmeticChanges: number;
    addedClauses: number;
    removedClauses: number;
    modifiedClauses: number;
  };
  changes: {
    id: string;
    changeType: ChangeType;
    significance: ChangeSignificance;
    clauseType?: string;
    originalText: string;
    newText: string;
    charStart: number;
    charEnd: number;
    legalAnalysis: string;
    businessImpact: string;
    recommendation: 'accept' | 'reject' | 'negotiate';
    negotiationNotes?: string;
  }[];
  summary: string;
  overallRisk: RiskLevel;
  recommendations: string[];
  nextSteps: string[];
}

// ============================================
// Menu and UI Setup
// ============================================

/**
 * Creates the add-on menu when the document is opened.
 */
function onOpen(): void {
  const ui = DocumentApp.getUi();
  ui.createAddonMenu()
    .addItem('Open Vaquill', 'showSidebar')
    .addSeparator()
    .addItem('Quick Review', 'runQuickReview')
    .addToUi();
}

/**
 * Called when the add-on is installed.
 */
function onInstall(): void {
  onOpen();
}

/**
 * Shows the main sidebar.
 * Loads the Svelte-built sidebar.html from the deployed files.
 */
function showSidebar(): void {
  const html = HtmlService.createHtmlOutputFromFile('sidebar')
    .setTitle('Vaquill')
    .setWidth(350)
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  DocumentApp.getUi().showSidebar(html);
}

// ============================================
// Document Operations
// ============================================

interface ParagraphInfo {
  index: number;
  text: string;
  charStart: number;
  charEnd: number;
  clauseType?: string;
}

interface DocumentContent {
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

/**
 * Gets the full content of the active document.
 */
// ============================================
// Document size limits (characters sent to the backend)
// ============================================

/** Contract review, NDA triage, and compliance send at most this many chars. */
const REVIEW_DOC_CHAR_LIMIT = 200000;
/** Draft and explain-clause context cap. */
const DRAFT_DOC_CHAR_LIMIT = 190000;
/** Chat context cap. Lower than review to leave room for retrieval + history. */
const CHAT_DOC_CHAR_LIMIT = 80000;
/** Contract review chunking: how many REVIEW_DOC_CHAR_LIMIT chunks to cover at
 *  most (3 chunks ~ 200 pages), and the overlap between chunks so a clause on a
 *  boundary is not split. Keep in sync with document-scope.ts reviewFull. */
const MAX_REVIEW_CHUNKS = 3;
const REVIEW_CHUNK_OVERLAP = 2000;

/**
 * djb2 string hash as an unsigned 32-bit decimal string. Kept byte-for-byte
 * identical to hashText in src/sidebar/utils/document-scope.ts so the sidebar
 * can compare a locally computed hash against getDocumentFingerprint.
 */
function djb2Hash(text: string): string {
  let h = 5381;
  for (let i = 0; i < text.length; i++) {
    h = ((h << 5) + h + text.charCodeAt(i)) | 0;
  }
  return String(h >>> 0);
}

/**
 * Cheap fingerprint of the current document body, used by the sidebar to detect
 * edits made since a review ran. Reads the body text and returns only its
 * length and hash, so polling stays light on the wire.
 */
function getDocumentFingerprint(): { length: number; hash: string } {
  const text = DocumentApp.getActiveDocument().getBody().getText();
  return { length: text.length, hash: djb2Hash(text) };
}

/**
 * Builds the chat context. For a large document with a selection, the selected
 * passage is guaranteed into the window first, then the start of the document
 * fills the remainder, so questions about a late clause are not lost to the cap.
 */
function buildChatContext(fullText: string, focusText: string): string {
  const cap = CHAT_DOC_CHAR_LIMIT;
  const full = fullText || '';
  const focus = (focusText || '').trim();
  if (focus && full.length > cap) {
    const header = 'Selected passage the question is about:\n';
    const bodyHeader = '\n\n---\nDocument (from the start):\n';
    const focusSlice = focus.substring(0, Math.floor(cap * 0.4));
    const remaining = cap - focusSlice.length - header.length - bodyHeader.length;
    const headSlice = full.substring(0, Math.max(0, remaining));
    return header + focusSlice + bodyHeader + headSlice;
  }
  return full.substring(0, cap);
}

function getDocumentContent(): DocumentContent {
  const doc = DocumentApp.getActiveDocument();
  const body = doc.getBody();
  const text = body.getText();

  const paragraphs = extractParagraphs(body);

  return {
    documentId: doc.getId(),
    title: doc.getName(),
    text: text,
    paragraphs: paragraphs,
    wordCount: countWords(text),
    characterCount: text.length,
    extras: joinNonEmpty([collectDocumentExtras(doc), collectOtherTabsText(doc)], '\n\n'),
    tabCount: getDocumentTabCount(doc),
    canEdit: getDocumentCanEdit(doc)
  };
}

/** Joins the non-empty strings with the separator. */
function joinNonEmpty(parts: string[], sep: string): string {
  const kept: string[] = [];
  for (let i = 0; i < parts.length; i++) {
    if (parts[i] && parts[i].trim()) kept.push(parts[i]);
  }
  return kept.join(sep);
}

/**
 * Collects the text of every document tab EXCEPT the active one (whose body is
 * already `text`), recursing into child tabs. This lets review and chat analyze
 * a multi-tab contract in full. Navigation and redlining still target the active
 * tab, so the sidebar warns when more than one tab is present.
 */
function collectOtherTabsText(doc: GoogleAppsScript.Document.Document): string {
  try {
    const anyDoc = doc as any;
    if (typeof anyDoc.getTabs !== 'function') return '';
    const active = typeof anyDoc.getActiveTab === 'function' ? anyDoc.getActiveTab() : null;
    const activeId = active && active.getId ? active.getId() : '';
    // Without a known active tab we cannot exclude it, so skip rather than risk
    // duplicating the active tab's body (already in `text`).
    if (!activeId) return '';
    const parts: string[] = [];
    const walk = (tabs: any[]) => {
      if (!tabs) return;
      for (let i = 0; i < tabs.length; i++) {
        const tab = tabs[i];
        try {
          const id = tab.getId ? tab.getId() : '';
          if (id !== activeId) {
            const docTab = tab.asDocumentTab ? tab.asDocumentTab() : null;
            const tabBody = docTab && docTab.getBody ? docTab.getBody() : null;
            const t = tabBody ? tabBody.getText() : '';
            if (t && t.trim()) {
              const name = tab.getTitle ? tab.getTitle() : 'Tab';
              parts.push('Tab: ' + name + '\n' + t.trim());
            }
          }
          const children = tab.getChildTabs ? tab.getChildTabs() : [];
          if (children && children.length) walk(children);
        } catch (e) {
          // skip an unreadable tab
        }
      }
    };
    walk(anyDoc.getTabs());
    return parts.join('\n\n');
  } catch (e) {
    return '';
  }
}

/**
 * Collects footnotes, header, and footer text. body.getText() excludes these,
 * yet governing law, notices, and definitions often live there. The result is
 * appended to the analysis text sent to the backend, never used for offsets.
 */
function collectDocumentExtras(doc: GoogleAppsScript.Document.Document): string {
  const parts: string[] = [];
  try {
    const header = doc.getHeader();
    const t = header ? header.getText() : '';
    if (t && t.trim()) parts.push('Header:\n' + t.trim());
  } catch (e) {
    // header may not exist
  }
  try {
    const footer = doc.getFooter();
    const t = footer ? footer.getText() : '';
    if (t && t.trim()) parts.push('Footer:\n' + t.trim());
  } catch (e) {
    // footer may not exist
  }
  try {
    const footnotes = doc.getFootnotes();
    if (footnotes && footnotes.length) {
      const fnTexts: string[] = [];
      for (let i = 0; i < footnotes.length; i++) {
        try {
          const contents = footnotes[i].getFootnoteContents();
          const t = contents ? contents.getText() : '';
          if (t && t.trim()) fnTexts.push('[' + (i + 1) + '] ' + t.trim());
        } catch (e) {
          // skip an unreadable footnote
        }
      }
      if (fnTexts.length) parts.push('Footnotes:\n' + fnTexts.join('\n'));
    }
  } catch (e) {
    // footnotes unsupported
  }
  return parts.length ? parts.join('\n\n') : '';
}

/** Number of top-level document tabs. 1 for a normal single-tab document. */
function getDocumentTabCount(doc: GoogleAppsScript.Document.Document): number {
  try {
    const anyDoc = doc as any;
    if (typeof anyDoc.getTabs === 'function') {
      const tabs = anyDoc.getTabs();
      return tabs && tabs.length ? tabs.length : 1;
    }
  } catch (e) {
    // Tabs API not available in this runtime
  }
  return 1;
}

/**
 * Whether the current user can edit the document, via Drive capabilities.
 * Fails open (returns true) so an editor is never wrongly blocked if the Drive
 * metadata call is unavailable.
 */
function getDocumentCanEdit(doc: GoogleAppsScript.Document.Document): boolean {
  try {
    const drive = (globalThis as any).Drive;
    if (drive && drive.Files && drive.Files.get) {
      const meta = drive.Files.get(doc.getId(), { fields: 'capabilities/canEdit' });
      if (meta && meta.capabilities && typeof meta.capabilities.canEdit === 'boolean') {
        return meta.capabilities.canEdit;
      }
    }
  } catch (e) {
    // fall through to fail-open
  }
  return true;
}

/** Analysis text sent to the backend: body plus footnotes/header/footer. */
function buildAnalysisText(doc: DocumentContent): string {
  return doc.extras ? doc.text + '\n\n' + doc.extras : doc.text;
}

/**
 * Extracts paragraphs with their character offsets.
 */
function extractParagraphs(body: GoogleAppsScript.Document.Body): ParagraphInfo[] {
  const paragraphs: ParagraphInfo[] = [];
  const numChildren = body.getNumChildren();
  let charOffset = 0;

  for (let i = 0; i < numChildren; i++) {
    const child = body.getChild(i);
    if (child.getType() === DocumentApp.ElementType.PARAGRAPH) {
      const para = child.asParagraph();
      const text = para.getText();

      if (text.trim().length > 0) {
        paragraphs.push({
          index: paragraphs.length,
          text: text,
          charStart: charOffset,
          charEnd: charOffset + text.length
        });
      }

      charOffset += text.length + 1; // +1 for newline
    } else if (child.getType() === DocumentApp.ElementType.LIST_ITEM) {
      const listItem = child.asListItem();
      const text = listItem.getText();

      if (text.trim().length > 0) {
        paragraphs.push({
          index: paragraphs.length,
          text: text,
          charStart: charOffset,
          charEnd: charOffset + text.length
        });
      }

      charOffset += text.length + 1;
    } else if (child.getType() === DocumentApp.ElementType.TABLE) {
      // Index each cell so clauses inside tables (pricing, SLAs, payment terms)
      // are navigable and redline-able, not invisible.
      const table = child.asTable();
      const tableText = table.getText();
      extractTableParagraphs(table, charOffset, paragraphs);
      charOffset += tableText.length + 1;
    }
  }

  return paragraphs;
}

/**
 * Adds each non-empty table cell as a paragraph entry, with offsets relative to
 * the start of the table's text in the flat body text. Table.getText() joins
 * cell text with newlines in row-major order, which this mirrors.
 */
function extractTableParagraphs(
  table: GoogleAppsScript.Document.Table,
  tableStart: number,
  paragraphs: ParagraphInfo[]
): void {
  let offset = tableStart;
  const numRows = table.getNumRows();
  for (let r = 0; r < numRows; r++) {
    const row = table.getRow(r);
    const numCells = row.getNumCells();
    for (let c = 0; c < numCells; c++) {
      const cellText = row.getCell(c).getText();
      if (cellText.trim().length > 0) {
        paragraphs.push({
          index: paragraphs.length,
          text: cellText,
          charStart: offset,
          charEnd: offset + cellText.length
        });
      }
      offset += cellText.length + 1; // +1 for the newline join between cells
    }
  }
}

/**
 * Counts words in text.
 */
function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(word => word.length > 0).length;
}

/**
 * Navigates to a specific character offset in the document.
 */
function navigateToOffset(charOffset: number): void {
  const doc = DocumentApp.getActiveDocument();
  const body = doc.getBody();

  try {
    // Find the element at the character offset
    const position = findPositionAtOffset(body, charOffset);
    if (position) {
      doc.setCursor(position);
    }
  } catch (error) {
    console.error('Navigation error:', error);
    throw new Error('Failed to navigate to position');
  }
}

/**
 * Finds the document position at a given character offset.
 */
function findPositionAtOffset(
  body: GoogleAppsScript.Document.Body,
  targetOffset: number
): GoogleAppsScript.Document.Position | null {
  const numChildren = body.getNumChildren();
  let currentOffset = 0;

  for (let i = 0; i < numChildren; i++) {
    const child = body.getChild(i);
    let elementText = '';

    if (child.getType() === DocumentApp.ElementType.TABLE) {
      // Tables need cell-level resolution; a raw offset into the table element
      // is not a valid text position.
      const table = child.asTable();
      elementText = table.getText();
      const tableEnd = currentOffset + elementText.length;
      if (targetOffset >= currentOffset && targetOffset <= tableEnd) {
        const inTable = findPositionInTable(table, targetOffset - currentOffset);
        if (inTable) return inTable;
      }
      currentOffset = tableEnd + 1;
      continue;
    }

    if (child.getType() === DocumentApp.ElementType.PARAGRAPH) {
      elementText = child.asParagraph().getText();
    } else if (child.getType() === DocumentApp.ElementType.LIST_ITEM) {
      elementText = child.asListItem().getText();
    }

    const elementEnd = currentOffset + elementText.length;

    if (targetOffset >= currentOffset && targetOffset <= elementEnd) {
      const offsetInElement = targetOffset - currentOffset;
      return DocumentApp.getActiveDocument().newPosition(child, offsetInElement);
    }

    currentOffset = elementEnd + 1; // +1 for newline
  }

  return null;
}

/**
 * Resolves a character offset within a table to a cursor position at the start
 * of the containing cell (close enough to jump the user to the clause).
 */
function findPositionInTable(
  table: GoogleAppsScript.Document.Table,
  localOffset: number
): GoogleAppsScript.Document.Position | null {
  let offset = 0;
  const numRows = table.getNumRows();
  for (let r = 0; r < numRows; r++) {
    const row = table.getRow(r);
    const numCells = row.getNumCells();
    for (let c = 0; c < numCells; c++) {
      const cell = row.getCell(c);
      const cellEnd = offset + cell.getText().length;
      if (localOffset >= offset && localOffset <= cellEnd) {
        return DocumentApp.getActiveDocument().newPosition(cell, 0);
      }
      offset += cell.getText().length + 1;
    }
  }
  return null;
}

/**
 * Returns the text the user currently has selected in the document, or an empty
 * string when there is no selection. Powers selection-scoped sidebar features.
 */
function getSelectedText(): string {
  const selection = DocumentApp.getActiveDocument().getSelection();
  if (!selection) {
    return '';
  }

  const parts: string[] = [];
  const elements = selection.getRangeElements();
  for (let i = 0; i < elements.length; i++) {
    const rangeElement = elements[i];
    const element = rangeElement.getElement();

    let text = '';
    try {
      text = element.asText().getText();
    } catch (e) {
      // Non-text element (image, table container, etc.) - skip it.
      continue;
    }

    if (rangeElement.isPartial()) {
      parts.push(text.substring(rangeElement.getStartOffset(), rangeElement.getEndOffsetInclusive() + 1));
    } else {
      parts.push(text);
    }
  }

  return parts.join('\n').trim();
}

// ============================================
// User Information
// ============================================

/**
 * Gets the current user's email.
 */
function getUserEmail(): string {
  return Session.getActiveUser().getEmail();
}

// ============================================
// Playbook Configuration Storage
// ============================================

const PLAYBOOK_KEY = 'vaquill_playbook_config';

/**
 * Gets the user's playbook configuration from user properties.
 */
function getPlaybookConfig(): PlaybookConfig | null {
  try {
    const props = PropertiesService.getUserProperties();
    const configStr = props.getProperty(PLAYBOOK_KEY);
    if (configStr) {
      return JSON.parse(configStr) as PlaybookConfig;
    }
    return null;
  } catch (error) {
    console.error('Error loading playbook config:', error);
    return null;
  }
}

/**
 * Saves the user's playbook configuration to user properties.
 */
function savePlaybookConfig(config: PlaybookConfig): void {
  try {
    const props = PropertiesService.getUserProperties();
    props.setProperty(PLAYBOOK_KEY, JSON.stringify(config));
  } catch (error) {
    console.error('Error saving playbook config:', error);
    throw new Error('Failed to save playbook configuration');
  }
}

/**
 * Deletes the user's playbook configuration.
 */
function deletePlaybookConfig(): void {
  try {
    const props = PropertiesService.getUserProperties();
    props.deleteProperty(PLAYBOOK_KEY);
  } catch (error) {
    console.error('Error deleting playbook config:', error);
    throw new Error('Failed to delete playbook configuration');
  }
}

// ============================================
// Legal Workflow Functions (Wrappers)
// ============================================

/** Request type for contract review */
interface ContractReviewRequest {
  contractType?: string;
  userSide: string;
  focusAreas?: string[];
  usePlaybook?: boolean;
  playbookId?: string;
  posture?: string;
}

// Map the plugin's free-form contract type to a backend ContractType enum value.
function toBackendContractType(raw?: string): string {
  const known: Record<string, boolean> = {
    saas: true, msa: true, sow: true, consulting: true, license: true, sale: true,
    partnership: true, procurement: true, supply: true, lease: true, loan: true,
    eula: true, nda: true, dpa: true, baa: true, employment: true, order_form: true,
    professional_services: true, ip_assignment: true, terms_of_service: true,
    vendor_agreement: true, reseller_distribution: true
  };
  if (!raw) return 'msa';
  const key = raw.toLowerCase().replace(/[\s-]+/g, '_').replace(/[^a-z_]/g, '');
  if (known[key]) return key;
  if (key.indexOf('service') !== -1) return 'professional_services';
  if (key.indexOf('licen') !== -1) return 'license';
  return 'msa';
}

// The plugin userSide values align with the backend UserSide enum, except
// 'other' which has no backend equivalent.
function toBackendUserSide(raw: string): string {
  if (!raw || raw === 'other') return 'company';
  return raw;
}

// Index backend redlines by clause name for merging into findings.
function indexRedlinesByClause(redlines: Array<Record<string, unknown>>): Record<string, Record<string, unknown>> {
  const map: Record<string, Record<string, unknown>> = {};
  for (let i = 0; i < redlines.length; i++) {
    const r = redlines[i];
    const name = r && r.clauseName ? String(r.clauseName).toLowerCase() : '';
    if (name) map[name] = r;
  }
  return map;
}

// Map the backend contract-review response into the plugin's response shape so
// the existing sidebar renders it unchanged.
function mapBackendReviewToPlugin(
  data: Record<string, any>,
  request: ContractReviewRequest
): ContractReviewResponse {
  const clauses: Array<Record<string, any>> = data.clauses || [];
  const redlines: Array<Record<string, any>> = data.redlines || [];
  const redlineMap = indexRedlinesByClause(redlines);

  const keyFindings = clauses.map((c) => {
    const redline = redlineMap[String(c.clauseName || '').toLowerCase()];
    const suggestion = redline
      ? {
          originalText: redline.currentLanguage || c.currentLanguage || '',
          suggestedText: redline.proposedLanguage || '',
          rationale: redline.rationale || '',
          priority: redline.priority || 'should_have',
          fallbackPosition: redline.fallbackPosition || undefined
        }
      : undefined;
    return {
      clauseType: c.clauseType || 'miscellaneous',
      clauseTitle: c.clauseName || 'Clause',
      riskLevel: c.severity || 'yellow',
      currentLanguage: c.currentLanguage || '',
      playbookPosition: c.playbookPosition || undefined,
      deviation: c.analysis || '',
      businessImpact: c.riskDescription || '',
      redlineSuggestion: suggestion
    };
  });

  // Redlines that did not match a clause still become applyable findings.
  const matched: Record<string, boolean> = {};
  clauses.forEach((c) => {
    matched[String(c.clauseName || '').toLowerCase()] = true;
  });
  redlines.forEach((r) => {
    const name = String(r.clauseName || '').toLowerCase();
    if (name && !matched[name]) {
      keyFindings.push({
        clauseType: 'miscellaneous',
        clauseTitle: r.clauseName || 'Suggested change',
        riskLevel: 'yellow',
        currentLanguage: r.currentLanguage || '',
        playbookPosition: undefined,
        deviation: '',
        businessImpact: '',
        redlineSuggestion: {
          originalText: r.currentLanguage || '',
          suggestedText: r.proposedLanguage || '',
          rationale: r.rationale || '',
          priority: r.priority || 'should_have',
          fallbackPosition: r.fallbackPosition || undefined
        }
      });
    }
  });

  const priorities: Array<Record<string, any>> = data.negotiationPriorities || [];
  const tierItems = (tier: number): string[] => {
    for (let i = 0; i < priorities.length; i++) {
      if (priorities[i].tier === tier) return priorities[i].items || [];
    }
    return [];
  };

  const nextSteps: string[] = (data.missingClauses || []).map(
    (m: string) => 'Consider adding a ' + m + ' clause'
  );

  return {
    documentInfo: {
      title: 'Contract',
      parties: [],
      userSide: data.userSide || request.userSide,
      contractType: data.contractType || request.contractType || 'Unknown',
      reviewBasis: 'playbook'
    },
    keyFindings: keyFindings,
    clauseAnalysis: [],
    negotiationStrategy: {
      overallApproach: data.businessImpactSummary || data.summary || '',
      tier1MustHaves: tierItems(1),
      tier2ShouldHaves: tierItems(2),
      tier3Concessions: tierItems(3)
    },
    nextSteps: nextSteps,
    overallRisk: data.overallRisk || 'yellow'
  } as ContractReviewResponse;
}

// One backend contract-review call over a single chunk of document text.
function reviewOneChunk(chunkText: string, request: ContractReviewRequest): ContractReviewResponse {
  const g = globalThis as unknown as Record<string, Function>;
  const postureGuidance: Record<string, string> = {
    conservative:
      'Take a conservative negotiation posture: minimal, market-standard edits likely to be accepted.',
    balanced:
      'Take a balanced negotiation posture: protect what matters while keeping the deal moving.',
    aggressive:
      "Take an aggressive negotiation posture: push hard for the strongest defensible positions in the user's favor."
  };
  const posture = request.posture || 'balanced';
  const body: Record<string, any> = {
    documentText: chunkText,
    contractType: toBackendContractType(request.contractType),
    userSide: toBackendUserSide(request.userSide),
    jurisdiction: 'US',
    focusAreas: request.focusAreas || null,
    reviewInstructions: postureGuidance[posture] || postureGuidance.balanced
  };
  if (request.playbookId) {
    body.playbookId = request.playbookId;
  }
  const data = g.callBackend('/api/v1/legal-tools/contract-review', 'post', body) as Record<string, any>;
  return mapBackendReviewToPlugin(data, request);
}

// Split text into up to maxChunks overlapping chunks, breaking at newline
// boundaries so a clause is not split mid-sentence. Returns the chunks and how
// far into the text they reached (to detect when the cap left some uncovered).
function splitReviewChunks(
  text: string,
  size: number,
  overlap: number,
  maxChunks: number
): { chunks: string[]; covered: number } {
  const chunks: string[] = [];
  let pos = 0;
  while (pos < text.length && chunks.length < maxChunks) {
    let end = Math.min(text.length, pos + size);
    if (end < text.length) {
      const nl = text.lastIndexOf('\n', end);
      if (nl > pos + size - 4000 && nl > pos) end = nl;
    }
    chunks.push(text.substring(pos, end));
    if (end >= text.length) {
      pos = end;
      break;
    }
    pos = end - overlap;
    if (pos < 0) pos = 0;
  }
  return { chunks: chunks, covered: pos };
}

function riskRank(r: string): number {
  if (r === 'red') return 2;
  if (r === 'yellow') return 1;
  return 0;
}
function maxRisk(a: string, b: string): string {
  return riskRank(b) > riskRank(a) ? b : a;
}
function pushUnique(target: string[], source: string[] | undefined, seen: Record<string, boolean>): void {
  if (!source) return;
  for (let i = 0; i < source.length; i++) {
    const key = String(source[i]).toLowerCase().trim();
    if (key && !seen[key]) {
      seen[key] = true;
      target.push(source[i]);
    }
  }
}

// Merge several chunk reviews into one response: dedupe findings by clause title
// and language, take the highest overall risk, and union the strategy tiers and
// next steps.
function mergeChunkReviews(results: ContractReviewResponse[], partial: boolean): ContractReviewResponse {
  const findSeen: Record<string, boolean> = {};
  const keyFindings: any[] = [];
  const tier1: string[] = [];
  const tier2: string[] = [];
  const tier3: string[] = [];
  const t1s: Record<string, boolean> = {};
  const t2s: Record<string, boolean> = {};
  const t3s: Record<string, boolean> = {};
  const nextSteps: string[] = [];
  const nsSeen: Record<string, boolean> = {};
  let risk = 'green';
  let approach = '';
  let documentInfo: any = null;

  for (let i = 0; i < results.length; i++) {
    const res = results[i];
    if (!documentInfo) documentInfo = res.documentInfo;
    if (!approach && res.negotiationStrategy && res.negotiationStrategy.overallApproach) {
      approach = res.negotiationStrategy.overallApproach;
    }
    risk = maxRisk(risk, res.overallRisk);
    const findings = res.keyFindings || [];
    for (let j = 0; j < findings.length; j++) {
      const f = findings[j];
      const key =
        String(f.clauseTitle || '').toLowerCase() +
        '|' +
        String(f.currentLanguage || '').substring(0, 80).toLowerCase();
      if (findSeen[key]) continue;
      findSeen[key] = true;
      keyFindings.push(f);
    }
    const strat = res.negotiationStrategy || ({} as any);
    pushUnique(tier1, strat.tier1MustHaves, t1s);
    pushUnique(tier2, strat.tier2ShouldHaves, t2s);
    pushUnique(tier3, strat.tier3Concessions, t3s);
    pushUnique(nextSteps, res.nextSteps, nsSeen);
  }

  return {
    documentInfo:
      documentInfo || { title: 'Contract', parties: [], userSide: '', contractType: 'Unknown', reviewBasis: 'playbook' },
    keyFindings: keyFindings,
    clauseAnalysis: [],
    negotiationStrategy: {
      overallApproach: approach,
      tier1MustHaves: tier1,
      tier2ShouldHaves: tier2,
      tier3Concessions: tier3
    },
    nextSteps: nextSteps,
    overallRisk: risk,
    reviewCoverage: { chunks: results.length, partial: partial }
  } as ContractReviewResponse;
}

// Run contract review through the authenticated Vaquill backend. A document that
// exceeds one chunk is reviewed in overlapping sections and merged, so coverage
// is not silently truncated. Findings anchor by text, so no offset bookkeeping
// is needed across chunks.
function runContractReviewViaBackend(request: ContractReviewRequest): ContractReviewResponse {
  const doc = getDocumentContent();
  const analysis = buildAnalysisText(doc);

  if (analysis.length <= REVIEW_DOC_CHAR_LIMIT) {
    return reviewOneChunk(analysis, request);
  }

  const split = splitReviewChunks(analysis, REVIEW_DOC_CHAR_LIMIT, REVIEW_CHUNK_OVERLAP, MAX_REVIEW_CHUNKS);
  const results: ContractReviewResponse[] = [];
  for (let i = 0; i < split.chunks.length; i++) {
    results.push(reviewOneChunk(split.chunks[i], request));
  }
  const partial = split.covered < analysis.length;
  return mergeChunkReviews(results, partial);
}

/**
 * Performs a comprehensive contract review through the Vaquill backend.
 * Vaquill is the only path; failures surface to the user (no local fallback).
 */
function runContractReview(request: ContractReviewRequest): ContractReviewResponse {
  return runContractReviewViaBackend(request);
}

/**
 * Performs NDA triage with 10-point screening checklist.
 */
// Map the backend NDA criterion status to the plugin's pass/flag/fail.
function mapCriterionStatus(status: string): string {
  if (status === 'pass') return 'pass';
  if (status === 'fail') return 'fail';
  return 'flag';
}

// Map the backend NDA triage response into the plugin's shape.
function mapBackendNDAToPlugin(data: Record<string, any>): NDATriageResponse {
  const classification = data.classification || 'yellow';
  const labelMap: Record<string, string> = {
    green: 'Standard Approval',
    yellow: 'Counsel Review',
    red: 'Significant Issues'
  };

  const screeningResults = (data.criteria || []).map((c: Record<string, any>) => ({
    criterion: c.criterionName || '',
    status: mapCriterionStatus(c.status),
    notes: c.findings || ''
  }));

  const issuesFound: Array<Record<string, any>> = [];
  (data.keyIssues || []).forEach((issue: string) => {
    issuesFound.push({
      severity: classification,
      title: issue,
      description: issue,
      risk: '',
      suggestedFix: ''
    });
  });
  (data.problematicProvisions || []).forEach((p: string) => {
    issuesFound.push({
      severity: 'red',
      title: 'Problematic provision',
      description: p,
      risk: 'This provision does not belong in a standard NDA.',
      suggestedFix: 'Remove or renegotiate this provision.'
    });
  });
  (data.missingCarveouts || []).forEach((m: string) => {
    issuesFound.push({
      severity: 'yellow',
      title: 'Missing carve-out',
      description: m,
      risk: 'A standard protection is absent.',
      suggestedFix: 'Add the ' + m + ' carve-out.'
    });
  });

  // The backend NDA triage does not extract a term or governing-law value, so
  // we show 'Not specified' rather than mislabeling the resolution timeline.
  const nextSteps: string[] = [];
  if (data.estimatedTimeline) {
    nextSteps.push('Estimated resolution timeline: ' + data.estimatedTimeline);
  }

  return {
    classification: classification,
    classificationLabel: labelMap[classification] || 'Counsel Review',
    parties: data.counterpartyName ? [data.counterpartyName] : [],
    ndaType: data.ndaType || 'mutual',
    term: 'Not specified',
    governingLaw: 'Not specified',
    reviewBasis: 'playbook',
    screeningResults: screeningResults,
    issuesFound: issuesFound,
    recommendation: data.routingRecommendation || data.summary || '',
    nextSteps: nextSteps
  } as NDATriageResponse;
}

function runNDATriageViaBackend(): NDATriageResponse {
  const doc = getDocumentContent();
  const g = globalThis as unknown as Record<string, Function>;
  const data = g.callBackend('/api/v1/legal-tools/nda-triage', 'post', {
    documentText: buildAnalysisText(doc).substring(0, REVIEW_DOC_CHAR_LIMIT),
    jurisdiction: 'US'
  }) as Record<string, any>;
  return mapBackendNDAToPlugin(data);
}

function runNDATriage(): NDATriageResponse {
  return runNDATriageViaBackend();
}

/** Request type for risk assessment */
interface RiskAssessmentRequest {
  matterDescription: string;
  category: string;
}

// The plugin category values align 1:1 with the backend RiskCategory enum.
function toBackendRiskCategory(raw: string): string {
  const known: Record<string, boolean> = {
    contract: true, regulatory: true, litigation: true, ip: true,
    data_privacy: true, employment: true, corporate: true, other: true
  };
  const key = (raw || 'other').toLowerCase();
  return known[key] ? key : 'other';
}

// Title-case a backend enum token (e.g. 'almost_certain' -> 'Almost Certain').
function humanizeEnumLabel(raw: string): string {
  if (!raw) return '';
  return String(raw)
    .split('_')
    .map((w) => (w ? w.charAt(0).toUpperCase() + w.slice(1) : w))
    .join(' ');
}

// The plugin traffic-light system only has green/yellow/red; the backend adds
// an ORANGE tier. Collapse orange into red (the more cautious display).
function mapRiskLevelToTrafficLight(level: string): string {
  if (level === 'orange') return 'red';
  if (level === 'green' || level === 'yellow' || level === 'red') return level;
  return 'yellow';
}

// Flatten a backend RiskFactor into the plugin's string-list representation.
function riskFactorToString(factor: Record<string, any>): string {
  const name = factor && factor.name ? String(factor.name) : '';
  const impact = factor && factor.impact ? String(factor.impact) : '';
  if (name && impact) return name + ': ' + impact;
  if (name) return name;
  return impact || (factor && factor.description ? String(factor.description) : '');
}

// Map the backend risk-assessment response into the plugin's response shape so
// the existing sidebar renders it unchanged.
function mapBackendRiskToPlugin(
  data: Record<string, any>,
  request: RiskAssessmentRequest
): RiskAssessmentResponse {
  const contributing: Array<Record<string, any>> = data.contributingFactors || [];
  const mitigating: Array<Record<string, any>> = data.mitigatingFactors || [];
  const options: Array<Record<string, any>> = data.mitigationOptions || [];

  const mitigationOptions = options.map((o) => ({
    option: o.description || '',
    effectiveness: o.effectiveness || 'medium',
    costEffort: o.effort || 'medium',
    recommended: Boolean(o.recommended)
  }));

  // Backend has no explicit next-steps list; surface the recommended
  // mitigations as action items so the report keeps a next-steps section.
  const nextSteps = mitigationOptions
    .filter((o) => o.recommended)
    .map((o) => ({ action: o.option, owner: '', deadline: '' }));

  const escalation: Record<string, any> | null = data.escalation || null;
  let escalationPath = '';
  if (escalation) {
    const to = escalation.escalateTo || '';
    const urgency = escalation.urgency ? ' (' + humanizeEnumLabel(escalation.urgency) + ')' : '';
    escalationPath = to ? to + urgency : '';
  }

  const createdAt = data.createdAt ? String(data.createdAt) : '';
  const date = createdAt ? createdAt.substring(0, 10) : new Date().toISOString().substring(0, 10);

  return {
    date: date,
    matter: request.matterDescription,
    category: request.category,
    riskDescription: data.riskDescription || data.summary || '',
    backgroundContext: '',
    severityAssessment: {
      level: typeof data.severityValue === 'number' ? data.severityValue : 3,
      label: humanizeEnumLabel(data.severity) || 'Moderate',
      rationale: data.severityRationale || ''
    },
    likelihoodAssessment: {
      level: typeof data.likelihoodValue === 'number' ? data.likelihoodValue : 3,
      label: humanizeEnumLabel(data.likelihood) || 'Possible',
      rationale: data.likelihoodRationale || ''
    },
    riskScore: typeof data.riskScore === 'number' ? data.riskScore : 9,
    riskLevel: mapRiskLevelToTrafficLight(data.riskLevel),
    contributingFactors: contributing.map(riskFactorToString).filter((s) => s),
    mitigatingFactors: mitigating.map(riskFactorToString).filter((s) => s),
    mitigationOptions: mitigationOptions,
    recommendedApproach: data.summary || '',
    residualRisk: data.residualRisk || 'Unknown',
    monitoringPlan: data.monitoringPlan || '',
    nextSteps: nextSteps,
    escalationRequired: Boolean(escalation),
    escalationPath: escalationPath || undefined
  } as RiskAssessmentResponse;
}

function runRiskAssessmentViaBackend(request: RiskAssessmentRequest): RiskAssessmentResponse {
  const doc = getDocumentContent();
  const g = globalThis as unknown as Record<string, Function>;

  // The backend risk tool assesses a single "matter" text. Lead with the
  // user's matter description, then attach the document as supporting context
  // so the 50-char minimum is comfortably met.
  const matter = request.matterDescription || '';
  const docText = doc.text || '';
  let documentText = matter;
  if (docText) {
    documentText = (matter ? matter + '\n\n---\nDocument context:\n' : '') + docText.substring(0, DRAFT_DOC_CHAR_LIMIT);
  }

  const data = g.callBackend('/api/v1/legal-tools/risk-assessment', 'post', {
    documentText: documentText,
    riskCategory: toBackendRiskCategory(request.category)
  }) as Record<string, any>;
  return mapBackendRiskToPlugin(data, request);
}

/**
 * Performs risk assessment using severity x likelihood matrix.
 */
function runRiskAssessment(request: RiskAssessmentRequest): RiskAssessmentResponse {
  return runRiskAssessmentViaBackend(request);
}

/** Request type for compliance review */
interface ComplianceReviewRequest {
  reviewType: string;
  applicableRegulations?: string[];
}

/**
 * Performs compliance/DPA review against regulatory requirements.
 */
// Map backend compliance requirement status to the plugin's checklist status.
function mapComplianceStatus(status: string): string {
  if (status === 'compliant') return 'compliant';
  if (status === 'partially_compliant') return 'partial';
  if (status === 'non_compliant') return 'non-compliant';
  return 'not-applicable';
}

// Map the backend compliance overall status to the plugin's traffic light.
function mapComplianceOverall(status: string, score: number): string {
  if (status === 'compliant') return 'green';
  if (status === 'non_compliant') return 'red';
  if (typeof score === 'number') {
    if (score >= 80) return 'green';
    if (score < 50) return 'red';
  }
  return 'yellow';
}

function mapBackendComplianceToPlugin(
  data: Record<string, any>,
  request: ComplianceReviewRequest
): ComplianceReviewResponse {
  const requirements: Array<Record<string, any>> = data.requirements || [];

  const checklistResults = requirements.map((r) => ({
    category: r.regulationReference || 'Requirement',
    requirement: r.requirementName || '',
    status: mapComplianceStatus(r.status),
    notes: r.findings || '',
    reference: r.regulationReference || undefined
  }));

  const issues = requirements
    .filter((r) => r.status === 'non_compliant' || r.status === 'partially_compliant')
    .map((r) => ({
      severity: r.status === 'non_compliant' ? 'red' : 'yellow',
      requirement: r.requirementName || '',
      currentState: r.findings || '',
      expectedState: r.regulationReference || '',
      remediation: r.gapDescription || r.gap_description || '',
      deadline: undefined
    }));

  return {
    reviewType: request.reviewType,
    applicableRegulations: request.applicableRegulations || [String(data.regulationType || 'gdpr').toUpperCase()],
    overallStatus: mapComplianceOverall(data.overallStatus, data.complianceScore),
    checklistResults: checklistResults,
    issues: issues,
    recommendations: data.summary ? [data.summary] : [],
    nextSteps: (data.remediationActions || []).map((a: Record<string, any>) =>
      typeof a === 'string' ? a : a.action || a.description || ''
    )
  } as ComplianceReviewResponse;
}

function runComplianceReviewViaBackend(request: ComplianceReviewRequest): ComplianceReviewResponse {
  const doc = getDocumentContent();
  const g = globalThis as unknown as Record<string, Function>;
  const regs = request.applicableRegulations || [];
  const regulationType = (regs.length > 0 ? regs[0] : 'gdpr').toLowerCase().replace(/-/g, '_');
  const data = g.callBackend('/api/v1/legal-tools/compliance-check', 'post', {
    documentText: buildAnalysisText(doc).substring(0, REVIEW_DOC_CHAR_LIMIT),
    regulationType: regulationType,
    documentCategory: 'other'
  }) as Record<string, any>;
  return mapBackendComplianceToPlugin(data, request);
}

function runComplianceReview(request: ComplianceReviewRequest): ComplianceReviewResponse {
  return runComplianceReviewViaBackend(request);
}

// ============================================
// Report Generation - Unified System
// ============================================

type ReportType = 'contract-review' | 'nda-triage' | 'risk-assessment' | 'compliance' | 'comparison';

/** Risk level to emoji mapping */
function getRiskEmoji(level: string): string {
  return level === 'red' ? '🔴' : level === 'yellow' ? '🟡' : '🟢';
}

/** Status to emoji mapping */
function getStatusEmoji(status: string): string {
  const map: Record<string, string> = {
    pass: '✅', fail: '❌', flag: '⚠️',
    compliant: '✅', partial: '⚠️', 'non-compliant': '❌', 'not-applicable': '➖'
  };
  return map[status] || '➖';
}

/** Format array as numbered list */
function formatNumberedList(items: string[]): string {
  return items.map((item, i) => `${i + 1}. ${item}`).join('\n');
}

/** Format array as bullet list */
function formatBulletList(items: string[]): string {
  return items.map(item => `- ${item}`).join('\n');
}

/** Union type for all report results */
type ReportResult = ContractReviewResponse | NDATriageResponse | RiskAssessmentResponse | ComplianceReviewResponse | CompareVersionsResponse;

/**
 * Unified report generator - routes to appropriate formatter
 */
function generateReport(type: ReportType, result: ReportResult): string {
  switch (type) {
    case 'contract-review': return generateContractReviewReport(result as ContractReviewResponse);
    case 'nda-triage': return generateNDATriageReport(result as NDATriageResponse);
    case 'risk-assessment': return generateRiskAssessmentReport(result as RiskAssessmentResponse);
    case 'compliance': return generateComplianceReport(result as ComplianceReviewResponse);
    case 'comparison': return generateComparisonReport(result as CompareVersionsResponse);
    default: throw new Error(`Unknown report type: ${type}`);
  }
}

/**
 * Inserts a formatted report into the document at the cursor position.
 */
function insertReportInDocument(reportMarkdown: string): void {
  const body = DocumentApp.getActiveDocument().getBody();
  // Reports are appended at the end after a page break, so they land as a clean
  // separate section rather than splitting the contract mid-clause.
  body.appendPageBreak();
  insertMarkdownContent(body, reportMarkdown);
}

/** Appends text with inline **bold** spans applied, into a text element. */
function appendRichText(textEl: GoogleAppsScript.Document.Text, md: string): void {
  const parts = md.split(/(\*\*[^*]+\*\*)/);
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    if (!part) continue;
    const isBold = part.length > 4 && part.indexOf('**') === 0 && part.lastIndexOf('**') === part.length - 2;
    const value = isBold ? part.slice(2, -2) : part;
    const start = textEl.getText().length;
    textEl.appendText(value);
    if (isBold && value.length > 0) {
      textEl.setBold(start, textEl.getText().length - 1, true);
    }
  }
}

/**
 * Parses a small subset of markdown (headings, nested bullet / numbered lists,
 * inline bold) and appends formatted content to the body.
 */
function insertMarkdownContent(body: GoogleAppsScript.Document.Body, markdown: string): void {
  const lines = markdown.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.indexOf('# ') === 0) {
      body.appendParagraph(line.substring(2)).setHeading(DocumentApp.ParagraphHeading.HEADING1);
      continue;
    }
    if (line.indexOf('## ') === 0) {
      body.appendParagraph(line.substring(3)).setHeading(DocumentApp.ParagraphHeading.HEADING2);
      continue;
    }
    if (line.indexOf('### ') === 0) {
      body.appendParagraph(line.substring(4)).setHeading(DocumentApp.ParagraphHeading.HEADING3);
      continue;
    }

    const bullet = line.match(/^(\s*)[-*]\s+(.*)$/);
    const numbered = line.match(/^(\s*)\d+\.\s+(.*)$/);
    if (bullet) {
      const level = Math.min(3, Math.floor(bullet[1].length / 2));
      const item = body.appendListItem('');
      item.setGlyphType(DocumentApp.GlyphType.BULLET).setNestingLevel(level);
      appendRichText(item.editAsText(), bullet[2]);
    } else if (numbered) {
      const level = Math.min(3, Math.floor(numbered[1].length / 2));
      const item = body.appendListItem('');
      item.setGlyphType(DocumentApp.GlyphType.NUMBER).setNestingLevel(level);
      appendRichText(item.editAsText(), numbered[2]);
    } else if (line.trim() === '') {
      body.appendParagraph('');
    } else {
      appendRichText(body.appendParagraph('').editAsText(), line);
    }
  }
}

/** Contract Review Report */
function generateContractReviewReport(result: ContractReviewResponse): string {
  const info = result.documentInfo || { title: '', parties: [], userSide: '', contractType: '', reviewBasis: 'generic' as const };
  let report = `# Contract Review Report\n\n`;
  report += `## Document Information\n`;
  report += `- **Title:** ${info.title || 'Unknown'}\n`;
  report += `- **Parties:** ${info.parties?.join(', ') || 'Unknown'}\n`;
  report += `- **Contract Type:** ${info.contractType || 'Unknown'}\n`;
  report += `- **Your Side:** ${info.userSide || 'Unknown'}\n`;
  report += `- **Overall Risk:** ${getRiskEmoji(result.overallRisk)} ${(result.overallRisk || 'unknown').toUpperCase()}\n\n`;

  if (result.keyFindings?.length > 0) {
    report += `## Key Findings\n\n`;
    for (const f of result.keyFindings) {
      report += `### ${getRiskEmoji(f.riskLevel)} ${f.clauseTitle}\n`;
      report += `**Risk Level:** ${f.riskLevel?.toUpperCase()}\n\n`;
      report += `**Current Language:** "${f.currentLanguage}"\n\n`;
      report += `**Deviation:** ${f.deviation}\n\n`;
      report += `**Business Impact:** ${f.businessImpact}\n\n`;
      if (f.redlineSuggestion) {
        report += `**Suggested Change:** ${f.redlineSuggestion.suggestedText}\n`;
        report += `**Rationale:** ${f.redlineSuggestion.rationale}\n\n`;
      }
      report += `---\n\n`;
    }
  }

  if (result.negotiationStrategy) {
    const ns = result.negotiationStrategy;
    report += `## Negotiation Strategy\n\n**Approach:** ${ns.overallApproach}\n\n`;
    if (ns.tier1MustHaves?.length > 0) {
      report += `### Must-Have Items\n${formatBulletList(ns.tier1MustHaves)}\n\n`;
    }
    if (ns.tier2ShouldHaves?.length > 0) {
      report += `### Should-Have Items\n${formatBulletList(ns.tier2ShouldHaves)}\n\n`;
    }
  }

  if (result.nextSteps?.length > 0) {
    report += `## Next Steps\n${formatNumberedList(result.nextSteps)}\n`;
  }
  return report;
}

/** NDA Triage Report */
function generateNDATriageReport(result: NDATriageResponse): string {
  let report = `# NDA Triage Report\n\n`;
  report += `## Classification: ${getRiskEmoji(result.classification)} ${result.classificationLabel || result.classification?.toUpperCase()}\n\n`;
  report += `## NDA Details\n`;
  report += `- **Parties:** ${result.parties?.join(', ') || 'Unknown'}\n`;
  report += `- **Type:** ${result.ndaType || 'Unknown'}\n`;
  report += `- **Term:** ${result.term || 'Unknown'}\n`;
  report += `- **Governing Law:** ${result.governingLaw || 'Unknown'}\n\n`;

  if (result.screeningResults?.length > 0) {
    report += `## Screening Checklist\n\n| Criterion | Status | Notes |\n|-----------|--------|-------|\n`;
    for (const item of result.screeningResults) {
      report += `| ${item.criterion} | ${getStatusEmoji(item.status)} ${item.status} | ${item.notes} |\n`;
    }
    report += `\n`;
  }

  if (result.issuesFound?.length > 0) {
    report += `## Issues Found\n\n`;
    for (const issue of result.issuesFound) {
      report += `### ${getRiskEmoji(issue.severity)} ${issue.title}\n`;
      report += `${issue.description}\n\n**Risk:** ${issue.risk}\n\n**Suggested Fix:** ${issue.suggestedFix}\n\n`;
    }
  }

  report += `## Recommendation\n\n${result.recommendation || 'No recommendation provided.'}\n\n`;
  if (result.nextSteps?.length > 0) {
    report += `## Next Steps\n${formatNumberedList(result.nextSteps)}\n`;
  }
  return report;
}

/** Risk Assessment Report */
function generateRiskAssessmentReport(result: RiskAssessmentResponse): string {
  let report = `# Legal Risk Assessment\n\n`;
  report += `**Date:** ${result.date || new Date().toLocaleDateString()}\n`;
  report += `**Matter:** ${result.matter}\n`;
  report += `**Category:** ${result.category}\n\n`;
  report += `## Risk Score: ${result.riskScore}/25 ${getRiskEmoji(result.riskLevel)}\n\n`;
  report += `## Risk Description\n${result.riskDescription}\n\n`;

  if (result.backgroundContext) {
    report += `## Background Context\n${result.backgroundContext}\n\n`;
  }

  const sev = result.severityAssessment || { level: 0, label: '', rationale: '' };
  const lik = result.likelihoodAssessment || { level: 0, label: '', rationale: '' };
  report += `## Assessment\n\n`;
  report += `### Severity: ${sev.level}/5 - ${sev.label}\n${sev.rationale}\n\n`;
  report += `### Likelihood: ${lik.level}/5 - ${lik.label}\n${lik.rationale}\n\n`;

  if (result.contributingFactors?.length > 0) {
    report += `## Contributing Factors\n${formatBulletList(result.contributingFactors)}\n\n`;
  }
  if (result.mitigatingFactors?.length > 0) {
    report += `## Mitigating Factors\n${formatBulletList(result.mitigatingFactors)}\n\n`;
  }

  if (result.mitigationOptions?.length > 0) {
    report += `## Mitigation Options\n\n`;
    for (const opt of result.mitigationOptions) {
      report += `### ${opt.recommended ? '✅ ' : ''}${opt.option}\n`;
      report += `- Effectiveness: ${opt.effectiveness}\n- Cost/Effort: ${opt.costEffort}\n\n`;
    }
  }

  report += `## Recommended Approach\n${result.recommendedApproach}\n\n`;

  if (result.nextSteps?.length > 0) {
    report += `## Action Items\n\n| Action | Owner | Deadline |\n|--------|-------|----------|\n`;
    for (const step of result.nextSteps) {
      report += `| ${step.action} | ${step.owner} | ${step.deadline} |\n`;
    }
  }
  return report;
}

/** Version Comparison Report */
function generateComparisonReport(result: CompareVersionsResponse): string {
  let report = `# Version Comparison Report\n\n`;
  report += `## Summary\n${result.summary}\n\n`;
  report += `## Overall Risk: ${getRiskEmoji(result.overallRisk)} ${result.overallRisk?.toUpperCase()}\n\n`;

  // Stats section
  const s = result.stats || { totalChanges: 0, criticalChanges: 0, highChanges: 0, mediumChanges: 0, lowChanges: 0, cosmeticChanges: 0, addedClauses: 0, removedClauses: 0, modifiedClauses: 0 };
  report += `## Change Statistics\n`;
  report += `- **Total Changes:** ${s.totalChanges}\n`;
  report += `- **Critical:** 🔴 ${s.criticalChanges}\n`;
  report += `- **High:** 🟠 ${s.highChanges}\n`;
  report += `- **Medium:** 🟡 ${s.mediumChanges}\n`;
  report += `- **Low:** 🟢 ${s.lowChanges}\n`;
  report += `- **Cosmetic:** ⚪ ${s.cosmeticChanges}\n\n`;
  report += `- Added clauses: ${s.addedClauses}\n`;
  report += `- Removed clauses: ${s.removedClauses}\n`;
  report += `- Modified clauses: ${s.modifiedClauses}\n\n`;

  if (result.changes?.length > 0) {
    report += `## Detailed Changes\n\n`;

    // Group by significance
    const grouped: Record<string, typeof result.changes> = {};
    for (const change of result.changes) {
      const sig = change.significance || 'low';
      if (!grouped[sig]) grouped[sig] = [];
      grouped[sig].push(change);
    }

    const order: ChangeSignificance[] = ['critical', 'high', 'medium', 'low', 'cosmetic'];
    const sigLabels: Record<string, string> = {
      critical: '🔴 Critical Changes',
      high: '🟠 High Significance',
      medium: '🟡 Medium Significance',
      low: '🟢 Low Significance',
      cosmetic: '⚪ Cosmetic Changes'
    };

    for (const sig of order) {
      const changes = grouped[sig];
      if (!changes || changes.length === 0) continue;

      report += `### ${sigLabels[sig]}\n\n`;
      for (const change of changes) {
        const typeIcon = change.changeType === 'added' ? '➕' :
                        change.changeType === 'removed' ? '➖' :
                        change.changeType === 'moved' ? '↔️' : '✏️';
        report += `#### ${typeIcon} ${change.clauseType || 'General'} (${change.changeType})\n\n`;

        if (change.originalText) {
          report += `**Original:** "${change.originalText}"\n\n`;
        }
        if (change.newText) {
          report += `**New:** "${change.newText}"\n\n`;
        }

        report += `**Legal Analysis:** ${change.legalAnalysis}\n\n`;
        report += `**Business Impact:** ${change.businessImpact}\n\n`;

        const recIcon = change.recommendation === 'accept' ? '✅' :
                       change.recommendation === 'reject' ? '❌' : '🔄';
        report += `**Recommendation:** ${recIcon} ${change.recommendation?.toUpperCase()}\n`;

        if (change.negotiationNotes) {
          report += `**Negotiation Notes:** ${change.negotiationNotes}\n`;
        }
        report += `\n---\n\n`;
      }
    }
  }

  if (result.recommendations?.length > 0) {
    report += `## Priority Recommendations\n${formatNumberedList(result.recommendations)}\n\n`;
  }
  if (result.nextSteps?.length > 0) {
    report += `## Next Steps\n${formatNumberedList(result.nextSteps)}\n`;
  }
  return report;
}

/** Compliance Review Report */
function generateComplianceReport(result: ComplianceReviewResponse): string {
  let report = `# Compliance Review Report\n\n`;
  report += `**Review Type:** ${result.reviewType}\n`;
  report += `**Applicable Regulations:** ${result.applicableRegulations?.join(', ') || 'Not specified'}\n\n`;
  report += `## Overall Status: ${getRiskEmoji(result.overallStatus)} ${result.overallStatus?.toUpperCase()}\n\n`;

  if (result.checklistResults?.length > 0) {
    report += `## Checklist Results\n\n`;
    let currentCategory = '';
    for (const item of result.checklistResults) {
      if (item.category !== currentCategory) {
        currentCategory = item.category;
        report += `### ${currentCategory}\n\n`;
      }
      report += `- ${getStatusEmoji(item.status)} **${item.requirement}**: ${item.status}\n`;
      if (item.notes) report += `  - ${item.notes}\n`;
      if (item.reference) report += `  - Reference: ${item.reference}\n`;
    }
    report += `\n`;
  }

  if (result.issues?.length > 0) {
    report += `## Issues Identified\n\n`;
    for (const issue of result.issues) {
      report += `### ${getRiskEmoji(issue.severity)} ${issue.requirement}\n`;
      report += `**Current State:** ${issue.currentState}\n\n`;
      report += `**Expected State:** ${issue.expectedState}\n\n`;
      report += `**Remediation:** ${issue.remediation}\n\n`;
      if (issue.deadline) report += `**Deadline:** ${issue.deadline}\n\n`;
    }
  }

  if (result.recommendations?.length > 0) {
    report += `## Recommendations\n${formatBulletList(result.recommendations)}\n\n`;
  }
  if (result.nextSteps?.length > 0) {
    report += `## Next Steps\n${formatNumberedList(result.nextSteps)}\n`;
  }
  return report;
}

// ============================================
// Quick Actions (Menu Items)
// ============================================

/**
 * Runs a quick review from the menu.
 */
function runQuickReview(): void {
  showSidebar();
  // The sidebar will handle the actual review
}

/**
 * Generates a quick summary from the menu.
 */

// ============================================
// Exports for GAS
// ============================================

// Grounded authority: query the Vaquill US statutes corpus (hybrid search) for
// real citations relevant to a clause. Returns a formatted note, or '' if none.
function researchClauseAuthority(clauseText: string): string {
  const g = globalThis as unknown as Record<string, Function>;
  const query = clauseText.substring(0, 480);
  const data = g.callBackend('/api/v1/us-statutes/search', 'post', {
    query: query,
    pageSize: 3
  }) as Record<string, any>;
  const results: Array<Record<string, any>> = (data && data.results) || [];
  if (results.length === 0) return '';

  const lines: string[] = [];
  for (let i = 0; i < Math.min(results.length, 3); i++) {
    const r = results[i];
    const label = r.citation || r.citationShort || r.displayLabel || r.sectionTitle || r.actId || '';
    if (label) {
      const title = r.sectionTitle && r.sectionTitle !== label ? ' (' + r.sectionTitle + ')' : '';
      lines.push('- ' + label + title);
    }
  }
  return lines.join('\n');
}

// Inserts an unanchored comment via the Drive advanced service (v3, enabled in
// appsscript.json). This is the GA fallback for the Developer-Preview native
// comment insert.
function insertDriveComment(content: string): void {
  const docId = DocumentApp.getActiveDocument().getId();
  const drive = (globalThis as any).Drive;
  drive.Comments.create({ content: content }, docId, { fields: 'id' });
}

/**
 * Inserts supporting US legal authority for a clause as a document comment.
 * Authority comes ONLY from a grounded search of the Vaquill US statutes
 * corpus (real citations), never model recall. Tries the native comment API
 * first, then falls back to the Drive comment API. Throws on failure so the
 * sidebar can surface it. No local/model fallback and no fabricated authority.
 */
function addClauseCitation(clauseText: string): { anchored: boolean; citations: string } {
  const citations = researchClauseAuthority(clauseText);
  if (!citations) {
    throw new Error('No matching US authority found in the Vaquill corpus for this clause.');
  }

  const body = 'Vaquill authority (US statutes):\n' + citations;
  try {
    addAnchoredComment(clauseText, body);
    return { anchored: true, citations: citations };
  } catch (e) {
    // Surface the authority so it is not lost even if the comment could not be added.
    throw new Error('Found authority but could not add a comment. ' + body);
  }
}

/**
 * Adds a comment carrying an arbitrary note, anchored to the first occurrence of
 * clauseText when native comments are available, or as a document-level Drive
 * comment otherwise. Throws when neither path succeeds.
 */
function addAnchoredComment(clauseText: string, body: string): { anchored: boolean } {
  const g = globalThis as unknown as Record<string, Function>;
  try {
    g.insertNativeComment(clauseText, body);
    return { anchored: true };
  } catch (nativeError) {
    // Native comment insert is Developer-Preview-gated; fall back to Drive.
    insertDriveComment(body);
    return { anchored: true };
  }
}

// Route every chat turn through the Vaquill backend's grounded RAG chat,
// grounded in the open document. Vaquill is the only path; a personal (no-org)
// account or any backend failure surfaces as an error (no local fallback).
function runChat(request: {
  documentText: string;
  query: string;
  mode: string;
  focusText?: string;
  conversationHistory?: Array<{ role: string; content: string }>;
}): { answer: string; citations: Array<Record<string, any>> } {
  const g = globalThis as unknown as Record<string, Function>;

  const orgId = g.getOrganizationId ? String(g.getOrganizationId()) : '';

  const messages: Array<Record<string, string>> = [];
  const history = request.conversationHistory || [];
  for (let i = 0; i < history.length; i++) {
    messages.push({ role: history[i].role, content: history[i].content });
  }
  messages.push({ role: 'user', content: request.query });

  const data = g.callBackend('/api/v1/chat', 'post', {
    messages: messages,
    useRag: true,
    stream: false,
    organizationId: orgId,
    context: buildChatContext(request.documentText || '', request.focusText || '')
  }) as Record<string, any>;

  const answer = data && data.message && data.message.content ? data.message.content : '';
  const sources: Array<Record<string, any>> = (data && data.sources) || [];
  const citations = sources
    .map((s) => ({
      text: s.content || s.text || s.snippet || s.quote || '',
      charStart: 0,
      charEnd: 0
    }))
    .filter((c) => c.text);

  if (!answer) {
    throw new Error('The assistant returned no answer.');
  }
  return { answer: answer, citations: citations };
}

// Fast single-turn question answering over the document, via the grounded chat.
function runQuickAnswer(documentText: string, question: string): string {
  const result = runChat({
    documentText: documentText,
    query: question,
    mode: 'ask',
    conversationHistory: []
  });
  return result.answer;
}

// ============================================
// Playbooks (backend thin client)
// ============================================

function listPlaybooks(): Array<Record<string, any>> {
  const g = globalThis as unknown as Record<string, Function>;
  const data = g.callBackend('/api/v1/legal-tools/playbooks', 'get', null) as Record<string, any>;
  return (data && data.playbooks) || [];
}

function listPlaybookTemplates(): Array<Record<string, any>> {
  const g = globalThis as unknown as Record<string, Function>;
  const data = g.callBackend('/api/v1/legal-tools/playbooks/templates', 'get', null) as Record<string, any>;
  if (data && data.templates) return data.templates;
  return (Array.isArray(data) ? data : []) as Array<Record<string, any>>;
}

function createPlaybookFromTemplate(templateSlug: string): Record<string, any> {
  const g = globalThis as unknown as Record<string, Function>;
  return g.callBackend('/api/v1/legal-tools/playbooks/from-template', 'post', {
    templateSlug: templateSlug,
    jurisdiction: 'US'
  }) as Record<string, any>;
}

// ============================================
// Drafting (backend thin client)
// ============================================

// Rewrite a clause per an instruction. Returns {original, rewritten, changesSummary}.
function rewriteClause(clauseText: string, instruction: string): Record<string, any> {
  const g = globalThis as unknown as Record<string, Function>;
  return g.callBackend('/api/v1/drafting/clause/rewrite', 'post', {
    clause_text: clauseText,
    instruction: instruction,
    jurisdiction: 'US'
  }) as Record<string, any>;
}

// Explain a clause. Returns {explanation, keyObligations, risks, applicableActs}.
function explainClause(clauseText: string): Record<string, any> {
  const g = globalThis as unknown as Record<string, Function>;
  return g.callBackend('/api/v1/drafting/clause/explain', 'post', {
    clause_text: clauseText,
    jurisdiction: 'US'
  }) as Record<string, any>;
}

// Generate a full, template-constrained first draft. Returns {fullText, sections, ...}.
function generateDraft(category: string, title: string, specialInstructions?: string): Record<string, any> {
  const g = globalThis as unknown as Record<string, Function>;
  const body: Record<string, any> = { category: category, title: title, jurisdiction: 'US' };
  if (specialInstructions) {
    body.special_instructions = specialInstructions;
  }
  return g.callBackend('/api/v1/drafting/generate', 'post', body) as Record<string, any>;
}

// List saved + system clauses from the clause library.
function listClauses(): Array<Record<string, any>> {
  const g = globalThis as unknown as Record<string, Function>;
  const data = g.callBackend('/api/v1/drafting/clauses?limit=100', 'get', null);
  if (Array.isArray(data)) return data as Array<Record<string, any>>;
  return (data && (data as Record<string, any>).clauses) || [];
}

// List the user's saved prompt library.
function listPrompts(): Array<Record<string, any>> {
  const g = globalThis as unknown as Record<string, Function>;
  const data = g.callBackend('/api/v1/prompts', 'get', null) as Record<string, any>;
  if (data && data.prompts) return data.prompts;
  return (Array.isArray(data) ? data : []) as Array<Record<string, any>>;
}

// Insert text at the current cursor, or append to the body if there is no cursor.
function insertTextAtCursor(text: string): { inserted: boolean } {
  const doc = DocumentApp.getActiveDocument();
  const cursor = doc.getCursor();
  if (cursor) {
    cursor.insertText(text);
    return { inserted: true };
  }
  doc.getBody().appendParagraph(text);
  return { inserted: true };
}

// Replace the current selection with new text (used to accept a clause rewrite
// directly when the user does not want a tracked change).
function replaceSelection(newText: string): { replaced: boolean } {
  const doc = DocumentApp.getActiveDocument();
  const selection = doc.getSelection();
  if (!selection) {
    return { replaced: false };
  }
  const elements = selection.getRangeElements();
  // Delete selected content, then insert the replacement at the first element.
  for (let i = elements.length - 1; i >= 0; i--) {
    const rangeElement = elements[i];
    const element = rangeElement.getElement();
    let asText;
    try {
      asText = element.asText();
    } catch (e) {
      continue;
    }
    if (rangeElement.isPartial()) {
      asText.deleteText(rangeElement.getStartOffset(), rangeElement.getEndOffsetInclusive());
      if (i === 0) {
        asText.insertText(rangeElement.getStartOffset(), newText);
      }
    } else {
      const content = asText.getText();
      asText.deleteText(0, content.length - 1);
      if (i === 0) {
        asText.insertText(0, newText);
      }
    }
  }
  return { replaced: true };
}

// These functions will be called from the sidebar via google.script.run
// They are exported globally for GAS to find them

(globalThis as any).onOpen = onOpen;
(globalThis as any).onInstall = onInstall;
(globalThis as any).showSidebar = showSidebar;
(globalThis as any).getDocumentContent = getDocumentContent;
(globalThis as any).getDocumentFingerprint = getDocumentFingerprint;
(globalThis as any).navigateToOffset = navigateToOffset;
(globalThis as any).getSelectedText = getSelectedText;
(globalThis as any).getUserEmail = getUserEmail;
(globalThis as any).runQuickReview = runQuickReview;

// Playbook configuration
(globalThis as any).getPlaybookConfig = getPlaybookConfig;
(globalThis as any).savePlaybookConfig = savePlaybookConfig;
(globalThis as any).deletePlaybookConfig = deletePlaybookConfig;

// Legal workflow functions
(globalThis as any).runContractReview = runContractReview;
(globalThis as any).runNDATriage = runNDATriage;
(globalThis as any).runRiskAssessment = runRiskAssessment;
(globalThis as any).runComplianceReview = runComplianceReview;
(globalThis as any).addClauseCitation = addClauseCitation;
(globalThis as any).addAnchoredComment = addAnchoredComment;
(globalThis as any).runChat = runChat;
(globalThis as any).listPlaybooks = listPlaybooks;
(globalThis as any).listPlaybookTemplates = listPlaybookTemplates;
(globalThis as any).createPlaybookFromTemplate = createPlaybookFromTemplate;
(globalThis as any).rewriteClause = rewriteClause;
(globalThis as any).explainClause = explainClause;
(globalThis as any).generateDraft = generateDraft;
(globalThis as any).insertTextAtCursor = insertTextAtCursor;
(globalThis as any).replaceSelection = replaceSelection;
(globalThis as any).listClauses = listClauses;
(globalThis as any).listPrompts = listPrompts;
(globalThis as any).runQuickAnswer = runQuickAnswer;

// Report generation - unified API
(globalThis as any).insertReportInDocument = insertReportInDocument;
(globalThis as any).generateReport = generateReport;
// Keep individual exports for backward compatibility
(globalThis as any).generateContractReviewReport = generateContractReviewReport;
(globalThis as any).generateNDATriageReport = generateNDATriageReport;
(globalThis as any).generateRiskAssessmentReport = generateRiskAssessmentReport;
(globalThis as any).generateComplianceReport = generateComplianceReport;
