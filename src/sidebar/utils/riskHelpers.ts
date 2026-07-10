/**
 * Shared risk and status utility functions
 * Extracted from multiple panels to eliminate duplication
 */

import type { RiskLevel, Severity } from '$shared/types';
import { CheckCircle, XCircle, AlertTriangle, AlertCircle, MinusCircle, Info } from '@lucide/svelte';

// ============================================
// Risk Level Color Utilities
// ============================================

/**
 * Get the text/border color for a risk level
 */
export function getRiskColor(level: RiskLevel | string): string {
  switch (level) {
    case 'red': return 'var(--color-danger)';
    case 'yellow': return 'var(--color-warning)';
    case 'green': return 'var(--color-success)';
    default: return 'var(--color-gray-500)';
  }
}

/**
 * Get the background color for a risk level
 */
export function getRiskBg(level: RiskLevel | string): string {
  switch (level) {
    case 'red': return 'var(--color-danger-bg, #fce8e6)';
    case 'yellow': return 'var(--color-warning-bg, #fffbeb)';
    case 'green': return 'var(--color-success-bg, #f0fdf4)';
    default: return 'var(--color-gray-100)';
  }
}

/**
 * Get Tailwind CSS classes for risk level badge styling
 */
export function getRiskBadgeClasses(level: RiskLevel | string): string {
  switch (level) {
    case 'red': return 'bg-red-100 text-red-800 border-red-200';
    case 'yellow': return 'bg-yellow-100 text-yellow-800 border-yellow-200';
    case 'green': return 'bg-green-100 text-green-800 border-green-200';
    default: return 'bg-gray-100 text-gray-800 border-gray-200';
  }
}

/**
 * Get solid background color for progress bars / indicators
 */
export function getRiskSolidBg(level: RiskLevel | string): string {
  switch (level) {
    case 'red': return 'bg-red-500';
    case 'yellow': return 'bg-yellow-500';
    case 'green': return 'bg-green-500';
    default: return 'bg-gray-500';
  }
}

// ============================================
// Risk Level Icons
// ============================================

/**
 * Get the appropriate icon component for a risk level
 */
export function getRiskIcon(level: RiskLevel | string) {
  switch (level) {
    case 'red': return AlertCircle;
    case 'yellow': return AlertTriangle;
    case 'green': return CheckCircle;
    default: return AlertCircle;
  }
}

// ============================================
// Status Utilities (pass/fail/flag)
// ============================================

export type StatusType = 'pass' | 'fail' | 'flag' | 'unknown';

/**
 * Get the icon component for a status
 */
export function getStatusIcon(status: string) {
  switch (status) {
    case 'pass': return CheckCircle;
    case 'fail': return XCircle;
    case 'flag': return AlertTriangle;
    default: return AlertCircle;
  }
}

/**
 * Get the color for a status
 */
export function getStatusColor(status: string): string {
  switch (status) {
    case 'pass': return 'var(--color-success)';
    case 'fail': return 'var(--color-danger)';
    case 'flag': return 'var(--color-warning)';
    default: return 'var(--color-gray-500)';
  }
}

// ============================================
// Compliance Status Utilities
// ============================================

export type ComplianceStatus = 'compliant' | 'partial' | 'non-compliant' | 'not-applicable';

/**
 * Get Tailwind text color class for compliance status
 */
export function getComplianceStatusColor(status: ComplianceStatus | string): string {
  switch (status) {
    case 'compliant': return 'text-green-600';
    case 'partial': return 'text-yellow-600';
    case 'non-compliant': return 'text-red-600';
    case 'not-applicable': return 'text-gray-400';
    default: return 'text-gray-500';
  }
}

/**
 * Get the icon component for compliance status
 */
export function getComplianceStatusIcon(status: ComplianceStatus | string) {
  switch (status) {
    case 'compliant': return CheckCircle;
    case 'partial': return AlertTriangle;
    case 'non-compliant': return XCircle;
    case 'not-applicable': return MinusCircle;
    default: return Info;
  }
}

/**
 * Get human-readable label for compliance status
 */
export function getComplianceStatusLabel(status: ComplianceStatus | string): string {
  switch (status) {
    case 'compliant': return 'Compliant';
    case 'partial': return 'Partial';
    case 'non-compliant': return 'Non-Compliant';
    case 'not-applicable': return 'N/A';
    default: return 'Unknown';
  }
}

// ============================================
// Risk Score Utilities
// ============================================

/**
 * Get risk label based on numeric score (for severity x likelihood matrix)
 */
export function getRiskLabel(score: number): string {
  if (score >= 16) return 'Critical Risk';
  if (score >= 10) return 'High Risk';
  if (score >= 5) return 'Medium Risk';
  return 'Low Risk';
}

/**
 * Get risk level from numeric score
 */
export function getRiskLevelFromScore(score: number): RiskLevel {
  if (score >= 16) return 'red';
  if (score >= 10) return 'red';
  if (score >= 5) return 'yellow';
  return 'green';
}

// ============================================
// Severity to RiskLevel Mapping
// ============================================

/**
 * Convert text-based severity to RiskLevel for consistent display
 * low/medium -> green, high -> yellow, critical -> red
 */
export function severityToRiskLevel(severity: Severity | string): RiskLevel {
  switch (severity) {
    case 'critical': return 'red';
    case 'high': return 'yellow';
    case 'medium': return 'green';
    case 'low': return 'green';
    default: return 'green';
  }
}

/**
 * Get the color for a severity level (uses RiskLevel mapping)
 */
export function getSeverityColor(severity: Severity | string): string {
  return getRiskColor(severityToRiskLevel(severity));
}

/**
 * Get the background color for a severity level
 */
export function getSeverityBg(severity: Severity | string): string {
  return getRiskBg(severityToRiskLevel(severity));
}

/**
 * Get human-readable label for severity
 */
export function getSeverityLabel(severity: Severity | string): string {
  switch (severity) {
    case 'critical': return 'Critical';
    case 'high': return 'High';
    case 'medium': return 'Medium';
    case 'low': return 'Low';
    default: return 'Unknown';
  }
}

// ============================================
// Generic Helpers
// ============================================

/**
 * Generate a unique ID (for suggestions, findings, etc.)
 */
export function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}
