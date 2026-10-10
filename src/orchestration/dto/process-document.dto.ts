import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export enum ProcessingStatus {
  RECEIVED = 'RECEIVED',
  VALIDATING = 'VALIDATING',
  SAVED = 'SAVED',
  PREFLIGHT = 'PREFLIGHT',
  OCR_PROCESSING = 'OCR_PROCESSING',
  OCR_COMPLETED = 'OCR_COMPLETED',
  EDR_READY = 'EDR_READY',
  EVIDENCE_PROCESSING = 'EVIDENCE_PROCESSING',
  EVIDENCE_COMPLETED = 'EVIDENCE_COMPLETED',
  LLM_CONTEXT_READY = 'LLM_CONTEXT_READY',
  LLM_RESOLUTION_REQUIRED = 'LLM_RESOLUTION_REQUIRED',
  RESOLUTION_PENDING = 'RESOLUTION_PENDING',
  LLM_PROCESSING = 'LLM_PROCESSING',
  LLM_RESPONSE_INVALID = 'LLM_RESPONSE_INVALID',
  ENHANCED_EDR_READY = 'ENHANCED_EDR_READY',
  FINAL_DOCUMENT_READY = 'FINAL_DOCUMENT_READY',
  COMPLETED = 'FINAL_DOCUMENT_READY',
  PARTIAL = 'PARTIAL',
  FAILED = 'FAILED',
}

export class ProcessDocumentOptionsDto {
  @ApiPropertyOptional({
    description: 'Document classification type hint (auto, transcript, generic, resume)',
    default: 'transcript',
    example: 'transcript',
  })
  documentType?: string;

  @ApiPropertyOptional({
    description: 'Confidence threshold for routing low-confidence fields to LLM (0.0 to 1.0)',
    default: 0.95,
    example: 0.95,
  })
  llmThreshold?: number;

  @ApiPropertyOptional({
    description: 'Rendering DPI for PDF page rasterization (if OCR path is required)',
    default: 200,
    example: 200,
  })
  dpi?: number;

  @ApiPropertyOptional({
    description: 'Enable or disable automatic orientation detection in OCR preprocessing',
    default: true,
    example: true,
  })
  orientation?: boolean;

  @ApiPropertyOptional({
    description: 'Include full artifact metadata paths in the response',
    default: false,
    example: false,
  })
  includeArtifacts?: boolean;

  @ApiPropertyOptional({
    description: 'Enable extra debug logging and preserve temporary workspace artifacts',
    default: false,
    example: false,
  })
  debug?: boolean;

  @ApiPropertyOptional({
    description: 'Execute targeted LLM resolution immediately if unresolved fields exist',
    default: false,
    example: false,
  })
  runLlm?: boolean;

  @ApiPropertyOptional({
    description: 'Force OCR pipeline for all pages, bypassing native text layer extraction',
    default: false,
    example: false,
  })
  forceOcr?: boolean;

  @ApiPropertyOptional({
    description: 'Force native text layer extraction for all pages',
    default: false,
    example: false,
  })
  forceNativeText?: boolean;
}

export class PipelineStageResultDto {
  @ApiProperty({ example: 'DOCUMENT_PREFLIGHT' })
  stage!: string;

  @ApiProperty({ example: 'COMPLETED', enum: ['PENDING', 'RUNNING', 'COMPLETED', 'SKIPPED', 'FAILED'] })
  status!: string;

  @ApiPropertyOptional({ example: 'NO_UNRESOLVED_FIELDS' })
  reason?: string;

  @ApiProperty({ example: 4.5 })
  execution_time_ms!: number;
}

export class DocumentAnalysisDto {
  @ApiProperty({ example: 2 })
  page_count!: number;

  @ApiProperty({ example: 'DIGITAL_TEXT' })
  document_type!: string;

  @ApiProperty({ example: 2 })
  native_text_pages!: number;

  @ApiProperty({ example: 0 })
  ocr_pages!: number;

  @ApiProperty({ example: 'ADAPTIVE' })
  strategy!: string;
}

export class LlmTaskSummaryDto {
  @ApiProperty({ example: true })
  required!: boolean;

  @ApiProperty({ example: false })
  called!: boolean;

  @ApiProperty({ example: 2 })
  task_count!: number;

  @ApiPropertyOptional({ example: 'NO_UNRESOLVED_FIELDS' })
  reason?: string;

  @ApiProperty({ example: 184 })
  estimated_tokens!: number;

  @ApiPropertyOptional({ example: 2 })
  patches_received?: number;

  @ApiPropertyOptional({ example: 2 })
  patches_accepted?: number;

  @ApiPropertyOptional({ example: 0 })
  patches_rejected?: number;

  @ApiPropertyOptional({
    description: 'Array of LLM resolution results if runLlm=true was executed',
    type: 'array',
    items: { type: 'object' },
  })
  results?: Array<Record<string, unknown>>;

  @ApiPropertyOptional({
    description: 'Active resolution strategy (NONE, TEXT_LLM, TEXT_LLM_EXPANDED, VLM, MULTIMODAL)',
    example: 'TEXT_LLM',
  })
  strategy?: string;

  @ApiPropertyOptional({
    description: 'Auditable attempt log for all AI resolution attempts',
    type: 'array',
    items: { type: 'object' },
  })
  attempts?: Array<{
    task_id: string;
    attempt: number;
    strategy: string;
    context_level: string;
    status: string;
  }>;
}

export class DocumentProcessingResponseDto {
  @ApiProperty({ example: true })
  success!: boolean;

