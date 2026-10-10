import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance } from 'axios';
import { EdmoLogger } from '../../common/logger.service';
import { LlmRequest, StructuredLlmRequest } from '../dto/llm-request.dto';
import {
  LlmHealthStatus,
  LlmModelInfo,
  LlmResponse,
  LlmStructuredResponse,
} from '../dto/llm-response.dto';
import { LlmProvider } from '../interfaces/llm-provider.interface';

@Injectable()
export class OllamaProvider implements LlmProvider {
  public readonly providerName = 'ollama';
  private readonly client: AxiosInstance;
  private readonly baseUrl: string;
  private readonly defaultModel: string;
  private readonly defaultTemperature: number;
  private readonly defaultTopP: number;
  private readonly defaultTimeoutMs: number;
  private readonly defaultMaxRetries: number;
  private readonly defaultThinking: boolean;

  constructor(
    private readonly configService: ConfigService,
    private readonly logger: EdmoLogger,
  ) {
    this.baseUrl = this.configService.get<string>('llm.ollamaBaseUrl', 'http://localhost:11434');
    this.defaultModel = this.configService.get<string>('llm.ollamaModel', 'qwen3:8b');
    this.defaultTemperature = this.configService.get<number>('llm.temperature', 0);
    this.defaultTopP = this.configService.get<number>('llm.topP', 0.8);
    this.defaultTimeoutMs = this.configService.get<number>('llm.timeoutMs', 120000);
    this.defaultMaxRetries = this.configService.get<number>('llm.maxRetries', 2);
    this.defaultThinking = this.configService.get<boolean>('llm.thinking', false);

    this.client = axios.create({
      baseURL: this.baseUrl,
      timeout: this.defaultTimeoutMs,
      headers: {
        'Content-Type': 'application/json',
      },
    });
  }

  async generate(request: LlmRequest): Promise<LlmResponse> {
    const model = request.options?.model || this.defaultModel;
    const temperature = request.options?.temperature ?? this.defaultTemperature;
    const topP = request.options?.topP ?? this.defaultTopP;
    const maxRetries = request.options?.maxRetries ?? this.defaultMaxRetries;
    const timeoutMs = request.options?.timeoutMs ?? this.defaultTimeoutMs;

    const messages = this.buildMessages(request);

    const payload: Record<string, unknown> = {
      model,
      messages,
      stream: false,
      options: {
        temperature,
        top_p: topP,
      },
    };

    if (request.options?.format) {
      payload.format = request.options.format;
    }

    return this.executeWithRetry(
      async () => {
        const startTime = Date.now();
        const response = await this.client.post('/api/chat', payload, {
          timeout: timeoutMs,
        });
        const latencyMs = Date.now() - startTime;

        const rawContent = response.data?.message?.content || '';
        const usage = {
          promptTokens: response.data?.prompt_eval_count,
          completionTokens: response.data?.eval_count,
          totalTokens:
            (response.data?.prompt_eval_count || 0) + (response.data?.eval_count || 0),
          loadDurationMs: response.data?.load_duration
            ? Math.round(response.data.load_duration / 1_000_000)
            : undefined,
          totalDurationMs: response.data?.total_duration
            ? Math.round(response.data.total_duration / 1_000_000)
            : undefined,
        };

        return {
          rawText: rawContent,
          usage,
          model,
          provider: this.providerName,
          latencyMs,
          finishReason: response.data?.done_reason || 'stop',
        };
      },
      maxRetries,
      `Ollama chat completion (model: ${model})`,
    );
  }

