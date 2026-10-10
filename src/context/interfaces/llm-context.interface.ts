export interface LlmContextDocument {
  type: string;
  page_count: number;
  pages_present?: number[];
  language?: string;
  id?: string;
}

export interface LlmContextSection {
  title?: string;
  type?: string;
  page?: number;
  fields?: Record<string, string | number | null>;
  paragraphs?: string[];
  text?: string;
}

export interface LlmContextTable {
  table_id?: string;
  type?: string;
  headers?: string[];
  rows?: Array<Array<string | number | null>>;
  page_range?: [number, number];
  page?: number;
}

export interface LlmContext {
  schema_version: string;
  document: LlmContextDocument;
  institution?: {
    name?: string;
    [key: string]: unknown;
  };
  student?: {
    student_name?: string;
    student_id?: string;
    [key: string]: unknown;
  };
  academic?: Record<string, unknown>;
  sections?: LlmContextSection[];
  tables?: LlmContextTable[];
  unclassified_content?: unknown[];
  warnings?: string[];
  estimated_tokens?: number;
  document_header?: string;
  document_footer?: string;
  [key: string]: unknown;
}

export interface LlmContextReport {
  schema_version: string;
  document_id?: string;
  document_type?: string;
  status: string;
  loss_analysis?: {
    total_source_items?: number;
    structured_items?: number;
    compacted_items?: number;
    unaccounted_loss?: number;
    noise_items?: number;
    deduplicated_items?: number;
    metadata_items?: number;
    preserved_items?: number;
    chunked_items?: number;
  };
  context_quality_score?: number;
  page_coverage?: {
    coverage_percentage?: number;
    pages_detected?: number;
    pages_represented?: number;
  };
  text_coverage?: {
    coverage_percentage?: number;
    source_meaningful_text?: number;
    represented_meaningful_text?: number;
    unrepresented_text?: {
      unaccounted?: number;
      noise?: number;
      deduplicated?: number;
      metadata?: number;
    };
  };
  table_coverage?: {
    tables_detected?: number;
    tables_represented?: number;
    row_coverage_percentage?: number;
    cell_coverage_percentage?: number;
  };
}

export interface ContextValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  documentType: string;
  pageCount: number;
  tableCount: number;
  sectionCount: number;
  unaccountedLoss: number;
  lossGatePassed: boolean;
}
