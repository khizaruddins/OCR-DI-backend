import { Body, Controller, Get, HttpCode, HttpStatus, Post } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBody,
  ApiInternalServerErrorResponse,
  ApiOkResponse,
  ApiOperation,
  ApiServiceUnavailableResponse,
  ApiTags,
} from '@nestjs/swagger';
import {
  ApiErrorResponseDto,
  LlmUnavailableErrorResponseDto,
} from '../common/dto/error-response.dto';
import { LlmModelInfoResponseDto } from '../llm/dto/model-info.dto';
import { LlmService } from '../llm/services/llm.service';
import { DocumentsService } from './documents.service';
import {
  ExtractFileRequestDto,
  ExtractRequestDto,
  ExtractResponseDto,
} from './dto/extract-request.dto';

@ApiTags('Document Intelligence')
@Controller('v1')
export class DocumentsController {
  constructor(
    private readonly documentsService: DocumentsService,
    private readonly llmService: LlmService,
  ) {}

  @Post('intelligence/extract')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Extract structured academic document from in-memory LLM context',
    description:
      'Consumes an OCR LLM context payload, evaluates loss-awareness gate, prompts the target LLM provider, and executes schema validation, evidence grounding, hallucination detection, and normalization.',
  })
  @ApiBody({
    type: ExtractRequestDto,
    description: 'Document extraction request containing context, options, and document identifiers',
  })
  @ApiOkResponse({
    description: 'Successfully extracted, validated, and normalized document result',
    type: ExtractResponseDto,
  })
  @ApiBadRequestResponse({
    description: 'Context validation failed or invalid input payload',
    type: ApiErrorResponseDto,
  })
  @ApiServiceUnavailableResponse({
    description: 'LLM inference provider (e.g. Ollama) is unreachable or offline',
    type: LlmUnavailableErrorResponseDto,
  })
  @ApiInternalServerErrorResponse({
    description: 'Internal error occurred during extraction pipeline execution',
    type: ApiErrorResponseDto,
  })
  async extract(@Body() dto: ExtractRequestDto): Promise<ExtractResponseDto> {
    return this.documentsService.processExtraction(dto);
  }

  @Post('intelligence/extract-file')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Extract structured academic document from context files on disk',
    description:
      'Reads `llm_context.json` and optional `llm_context_report.json` directly from the filesystem, validates context loss gates, runs LLM extraction, and writes auditable artifacts to disk.',
  })
  @ApiBody({
    type: ExtractFileRequestDto,
    description: 'Filesystem paths to the input context and optional loss report files',
  })
  @ApiOkResponse({
    description: 'Successfully extracted, validated, and normalized document result with persisted artifact paths',
    type: ExtractResponseDto,
  })
  @ApiBadRequestResponse({
    description: 'Target context file not found or failed quality validation gate',
    type: ApiErrorResponseDto,
  })
  @ApiServiceUnavailableResponse({
    description: 'LLM inference provider is offline or unreachable',
    type: LlmUnavailableErrorResponseDto,
  })
  @ApiInternalServerErrorResponse({
    description: 'Error processing file extraction pipeline',
    type: ApiErrorResponseDto,
  })
  async extractFile(@Body() dto: ExtractFileRequestDto): Promise<ExtractResponseDto> {
    return this.documentsService.processFileExtraction(dto);
  }

  @Get('models')
  @ApiOperation({
    summary: 'List available LLM models',
    description:
      'Queries the active LLM backend provider (e.g., Ollama instance) and returns a list of installed models and their specifications.',
  })
  @ApiOkResponse({
    description: 'List of available models and provider metadata',
    type: LlmModelInfoResponseDto,
  })
  async getModels(): Promise<LlmModelInfoResponseDto> {
    return this.llmService.getModelInfo();
  }
}
