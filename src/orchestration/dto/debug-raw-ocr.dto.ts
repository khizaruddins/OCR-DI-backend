import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export enum RawOcrOutputFormat {
  JSON = 'json',
  TEXT = 'text',
}

export class RawOcrDocumentInfoDto {
  @ApiProperty({ description: 'Original uploaded filename', example: 'Sophia_Jones_Transcript.pdf' })
  filename!: string;

  @ApiProperty({ description: 'Total document page count', example: 1 })
  page_count!: number;
}

export class RawOcrArtifactDto {
  @ApiProperty({ description: 'Internal artifact identifier', example: 'raw_ocr' })
  name!: string;

  @ApiProperty({ description: 'Artifact filename on disk', example: 'raw_ocr.json' })
  filename!: string;

  @ApiProperty({ description: 'File size in bytes', example: 45210 })
  size_bytes!: number;

  @ApiProperty({ description: 'MIME content type', example: 'application/json' })
  mime_type!: string;

  @ApiPropertyOptional({ description: 'Optional inline artifact content when requested' })
  content?: unknown;

  @ApiPropertyOptional({ description: 'Authorized download URL if workspace is retained', example: '/api/debug/ocr/artifacts/doc_123/raw_ocr.json' })
  download_url?: string;
}

export class RawOcrEngineSectionDto {
  @ApiProperty({ description: 'Status of the raw OCR execution', example: 'COMPLETED' })
  status!: 'COMPLETED' | 'FAILED';

  @ApiProperty({ description: 'OCR engine name and version', example: 'ocr-engine' })
  engine!: string;

  @ApiProperty({ description: 'Subprocess execution latency in milliseconds', example: 450 })
  execution_time_ms!: number;

  @ApiProperty({ description: 'Raw unmodified OCR engine output data' })
  raw_output!: Record<string, unknown> | string;

  @ApiPropertyOptional({ description: 'List of generated raw OCR artifacts', type: [RawOcrArtifactDto] })
  artifacts?: RawOcrArtifactDto[];

  @ApiPropertyOptional({ description: 'Engine error message if status is FAILED' })
  error?: string;
}

export class DownstreamStagesStatusDto {
  @ApiProperty({ description: 'Explicit bypass status for EDR generation', example: 'NOT_EXECUTED' })
  edr: 'NOT_EXECUTED' = 'NOT_EXECUTED';

  @ApiProperty({ description: 'Explicit bypass status for Evidence extraction and scoring', example: 'NOT_EXECUTED' })
  evidence: 'NOT_EXECUTED' = 'NOT_EXECUTED';

  @ApiProperty({ description: 'Explicit bypass status for LLM routing and inference', example: 'NOT_EXECUTED' })
  llm: 'NOT_EXECUTED' = 'NOT_EXECUTED';

  @ApiProperty({ description: 'Explicit bypass status for Enhanced EDR generation', example: 'NOT_EXECUTED' })
  enhanced_edr: 'NOT_EXECUTED' = 'NOT_EXECUTED';

  @ApiProperty({ description: 'Explicit bypass status for Final projection and document assembly', example: 'NOT_EXECUTED' })
  final_projection: 'NOT_EXECUTED' = 'NOT_EXECUTED';
}

export class RawOcrResponseDto {
  @ApiProperty({ description: 'Whether the operation succeeded', example: true })
  success!: boolean;

  @ApiProperty({ description: 'Processing mode indicator', example: 'RAW_OCR_ONLY' })
  mode: 'RAW_OCR_ONLY' = 'RAW_OCR_ONLY';

  @ApiProperty({ description: 'Document metadata', type: RawOcrDocumentInfoDto })
  document!: RawOcrDocumentInfoDto;

  @ApiProperty({ description: 'Raw OCR execution results and payload', type: RawOcrEngineSectionDto })
  ocr!: RawOcrEngineSectionDto;

  @ApiProperty({ description: 'Proof of downstream stage bypasses', type: DownstreamStagesStatusDto })
  downstream_stages!: DownstreamStagesStatusDto;
}