  @ApiProperty({
    example: {
      document_id: 'doc_1787425005063_fc7053',
      filename: 'transcript.pdf',
      document_type: 'transcript',
      mime_type: 'application/pdf',
      file_size_bytes: 3199,
    },
  })
  document!: {
    document_id: string;
    filename: string;
    document_type: string;
    mime_type: string;
    file_size_bytes: number;
  };

  @ApiProperty({
    example: {
      status: 'FINAL_DOCUMENT_READY',
      stages: [
        { stage: 'PREFLIGHT', status: 'COMPLETED', execution_time_ms: 3.0 },
        { stage: 'OCR_ENGINE', status: 'COMPLETED', execution_time_ms: 5.3 },
        { stage: 'EVIDENCE_ENGINE', status: 'COMPLETED', execution_time_ms: 22.1 },
        { stage: 'FINALIZATION', status: 'COMPLETED', execution_time_ms: 1.2 },
      ],
    },
  })
  pipeline!: {
    status: ProcessingStatus;
    stages: PipelineStageResultDto[];
  };

  @ApiProperty({ type: DocumentAnalysisDto })
  document_analysis!: DocumentAnalysisDto;

  @ApiProperty({
    example: {
      available: true,
      schema_version: 'edr-0.2',
    },
  })
  edr!: {
    available: boolean;
    schema_version: string;
  };

  @ApiProperty({
    example: {
      available: true,
      zero_loss_verified: true,
      unaccounted_loss: 0,
      average_confidence: 0.96,
      corrections_applied: 1,
      execution_time_ms: 22.1,
    },
  })
  evidence!: {
    available: boolean;
    zero_loss_verified: boolean;
    unaccounted_loss: number;
    average_confidence: number;
    corrections_applied: number;
    execution_time_ms: number;
  };

  @ApiProperty({ type: LlmTaskSummaryDto })
  llm!: LlmTaskSummaryDto;

  @ApiProperty({
    description: 'Targeted LLM Context JSON payload generated by Evidence Engine (unresolved tasks only)',
    example: {
      schema_version: 'edmo-llm-context-0.1',
      document: {
        id: 'doc_1787425005063_fc7053',
        page_count: 2,
        type: 'transcript',
      },
      llm_required: true,
      tasks: [
        {
          task_id: 'resolve_1',
          field: 'course_title',
          ocr_value: 'MATHEMAT1CS FOR C0MPUTING',
          confidence: 0.82,
          nearby_evidence: ['CS-103', 'Credits: 4.0'],
        },
      ],
    },
  })
  llm_context!: Record<string, unknown>;

  @ApiPropertyOptional({
    description: 'Dedicated LLM Resolution Request JSON payload (schema: edmo-llm-resolution-request-0.1)',
  })
  resolution_request?: Record<string, unknown>;

  @ApiPropertyOptional({
    description: 'Output discriminator indicating response payload mode (FINAL_DOCUMENT, LLM_RESOLUTION_REQUEST, AI_UNRESOLVED_REPORT)',
    example: {
      type: 'FINAL_DOCUMENT',
      final_document_available: true,
    },
  })
  output?: {
    type: 'FINAL_DOCUMENT' | 'LLM_RESOLUTION_REQUEST' | 'AI_UNRESOLVED_REPORT';
    final_document_available: boolean;
  };

  @ApiPropertyOptional({
    description: 'Document readiness state (READY, LLM_RESOLUTION_REQUIRED, RESOLUTION_PENDING, PARTIAL, FAILED)',
    example: 'READY',
  })
  document_readiness?: string;

  @ApiPropertyOptional({
    description: 'Next required pipeline action (RUN_LLM, NONE)',
    example: 'NONE',
  })
  next_action?: string;

  @ApiPropertyOptional({
    description: 'Primary structured final document JSON result (schema: edmo-final-document-0.1)',
  })
  result?: Record<string, unknown>;

  @ApiProperty({
    example: {
      total_ms: 32.4,
      ocr_ms: 5.3,
      evidence_ms: 22.1,
      llm_ms: 0.0,
      finalization_ms: 1.0,
      overall_ms_per_page: 16.2,
      ocr_ms_per_page: 2.65,
      stages: {
        upload_ms: 2.1,
        ocr_ms: 5.3,
        evidence_ms: 22.1,
        llm_ms: 0.0,
        finalization_ms: 1.0,
      },
    },
  })
  performance!: {
    total_ms: number;
    ocr_ms?: number;
    evidence_ms?: number;
    llm_ms?: number;
    enhanced_edr_ms?: number;
    finalization_ms?: number;
    overall_ms_per_page?: number;
    ocr_ms_per_page?: number;
    stages: {
      upload_ms: number;
      ocr_ms: number;
      evidence_ms: number;
      llm_ms: number;
      finalization_ms?: number;
    };
  };

  @ApiPropertyOptional({
    description: 'Canonical Enhanced EDR JSON artifact after LLM patch merge',
  })
  enhanced_edr?: Record<string, unknown>;

  @ApiPropertyOptional({
    description: 'Application-facing Semantic Final Structured Document JSON projection',
  })
  final_document?: Record<string, unknown>;

  @ApiPropertyOptional({
    description: 'Internal candidate final document when canonical finalization is blocked',
  })
  final_document_candidate?: Record<string, unknown>;

  @ApiPropertyOptional({
    description: 'LLM Patch Validation and Merge Audit Report',
  })
  patch_report?: Record<string, unknown>;

  @ApiPropertyOptional({
    description: 'Finalization Audit and Quality Report',
  })
  finalization_report?: Record<string, unknown>;

  @ApiPropertyOptional({
    description: 'Artifact references if includeArtifacts=true was requested',
  })
  artifacts?: Array<Record<string, unknown>> | Record<string, boolean>;
}
