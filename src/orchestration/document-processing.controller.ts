import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBadRequestResponse,
  ApiBody,
  ApiConsumes,
  ApiInternalServerErrorResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { ApiErrorResponseDto } from '../common/dto/error-response.dto';
import { ArtifactService, DocumentArtifactSummary } from './artifact.service';
import { DocumentProcessingService } from './document-processing.service';
import {
  DocumentProcessingResponseDto,
  ProcessDocumentOptionsDto,
} from './dto/process-document.dto';

@ApiTags('Document Processing')
@Controller('v1/documents')
export class DocumentProcessingController {
  constructor(
    private readonly processingService: DocumentProcessingService,
    private readonly artifactService: ArtifactService,
  ) {}

  @Post('process')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary: 'Upload and process document through adaptive OCR and Evidence Intelligence pipeline',
    description: `
Executes the end-to-end OCR Intelligence pipeline:
1. **Document Preflight & Classification**: Analyzes page streams, vector text density, and image coverage in $<3\\text{ms}$.
2. **Adaptive Execution**: Digital pages extract via sub-millisecond native vector path; scanned pages route through CV preprocessing, deskewing, orientation detection, and OCR.
3. **Full EDR Representation**: Builds reading order, table matrices, key-values, and tokens.
4. **Evidence Intelligence Engine**: Runs token/field confidence scoring, dictionary validation, fuzzy matching, and zero-loss auditing.
5. **Targeted LLM Context**: Emits minimal \`evidence-llm.json\` context packet containing only unresolved fields.
6. **Selective LLM Resolution (Optional)**: If \`runLlm=true\` is provided and unresolved fields exist, resolves them through the configured LLM provider.
`,
  })
  @ApiBody({
    description: 'Multipart document file upload along with optional processing configurations',
    schema: {
      type: 'object',
      required: ['file'],
      properties: {
        file: {
          type: 'string',
          format: 'binary',
          description: 'Document file to process (PDF, PNG, JPEG, WebP up to 50MB)',
        },
        runLlm: {
          type: 'boolean',
          enum: [false, true],
          default: false,
          description:
            'Enable targeted local LLM semantic resolution (LM Studio / Ollama). When false, the pipeline returns LLM_RESOLUTION_REQUIRED and the resolution_request JSON. When true, it automatically reaches out to your local LLM provider to resolve tasks and emits the final document.',
        },
        documentType: {
          type: 'string',
          default: 'transcript',
          description: 'Document classification type (transcript, generic, resume)',
        },
        llmThreshold: {
          type: 'number',
          default: 0.95,
          description: 'Confidence threshold below which fields route to LLM (0.0 to 1.0)',
        },
        dpi: {
          type: 'integer',
          default: 300,
          description: 'Rendering DPI for PDF page rasterization if OCR is needed',
        },
        orientation: {
          type: 'boolean',
          default: true,
          description: 'Enable or disable automatic orientation detection and CV deskewing',
        },
        includeArtifacts: {
          type: 'boolean',
          default: false,
          description: 'Include detailed artifact metadata in response',
        },
        forceOcr: {
          type: 'boolean',
          default: false,
          description: 'Force OCR pipeline for all pages, bypassing native text extraction',
        },
        forceNativeText: {
          type: 'boolean',
          default: false,
          description: 'Force native text extraction for all available pages',
        },
        debug: {
          type: 'boolean',
          default: false,
          description: 'Preserve workspace artifacts on disk for inspection and enable debug logs',
        },
      },
    },
  })
  @ApiOkResponse({
    description: 'Document successfully processed with Full EDR and targeted LLM context',
    type: DocumentProcessingResponseDto,
  })
  @ApiBadRequestResponse({
    description: 'Invalid upload, unsupported file format, or file size limit exceeded',
    type: ApiErrorResponseDto,
  })
  @ApiInternalServerErrorResponse({
    description: 'Subprocess execution failed, artifact missing, or zero-loss audit failure',
    type: ApiErrorResponseDto,
  })
  async process(
    @UploadedFile() file: Express.Multer.File,
    @Body() body: Record<string, unknown>,
  ): Promise<DocumentProcessingResponseDto> {
    if (!file) {
      throw new BadRequestException({
        code: 'FILE_MISSING',
        message: 'A document file must be uploaded under the "file" form field.',
      });
    }

    const rawRunLlm = body.runLlm ?? body.run_llm ?? body.runllm;
    const rawThreshold = body.llmThreshold ?? body.llm_threshold;
    const rawDocType = body.documentType ?? body.document_type;
    const rawIncludeArtifacts = body.includeArtifacts ?? body.include_artifacts;
    const rawForceOcr = body.forceOcr ?? body.force_ocr;
    const rawForceNative = body.forceNativeText ?? body.force_native_text;

    const options: ProcessDocumentOptionsDto = {
      documentType: (rawDocType as string) || 'transcript',
      llmThreshold: rawThreshold ? parseFloat(rawThreshold as string) : 0.95,
      dpi: body.dpi ? parseInt(body.dpi as string, 10) : 300,
      orientation: body.orientation !== 'false' && body.orientation !== false,
      runLlm: rawRunLlm === 'true' || rawRunLlm === true || rawRunLlm === '1',
      includeArtifacts: rawIncludeArtifacts === 'true' || rawIncludeArtifacts === true,
      forceOcr: rawForceOcr === 'true' || rawForceOcr === true,
      forceNativeText: rawForceNative === 'true' || rawForceNative === true,
      debug: body.debug === 'true' || body.debug === true,
    };

    return this.processingService.processDocument(file, options);
  }

  @Get(':documentId/artifacts')
  @ApiOperation({
    summary: 'Get artifact metadata for a processed document workspace',
    description:
      'Inspects the document workspace (if preserved via debug=true or OCR_KEEP_ARTIFACTS=true) and lists available artifacts (`raw_ocr.json`, `edr_full.json`, `evidence-full.json`, `evidence-llm.json`, `evidence-report.json`).',
  })
  @ApiParam({
    name: 'documentId',
    description: 'Unique document ID generated during processing',
    example: 'doc_1787425005063_fc7053',
  })
  @ApiOkResponse({
    description: 'Artifact directory summary and list of available artifacts',
  })
  @ApiNotFoundResponse({
    description: 'Workspace for the specified document ID not found or already cleaned',
    type: ApiErrorResponseDto,
  })
  async getArtifacts(@Param('documentId') documentId: string): Promise<DocumentArtifactSummary> {
    const summary = await this.artifactService.getDocumentArtifacts(documentId);
    if (!summary.available) {
      throw new NotFoundException({
        code: 'WORKSPACE_NOT_FOUND',
        message: `Workspace for document ID "${documentId}" was not found or has been cleaned.`,
      });
    }
    return summary;
  }

  @Get(':documentId/artifacts/:artifactName')
  @ApiOperation({
    summary: 'Read JSON content of a specific artifact',
    description: 'Returns the full parsed JSON content of a designated artifact name.',
  })
  @ApiParam({ name: 'documentId', example: 'doc_1787425005063_fc7053' })
  @ApiParam({
    name: 'artifactName',
    enum: ['raw_ocr', 'edr_full', 'preflight', 'evidence_full', 'evidence_llm', 'evidence_report'],
    example: 'evidence_llm',
  })
  @ApiOkResponse({ description: 'Parsed JSON content of the artifact' })
  @ApiNotFoundResponse({ description: 'Artifact not found' })
  async getArtifactContent(
    @Param('documentId') documentId: string,
    @Param('artifactName') artifactName: string,
  ): Promise<Record<string, unknown>> {
    const content = await this.artifactService.readArtifactContent(documentId, artifactName);
    if (!content) {
      throw new NotFoundException({
        code: 'ARTIFACT_NOT_FOUND',
        message: `Artifact "${artifactName}" for document ID "${documentId}" was not found.`,
      });
    }
    return content;
  }
}
