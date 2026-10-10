import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { EdmoLogger } from '../common/logger.service';
import { ContextLoaderService } from '../context/context-loader.service';
import { ContextValidatorService } from '../context/context-validator.service';
import { LlmContext, LlmContextReport } from '../context/interfaces/llm-context.interface';
import { ExtractionService } from '../extraction/extraction.service';
import { LlmService } from '../llm/services/llm.service';
import { ExtractionValidatorService } from '../validation/extraction-validator.service';
import {
  ExtractFileRequestDto,
  ExtractRequestDto,
  ExtractResponseDto,
} from './dto/extract-request.dto';

@Injectable()
export class DocumentsService {
  private readonly defaultResultsDir: string;
  private readonly persistRawResponse: boolean;

  constructor(
    private readonly contextValidator: ContextValidatorService,
    private readonly contextLoader: ContextLoaderService,
    private readonly extractionService: ExtractionService,
    private readonly validatorService: ExtractionValidatorService,
    private readonly llmService: LlmService,
    private readonly configService: ConfigService,
    private readonly logger: EdmoLogger,
  ) {
    this.defaultResultsDir = this.configService.get<string>(
      'storage.resultsDir',
      './results',
    );
    this.persistRawResponse = this.configService.get<boolean>(
      'storage.persistRawResponse',
      true,
    );
  }

  async processExtraction(dto: ExtractRequestDto): Promise<ExtractResponseDto> {
    const documentId =
      dto.document?.id ||
      (dto.context?.document as { id?: string })?.id ||
      `doc_${Date.now()}_${uuidv4().substring(0, 6)}`;
    const documentType = dto.document?.type || dto.context?.document?.type || 'transcript';

    // 1. Context validation
    const allowOverride = dto.options?.allow_loss_override ?? false;
    const validationResult = this.contextValidator.validate(
      dto.context,
      null,
      allowOverride,
    );

    if (!validationResult.valid) {
      throw new BadRequestException({
        error: 'CONTEXT_VALIDATION_FAILED',
        message: 'Supplied LLM Context failed validation checks.',
        details: validationResult.errors,
      });
    }

    // 2. Perform Extraction
    return this.executePipeline(dto.context, documentId, documentType, dto.options);
  }

  async processFileExtraction(dto: ExtractFileRequestDto): Promise<ExtractResponseDto> {
    const allowOverride = dto.options?.allow_loss_override ?? false;
    const loaded = this.contextLoader.loadFromFile(
      dto.context_file_path,
      dto.report_file_path,
      allowOverride,
    );

    if (!loaded.validation.valid) {
      throw new BadRequestException({
        error: 'CONTEXT_VALIDATION_FAILED',
        message: `Context file '${dto.context_file_path}' failed validation.`,
        details: loaded.validation.errors,
      });
    }

    const docId =
      loaded.context.document?.id ||
      path.basename(path.dirname(dto.context_file_path)) ||
      `doc_${Date.now()}`;
    const docType = loaded.context.document?.type || 'transcript';

    // Set default output dir relative to context file directory if not specified
    const options = { ...dto.options };
    if (!options.output_dir) {
      options.output_dir = path.join(path.dirname(path.resolve(dto.context_file_path)), 'intelligence');
    }

    return this.executePipeline(loaded.context, docId, docType, options, loaded.report);
  }

  private async executePipeline(
    context: LlmContext,
    documentId: string,
    documentType: string,
    options?: ExtractRequestDto['options'],
    contextReport?: LlmContextReport | null,
  ): Promise<ExtractResponseDto> {
    // 1. Check LLM provider health
    const health = await this.llmService.healthCheck();
    if (!health.available) {
      this.logger.error(`LLM Provider unavailable during extraction request`, undefined, {
        provider: health.provider,
        reason: health.reason,
      });
      throw new ServiceUnavailableException({
        error: 'LLM_UNAVAILABLE',
        message: health.reason || 'The configured LLM inference server is not reachable.',
        provider: health.provider,
        model: health.model,
      });
    }

    // 2. Run LLM Extraction
    let extractionResult;
    try {
      extractionResult = await this.extractionService.extract(context, {
        model: options?.model,
        promptVersion: options?.prompt_version,
        temperature: options?.temperature,
        topP: options?.top_p,
        timeoutMs: options?.timeout_ms,
        documentType,
      });
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      this.logger.error(`LLM extraction execution failed: ${errMsg}`, undefined, { documentId });
      throw new InternalServerErrorException({
        error: 'EXTRACTION_EXECUTION_FAILED',
        message: errMsg,
      });
    }

    // 3. Run Validation and Normalization Pipeline
    const validatedResult = this.validatorService.validateAndNormalize(
      context,
      extractionResult,
    );

    // 4. Save Auditable Artifacts
    const targetOutputDir =
      options?.output_dir || path.join(this.defaultResultsDir, documentId, 'intelligence');

    const artifactPaths = this.persistArtifacts(
      targetOutputDir,
      context,
      extractionResult,
      validatedResult,
    );

    return {
      schema_version: 'edmo-intelligence-response-0.1',
      document: {
        id: documentId,
        type: documentType,
      },
      model: {
        provider: extractionResult.provider,
        name: extractionResult.model,
      },
      telemetry: {
        prompt_version: extractionResult.promptVersion,
        latency_ms: extractionResult.latencyMs,
        input_tokens: extractionResult.usage?.promptTokens,
        output_tokens: extractionResult.usage?.completionTokens,
      },
      candidate: validatedResult.candidateDocument,
      validated: validatedResult.validatedDocument,
      validation: validatedResult.validationReport,
      artifact_paths: artifactPaths,
    };
  }

  private persistArtifacts(
    outputDir: string,
    context: LlmContext,
    extractionResult: {
      requestPayload: Record<string, unknown>;
      rawText: string;
      candidate: unknown;
    },
    validatedResult: {
      candidateDocument: unknown;
      validatedDocument: unknown;
      validationReport: unknown;
    },
  ) {
    try {
      const resolvedDir = path.resolve(outputDir);
      if (!fs.existsSync(resolvedDir)) {
        fs.mkdirSync(resolvedDir, { recursive: true });
      }

      const paths = {
        output_dir: resolvedDir,
        llm_request: path.join(resolvedDir, 'llm_request.json'),
        llm_response: path.join(resolvedDir, 'llm_response.json'),
        candidate_document: path.join(resolvedDir, 'candidate_document.json'),
        validation_report: path.join(resolvedDir, 'validation_report.json'),
        validated_document: path.join(resolvedDir, 'validated_document.json'),
      };

      if (this.persistRawResponse) {
        fs.writeFileSync(
          paths.llm_request,
          JSON.stringify(extractionResult.requestPayload, null, 2),
          'utf8',
        );
        fs.writeFileSync(
          paths.llm_response,
          JSON.stringify({ raw_text: extractionResult.rawText }, null, 2),
          'utf8',
        );
      }

      fs.writeFileSync(
        paths.candidate_document,
        JSON.stringify(validatedResult.candidateDocument, null, 2),
        'utf8',
      );
      fs.writeFileSync(
        paths.validation_report,
        JSON.stringify(validatedResult.validationReport, null, 2),
        'utf8',
      );
      fs.writeFileSync(
        paths.validated_document,
        JSON.stringify(validatedResult.validatedDocument, null, 2),
        'utf8',
      );

      this.logger.debug(`Persisted extraction artifacts to ${resolvedDir}`);
      return paths;
    } catch (err: unknown) {
      this.logger.warn(`Failed to persist artifacts: ${String(err)}`, { outputDir });
      return { output_dir: outputDir };
    }
  }
}
