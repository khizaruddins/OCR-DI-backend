import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { LlmContextDto } from '../../context/dto/llm-context.dto';
import { LlmContext } from '../../context/interfaces/llm-context.interface';
import { ValidationReportDto } from '../../validation/dto/validation-report.dto';
import { ValidationReport } from '../../validation/interfaces/validation.interfaces';

export class ExtractRequestOptionsDto {
  @ApiPropertyOptional({
    description: 'Target LLM model override (defaults to configured model, e.g. qwen3:8b)',
    example: 'qwen3:8b',
  })
  model?: string;

  @ApiPropertyOptional({
    description: 'Prompt template version override (e.g. transcript.v1, certificate.v1)',
    example: 'transcript.v1',
  })
  prompt_version?: string;

  @ApiPropertyOptional({
    description: 'Sampling temperature (0 for deterministic extraction)',
    example: 0,
    default: 0,
  })
  temperature?: number;

  @ApiPropertyOptional({
    description: 'Nucleus sampling probability threshold',
    example: 0.9,
  })
  top_p?: number;

  @ApiPropertyOptional({
    description: 'LLM call timeout limit in milliseconds',
    example: 120000,
    default: 120000,
  })
  timeout_ms?: number;

  @ApiPropertyOptional({
    description: 'Allow extraction pipeline to continue even if unaccounted_loss > 0 in context quality check',
    example: false,
    default: false,
  })
  allow_loss_override?: boolean;

  @ApiPropertyOptional({
    description: 'Custom directory path to save output JSON audit artifacts',
    example: './results/doc_101/intelligence',
  })
  output_dir?: string;
}

export class ExtractDocumentMetaDto {
  @ApiPropertyOptional({
    description: 'Unique document identifier',
    example: 'doc_101',
  })
  id?: string;

  @ApiPropertyOptional({
    description: 'Document classification type (transcript, certificate, syllabus, general)',
    example: 'transcript',
  })
  type?: string;

  [key: string]: unknown;
}

export class ExtractRequestDto {
  @ApiPropertyOptional({
    description: 'Request schema version',
    example: 'ocr-intelligence-request-0.1',
  })
  schema_version?: string;

  @ApiPropertyOptional({
    description: 'Document metadata information',
    type: () => ExtractDocumentMetaDto,
  })
  document?: ExtractDocumentMetaDto;

  @ApiProperty({
    description: 'Loss-aware LLM context object constructed by the OCR / layout pipeline',
    type: () => LlmContextDto,
  })
  context!: LlmContext;

  @ApiPropertyOptional({
    description: 'Inference and extraction pipeline configuration options',
    type: () => ExtractRequestOptionsDto,
  })
  options?: ExtractRequestOptionsDto;
}

export class ExtractFileRequestDto {
  @ApiProperty({
    description: 'Absolute or relative filesystem path to input llm_context.json file',
    example: './examples/transcript/sophia_jones_transcript/llm_context.json',
  })
  context_file_path!: string;

  @ApiPropertyOptional({
    description: 'Optional path to companion llm_context_report.json file for loss gate verification',
    example: './examples/transcript/sophia_jones_transcript/llm_context_report.json',
  })
  report_file_path?: string;

  @ApiPropertyOptional({
    description: 'Inference and extraction pipeline configuration options',
    type: () => ExtractRequestOptionsDto,
  })
  options?: ExtractRequestOptionsDto;
}

export class TelemetryDto {
  @ApiProperty({
    description: 'Identifier of the prompt template used for extraction',
    example: 'transcript.v1',
  })
  prompt_version!: string;

  @ApiProperty({
    description: 'End-to-end inference and validation latency in milliseconds',
    example: 842,
  })
  latency_ms!: number;

  @ApiPropertyOptional({
    description: 'Tokens processed in prompt',
    example: 620,
  })
  input_tokens?: number;

  @ApiPropertyOptional({
    description: 'Tokens generated in response',
    example: 310,
  })
  output_tokens?: number;
}

export class ModelSummaryDto {
  @ApiProperty({
    description: 'LLM backend provider',
    example: 'ollama',
  })
  provider!: string;

  @ApiProperty({
    description: 'Model name used during inference',
    example: 'qwen3:8b',
  })
  name!: string;
}

export class DocumentSummaryDto {
  @ApiProperty({
    description: 'Document identifier',
    example: 'doc_101',
  })
  id!: string;

  @ApiProperty({
    description: 'Document type',
    example: 'transcript',
  })
  type!: string;
}

export class ArtifactPathsDto {
  @ApiPropertyOptional({
    description: 'Target directory containing saved JSON artifacts',
    example: '/home/khizaruddin/projects/fullapp/EDMO-OCR-DI/edmo-di-llm-backend/results/doc_101/intelligence',
  })
  output_dir?: string;

  @ApiPropertyOptional({
    description: 'Filepath to preserved LLM prompt payload artifact',
  })
  llm_request?: string;

  @ApiPropertyOptional({
    description: 'Filepath to preserved raw LLM text response artifact',
  })
  llm_response?: string;

  @ApiPropertyOptional({
    description: 'Filepath to candidate JSON document artifact',
  })
  candidate_document?: string;

  @ApiPropertyOptional({
    description: 'Filepath to schema and evidence validation report artifact',
  })
  validation_report?: string;

  @ApiPropertyOptional({
    description: 'Filepath to trusted, normalized final document artifact',
  })
  validated_document?: string;
}

export class ExtractResponseDto<T = Record<string, unknown>> {
  @ApiProperty({
    description: 'Response specification version',
    example: 'ocr-intelligence-response-0.1',
  })
  schema_version!: 'ocr-intelligence-response-0.1';

  @ApiProperty({
    description: 'Extracted document identification',
    type: () => DocumentSummaryDto,
  })
  document!: DocumentSummaryDto;

  @ApiProperty({
    description: 'Model execution information',
    type: () => ModelSummaryDto,
  })
  model!: ModelSummaryDto;

  @ApiProperty({
    description: 'Pipeline execution telemetry and performance metrics',
    type: () => TelemetryDto,
  })
  telemetry!: TelemetryDto;

  @ApiProperty({
    description: 'Parsed candidate document output before validation filtering',
    example: {
      document_type: 'transcript',
      student: { name: 'Sophia Jones', student_id: 'S12345678' },
      courses: [
        { code: 'CS101', title: 'Intro to Computer Science', credits: 3.0, grade: 'A' },
      ],
    },
  })
  candidate!: T;

  @ApiProperty({
    description: 'Trusted, schema-conforming, evidence-grounded and normalized document (null if validation fails)',
    example: {
      document_type: 'transcript',
      student: { name: 'Sophia Jones', student_id: 'S12345678' },
      courses: [
        { code: 'CS101', title: 'Intro to Computer Science', credits: 3.0, grade: 'A' },
      ],
    },
  })
  validated!: T | null;

  @ApiProperty({
    description: 'Comprehensive evidence grounding and schema audit report',
    type: () => ValidationReportDto,
  })
  validation!: ValidationReport;

  @ApiPropertyOptional({
    description: 'Filesystem paths of generated auditable audit files',
    type: () => ArtifactPathsDto,
  })
  artifact_paths?: ArtifactPathsDto;
}