  async generateStructured<T>(
    request: StructuredLlmRequest,
    jsonSchema?: Record<string, unknown>,
  ): Promise<LlmStructuredResponse<T>> {
    const format = jsonSchema || 'json';
    const reqWithOptions: LlmRequest = {
      ...request,
      options: {
        ...request.options,
        format,
        temperature: request.options?.temperature ?? 0, // Deterministic extraction
      },
    };

    const response = await this.generate(reqWithOptions);
    let parsedData: T;

    try {
      const cleanJson = this.extractJsonText(response.rawText);
      parsedData = JSON.parse(cleanJson) as T;
    } catch (err: unknown) {
      const parseError = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Failed to parse LLM structured output: ${parseError}`, {
        rawTextPreview: response.rawText.slice(0, 300),
      });

      return {
        data: null as unknown as T,
        rawText: response.rawText,
        usage: response.usage,
        model: response.model,
        provider: response.provider,
        latencyMs: response.latencyMs,
        parseError,
      };
    }

    return {
      data: parsedData,
      rawText: response.rawText,
      usage: response.usage,
      model: response.model,
      provider: response.provider,
      latencyMs: response.latencyMs,
    };
  }

  async healthCheck(): Promise<LlmHealthStatus> {
    try {
      const response = await this.client.get('/api/tags', { timeout: 3000 });
      const models = response.data?.models || [];
      const modelNames: string[] = models.map((m: { name: string }) => m.name);

      const targetModel = this.defaultModel;
      const modelAvailable = modelNames.some(
        (name) => name === targetModel || name.startsWith(`${targetModel}:`) || name.startsWith(targetModel.split(':')[0]),
      );

      if (!modelAvailable) {
        return {
          provider: this.providerName,
          model: targetModel,
          status: 'degraded',
          available: false,
          reason: `MODEL_NOT_FOUND: Model '${targetModel}' is not pulled in Ollama. Available: [${modelNames.join(', ')}]`,
          details: { availableModels: modelNames, baseUrl: this.baseUrl },
        };
      }

      return {
        provider: this.providerName,
        model: targetModel,
        status: 'healthy',
        available: true,
        details: { availableModels: modelNames, baseUrl: this.baseUrl },
      };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        provider: this.providerName,
        model: this.defaultModel,
        status: 'degraded',
        available: false,
        reason: `OLLAMA_UNAVAILABLE: Could not connect to Ollama at ${this.baseUrl} (${message})`,
        details: { baseUrl: this.baseUrl, error: message },
      };
    }
  }

  async getModelInfo(): Promise<LlmModelInfo> {
    try {
      const response = await this.client.get('/api/tags', { timeout: 5000 });
      const models = (response.data?.models || []).map(
        (m: {
          name: string;
          size?: number;
          details?: {
            family?: string;
            parameter_size?: string;
            quantization_level?: string;
          };
        }) => ({
          name: m.name,
          provider: this.providerName,
          size: m.size,
          family: m.details?.family,
          parameterSize: m.details?.parameter_size,
          quantizationLevel: m.details?.quantization_level,
        }),
      );

      return {
        provider: this.providerName,
        models,
      };
    } catch {
      return {
        provider: this.providerName,
        models: [],
      };
    }
  }

  private buildMessages(request: LlmRequest): Array<{ role: string; content: string }> {
    if (request.messages && request.messages.length > 0) {
      return request.messages;
    }

    const messages: Array<{ role: string; content: string }> = [];
    if (request.systemPrompt) {
      messages.push({ role: 'system', content: request.systemPrompt });
    }
    messages.push({ role: 'user', content: request.prompt });
    return messages;
  }

  private extractJsonText(raw: string): string {
    const trimmed = raw.trim();
    // Check if enclosed in ```json ... ``` or ``` ... ```
    const fenceMatch = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
    if (fenceMatch) {
      return fenceMatch[1].trim();
    }
    // If there's a JSON substring starting with { or [
    const firstBrace = trimmed.indexOf('{');
    const lastBrace = trimmed.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      return trimmed.substring(firstBrace, lastBrace + 1);
    }
    return trimmed;
  }

  private async executeWithRetry<T>(
    fn: () => Promise<T>,
    maxRetries: number,
    operationName: string,
  ): Promise<T> {
    let lastError: unknown;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await fn();
      } catch (err: unknown) {
        lastError = err;
        const isLastAttempt = attempt === maxRetries;
        if (isLastAttempt) {
          break;
        }
        const delayMs = Math.min(1000 * Math.pow(2, attempt), 8000);
        this.logger.warn(
          `${operationName} failed (attempt ${attempt + 1}/${maxRetries + 1}), retrying in ${delayMs}ms...`,
        );
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }
    throw lastError;
  }
}
