import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OcrLogger } from '../common/logger.service';
import { LlmContext } from '../context/interfaces/llm-context.interface';
import { LlmGenerationOptions } from '../llm/dto/llm-request.dto';
import { LlmUsage } from '../llm/dto/llm-response.dto';
import { LlmService } from '../llm/services/llm.service';
import { PromptBuilderService } from '../prompts/prompt-builder.service';
import { DocumentRouterService } from './document-router.service';

export interface ExtractionOptions extends LlmGenerationOptions {
  promptVersion?: string;
  documentType?: string;
  allowLossOverride?: boolean;
}

export interface ExtractionResult<T = Record<string, unknown>> {
  candidate: T;
  rawText: string;
  parseError?: string;
  usage?: LlmUsage;
  model: string;
  provider: string;
  promptVersion: string;
  documentType: string;
  latencyMs: number;
  requestPayload: {
    systemPrompt: string;
    userPrompt: string;
    model: string;
    options: Record<string, unknown>;
  };
}

@Injectable()
export class ExtractionService {
  constructor(
    private readonly router: DocumentRouterService,
    private readonly promptBuilder: PromptBuilderService,
    private readonly llmService: LlmService,
    private readonly configService: ConfigService,
    private readonly logger: OcrLogger,
  ) {}

  async extract<T = Record<string, unknown>>(
    context: LlmContext,
    options?: ExtractionOptions,
  ): Promise<ExtractionResult<T>> {
    const docType = options?.documentType || context.document?.type || 'transcript';
    const routing = this.router.route(docType);
    const promptVersion = options?.promptVersion || routing.defaultPromptVersion;

    // 1. Build prompt bundle
    const builtPrompt = this.promptBuilder.build(
      context,
      docType,
      promptVersion,
      routing.schemaGuide,
      routing.jsonSchema,
    );

    const defaultModel =
      this.llmService.providerName === 'lmstudio'
        ? this.configService.get<string>('llm.lmStudioModel', 'qwen3-8b-mlx')
        : this.configService.get<string>('llm.ollamaModel', 'qwen3:8b');
    const modelName = options?.model || defaultModel;
    const temperature = options?.temperature ?? 0; // Deterministic extraction
    const topP = options?.topP ?? 0.8;
    const timeoutMs = options?.timeoutMs;

    this.logger.log(`Initiating LLM extraction`, {
      docType,
      promptVersion,
      model: modelName,
      provider: this.llmService.providerName,
      estimatedContextTokens: context.estimated_tokens,
    });

    const requestPayload = {
      systemPrompt: builtPrompt.systemPrompt,
      userPrompt: builtPrompt.userPrompt,
      model: modelName,
      options: {
        temperature,
        topP,
        timeoutMs,
      },
    };

    // 2. Call LLM Gateway
    const response = await this.llmService.generateStructured<T>(
      {
        systemPrompt: builtPrompt.systemPrompt,
        prompt: builtPrompt.userPrompt,
        options: {
          model: modelName,
          temperature,
          topP,
          timeoutMs,
        },
      },
      routing.jsonSchema,
    );

    this.logger.log(`Extraction complete`, {
      latencyMs: response.latencyMs,
      model: response.model,
      provider: response.provider,
      hasParseError: !!response.parseError,
    });

    return {
      candidate: response.data,
      rawText: response.rawText,
      parseError: response.parseError,
      usage: response.usage,
      model: response.model,
      provider: response.provider,
      promptVersion: builtPrompt.promptVersion,
      documentType: docType,
      latencyMs: response.latencyMs,
      requestPayload,
    };
  }
}
