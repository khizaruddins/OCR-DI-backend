export type ValidationStatus = 'PASS' | 'WARN' | 'FAIL';

export type EvidenceItemStatus =
  | 'SUPPORTED'
  | 'UNSUPPORTED_BY_EVIDENCE'
  | 'MISSING_SUPPORTED_FIELD'
  | 'SOURCE_REFERENCE_INVALID';

export interface EvidenceValidationDetail {
  field: string;
  value: unknown;
  status: EvidenceItemStatus;
  evidenceRef?: unknown;
  reason?: string;
}

export interface SchemaValidationResult {
  valid: boolean;
  errors: Array<{ path: string; message: string }>;
}

export interface EvidenceValidationSummary {
  supported_values: number;
  unsupported_values: number;
  missing_supported_values: number;
  invalid_source_references: number;
  details: EvidenceValidationDetail[];
}

export interface QualityMetrics {
  field_precision: number;
  field_recall: number;
  record_precision: number;
  record_recall: number;
  source_rows_count: number;
  candidate_records_count: number;
  latency_ms?: number;
  input_tokens?: number;
  output_tokens?: number;
}

export interface ValidationReport {
  schema_version: 'edmo-validation-report-0.1';
  status: ValidationStatus;
  schema_valid: boolean;
  schema_errors: Array<{ path: string; message: string }>;
  evidence_validation: EvidenceValidationSummary;
  hallucination_flags: number;
  warnings: string[];
  quality_metrics: QualityMetrics;
}

export interface ValidatedExtractionResult<T = Record<string, unknown>> {
  candidateDocument: T;
  validatedDocument: T | null;
  validationReport: ValidationReport;
}
