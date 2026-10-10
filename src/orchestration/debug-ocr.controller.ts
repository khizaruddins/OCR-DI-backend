import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Post,
  Query,
  Res,
  UnauthorizedException,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBadRequestResponse,
  ApiBody,
  ApiConsumes,
  ApiForbiddenResponse,
  ApiInternalServerErrorResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Response } from 'express';
import * as fs from 'fs';
import * as path from 'path';
import { ApiErrorResponseDto } from '../common/dto/error-response.dto';
import { OcrLogger } from '../common/logger.service';
import {
  DocumentWorkspace,
  DocumentWorkspaceService,
} from './document-workspace.service';
import {
  DownstreamStagesStatusDto,
  RawOcrOutputFormat,
  RawOcrResponseDto,
} from './dto/debug-raw-ocr.dto';
import { OcrEngineService } from './ocr-engine.service';

const SUPPORTED_DEBUG_MIME_TYPES = new Set([
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/webp',
]);

const SUPPORTED_DEBUG_EXTENSIONS = new Set([
  '.pdf',
  '.png',
  '.jpeg',
  '.jpg',
  '.webp',
]);

@ApiTags('Debug OCR')
@Controller('api/debug/ocr')
export class DebugOcrController {
  private readonly maxFileSizeMb: number;
  private readonly baseWorkDir: string;
  private readonly isProduction: boolean;
  private readonly debugEndpointsEnabled: boolean;
  private readonly debugApiKey: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly workspaceService: DocumentWorkspaceService,
    private readonly ocrEngine: OcrEngineService,
    private readonly logger: OcrLogger,
  ) {
    this.maxFileSizeMb =
      this.configService.get<number>('orchestrator.maxFileSizeMb') || 50;
    this.baseWorkDir =
      this.configService.get<string>('orchestrator.workDir') || '/tmp/ocr';
    const nodeEnv = this.configService.get<string>('nodeEnv') || process.env.NODE_ENV || 'development';
    this.isProduction = nodeEnv === 'production';
    this.debugEndpointsEnabled =
      process.env.DEBUG_ENDPOINTS_ENABLED === 'true' ||
      process.env.DEBUG_ENABLED === 'true' ||
      !this.isProduction;
    this.debugApiKey =
      process.env.DEBUG_API_KEY ||
      this.configService.get<string>('debug.apiKey') ||
      '';
  }

  private verifyAuthorization(authHeader?: string, debugKeyHeader?: string): void {
    if (!this.debugEndpointsEnabled) {
      throw new ForbiddenException({
        error: 'DEBUG_DISABLED',
        message: 'Debug endpoints are disabled in production environment.',
      });
    }

    if (this.debugApiKey) {
      const token = authHeader?.startsWith('Bearer ')
        ? authHeader.slice(7).trim()
        : authHeader;
      const providedKey = debugKeyHeader || token;

      if (!providedKey || providedKey !== this.debugApiKey) {
        throw new UnauthorizedException({
          error: 'UNAUTHORIZED',
          message: 'Missing or invalid debug authorization key.',
        });
      }
    }
  }

  private validateFile(file: Express.Multer.File): void {
    if (!file || !file.buffer || file.buffer.length === 0) {
      throw new BadRequestException({
        error: 'FILE_EMPTY',
        message: 'A document file must be uploaded under the "file" form field and cannot be 0 bytes.',
      });
    }

    const maxBytes = this.maxFileSizeMb * 1024 * 1024;
    if (file.buffer.length > maxBytes) {
      throw new BadRequestException({
        error: 'FILE_TOO_LARGE',
        message: `Uploaded file exceeds maximum allowed size of ${this.maxFileSizeMb}MB.`,
      });
    }

    const mime = (file.mimetype || '').toLowerCase();
    const ext = (file.originalname || '')
      .substring(file.originalname.lastIndexOf('.'))
      .toLowerCase();

    const isMimeValid =
      SUPPORTED_DEBUG_MIME_TYPES.has(mime) || mime === 'application/octet-stream';
    const isExtValid = SUPPORTED_DEBUG_EXTENSIONS.has(ext);

    if (!isMimeValid || !isExtValid) {
      throw new BadRequestException({
        error: 'UNSUPPORTED_FILE_TYPE',
        message: 'Supported document formats are PDF, PNG, JPEG, and WebP.',
        detectedMime: mime,
        detectedExtension: ext,
      });
    }

    // Magic number verification
    const buf = file.buffer;
    const isPdf =
      buf.length >= 4 &&
      buf[0] === 0x25 &&
      buf[1] === 0x50 &&
      buf[2] === 0x44 &&
      buf[3] === 0x46; // %PDF
    const isPng =
      buf.length >= 8 &&
      buf[0] === 0x89 &&
      buf[1] === 0x50 &&
      buf[2] === 0x4e &&
      buf[3] === 0x47; // \x89PNG
    const isJpeg =
      buf.length >= 3 &&
      buf[0] === 0xff &&
      buf[1] === 0xd8 &&
      buf[2] === 0xff; // \xFF\xD8\xFF
    const isWebp =
      buf.length >= 12 &&
      buf.toString('ascii', 0, 4) === 'RIFF' &&
      buf.toString('ascii', 8, 12) === 'WEBP';

    if (!isPdf && !isPng && !isJpeg && !isWebp) {
      throw new BadRequestException({
        error: 'INVALID_FILE_SIGNATURE',
        message: 'The file header magic signature does not match supported PDF or image formats.',
      });
    }
  }

  @Post('raw')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary: 'Isolated Raw OCR Extraction API',
    description: `
Runs the existing EDMO C++ OCR engine directly on an uploaded document and returns its raw OCR output.
Explicitly bypasses all downstream stages:
- EDR generation: NOT_EXECUTED
- Table construction & normalization: NOT_EXECUTED
- Evidence extraction & scoring: NOT_EXECUTED
- Field correction & normalization: NOT_EXECUTED
- LLM routing & inference: NOT_EXECUTED
- Enhanced EDR & Final projection: NOT_EXECUTED
`,
  })
  @ApiBody({
    description: 'Document upload for isolated raw OCR extraction',
    schema: {
      type: 'object',
      required: ['file'],
      properties: {
        file: {
          type: 'string',
          format: 'binary',
          description: 'Document file (PDF, PNG, JPEG, WebP up to 50MB)',
        },
        include_artifacts: {
          type: 'boolean',
          default: false,
          description: 'Include generated raw OCR artifact files and metadata in response',
        },
        output_format: {
          type: 'string',
          enum: ['json', 'text'],
          default: 'json',
          description: 'Output format: json (default) or plain text',
        },
        dpi: {
          type: 'integer',
          default: 300,
          description: 'Rendering DPI for PDF page rasterization',
        },
        force_ocr: {
          type: 'boolean',
          default: false,
          description: 'Force OCR raster path for all pages, bypassing native text streams',
        },
        force_native_text: {
          type: 'boolean',
          default: false,
          description: 'Force native text extraction where available',
        },
      },
    },
  })
  @ApiOkResponse({
    description: 'Raw OCR output returned directly without downstream processing',
    type: RawOcrResponseDto,
  })
  @ApiBadRequestResponse({
    description: 'Invalid upload, empty file, unsupported format, or oversized file',
    type: ApiErrorResponseDto,
  })
  @ApiUnauthorizedResponse({
    description: 'Missing or invalid debug authentication key',
    type: ApiErrorResponseDto,
  })
  @ApiForbiddenResponse({
    description: 'Debug endpoint disabled in current environment',
    type: ApiErrorResponseDto,
  })
  @ApiInternalServerErrorResponse({
    description: 'OCR engine execution failure or timeout',
    type: ApiErrorResponseDto,
  })
  async extractRawOcr(
    @UploadedFile() file: Express.Multer.File,
    @Body() body: Record<string, unknown>,
    @Query() query: Record<string, unknown>,
    @Headers('authorization') authHeader: string | undefined,
    @Headers('x-debug-key') debugKeyHeader: string | undefined,
    @Res() res: Response,
  ): Promise<void> {
    this.verifyAuthorization(authHeader, debugKeyHeader);
    this.validateFile(file);

    const rawFormat = (body.output_format || query.output_format || 'json') as string;
    const outputFormat: 'json' | 'text' =
      rawFormat.toLowerCase() === 'text' ? 'text' : 'json';

    const rawIncludeArtifacts =
      body.include_artifacts ??
      body.includeArtifacts ??
      query.include_artifacts ??
      query.includeArtifacts;
    const includeArtifacts =
      rawIncludeArtifacts === 'true' ||
      rawIncludeArtifacts === true ||
      rawIncludeArtifacts === '1';

    const rawForceOcr =
      body.force_ocr ?? body.forceOcr ?? query.force_ocr ?? query.forceOcr;
    const forceOcr =
      rawForceOcr === 'true' || rawForceOcr === true || rawForceOcr === '1';

    const rawForceNative =
      body.force_native_text ??
      body.forceNativeText ??
      query.force_native_text ??
      query.forceNativeText;
    const forceNativeText =
      rawForceNative === 'true' ||
      rawForceNative === true ||
      rawForceNative === '1';

    const rawDpi = body.dpi || query.dpi;
    const dpi = rawDpi ? parseInt(String(rawDpi), 10) : 300;

    let workspace: DocumentWorkspace | null = null;
    try {
      workspace = await this.workspaceService.createWorkspace(
        file.buffer,
        file.originalname,
        file.mimetype,
      );

      const ocrResult = await this.ocrEngine.processRawOcr(workspace, {
        dpi,
        outputFormat,
        forceOcr,
        forceNativeText,
        includeArtifacts,
      });

      if (outputFormat === 'text') {
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        res.status(HttpStatus.OK).send(ocrResult.rawOutputContent);
        return;
      }

      const responsePayload: RawOcrResponseDto = {
        success: true,
        mode: 'RAW_OCR_ONLY',
        document: {
          filename: file.originalname,
          page_count: ocrResult.pageCount,
        },
        ocr: {
          status: 'COMPLETED',
          engine: ocrResult.engineName || 'ocr-engine',
          execution_time_ms: ocrResult.executionTimeMs,
          raw_output: ocrResult.rawOutputJson || {},
          artifacts: includeArtifacts
            ? ocrResult.artifacts.map((a) => ({
                name: a.name,
                filename: a.filename,
                size_bytes: a.size_bytes,
                mime_type: a.mime_type,
                content: a.content,
              }))
            : [],
        },
        downstream_stages: new DownstreamStagesStatusDto(),
      };

      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.status(HttpStatus.OK).json(responsePayload);
    } catch (err) {
      this.logger.error(
        'Raw OCR extraction failed',
        err instanceof Error ? err.stack : undefined,
        { error: err instanceof Error ? err.message : String(err) },
      );

      const status =
        err instanceof BadRequestException ||
        err instanceof UnauthorizedException ||
        err instanceof ForbiddenException
          ? err.getStatus()
          : HttpStatus.INTERNAL_SERVER_ERROR;

      const errorMessage = err instanceof Error ? err.message : String(err);

      if (outputFormat === 'text') {
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        res.status(status).send(`ERROR: ${errorMessage}`);
        return;
      }

      res.status(status).json({
        success: false,
        mode: 'RAW_OCR_ONLY',
        document: {
          filename: file.originalname,
          page_count: 0,
        },
        ocr: {
          status: 'FAILED',
          engine: 'ocr-engine',
          execution_time_ms: 0,
          raw_output: {},
          error: errorMessage,
        },
        downstream_stages: new DownstreamStagesStatusDto(),
      });
    } finally {
      if (workspace) {
        // Guarantee temporary file cleanup on both success and failure
        await this.workspaceService.cleanupWorkspace(workspace);
      }
    }
  }

  @Get('artifacts/:documentId/:artifactName')
  @ApiOperation({
    summary: 'Download raw OCR debug artifact file',
    description: 'Securely retrieves a generated raw OCR artifact from an existing preserved workspace.',
  })
  @ApiParam({ name: 'documentId', description: 'Document ID of the workspace' })
  @ApiParam({ name: 'artifactName', description: 'Filename of the artifact' })
  async downloadArtifact(
    @Param('documentId') documentId: string,
    @Param('artifactName') artifactName: string,
    @Headers('authorization') authHeader: string | undefined,
    @Headers('x-debug-key') debugKeyHeader: string | undefined,
    @Res() res: Response,
  ): Promise<void> {
    this.verifyAuthorization(authHeader, debugKeyHeader);

    // Strict path traversal prevention
    const safeDocId = documentId.replace(/[^a-zA-Z0-9_-]/g, '');
    const safeArtifactName = path.basename(artifactName).replace(/[^a-zA-Z0-9._-]/g, '');

    const artifactPath = path.join(this.baseWorkDir, safeDocId, 'ocr', safeArtifactName);

    // Verify canonical path is inside baseWorkDir
    const resolvedPath = path.resolve(artifactPath);
    if (!resolvedPath.startsWith(path.resolve(this.baseWorkDir))) {
      throw new ForbiddenException({
        error: 'ACCESS_DENIED',
        message: 'Path traversal attempt detected.',
      });
    }

    if (!fs.existsSync(resolvedPath)) {
      throw new NotFoundException({
        error: 'ARTIFACT_NOT_FOUND',
        message: `Artifact "${safeArtifactName}" was not found or workspace was cleaned.`,
      });
    }

    const stat = await fs.promises.stat(resolvedPath);
    if (!stat.isFile()) {
      throw new BadRequestException({
        error: 'INVALID_ARTIFACT',
        message: 'Requested path is not a regular file.',
      });
    }

    const isJson = safeArtifactName.endsWith('.json');
    res.setHeader(
      'Content-Type',
      isJson ? 'application/json; charset=utf-8' : 'text/plain; charset=utf-8',
    );
    res.sendFile(resolvedPath);
  }
}
