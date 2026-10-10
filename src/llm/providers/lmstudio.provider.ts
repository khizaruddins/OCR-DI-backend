import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance } from 'axios';
import { OcrLogger } from '../../common/logger.service';
import { LlmRequest, StructuredLlmRequest } from '../dto/llm-request.dto';
import {
  LlmHealthStatus,
  LlmModelInfo,
  LlmResponse,
  LlmStructuredResponse,
} from '../dto/llm-response.dto';
import { LlmProvider } from '../interfaces/llm-provider.interface';

@Injectable()
export class LmStudioProvider implements LlmProvider {
  public readonly providerName = 'lmstudio';
  private readonly client: AxiosInstance;
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly defaultModel: string;
  private readonly defaultTemperature: number;
  private readonly defaultTopP: number;
  private readonly defaultTimeoutMs: number;
  private readonly defaultMaxRetries: number;
  private readonly defaultThinking: boolean;

  constructor(
    private readonly configService: ConfigService,
    private readonly logger: OcrLogger,
  ) {
    const rawUrl = this.configService.get<string>(
      'llm.lmStudioBaseUrl',
      'http://192.168.0.104:1234/v1',
    );
    this.baseUrl = rawUrl.replace(/\/+$/, '');
    this.defaultModel = this.configService.get<string>('llm.lmStudioModel', 'qwen3-8b-mlx');
    this.apiKey = this.configService.get<string>('llm.apiKey', '');
    this.defaultTemperature = this.configService.get<number>('llm.temperature', 0);
    this.defaultTopP = this.configService.get<number>('llm.topP', 0.8);
    this.defaultTimeoutMs = this.configService.get<number>('llm.timeoutMs', 300000);
    this.defaultMaxRetries = this.configService.get<number>('llm.maxRetries', 2);
    this.defaultThinking = this.configService.get<boolean>('llm.thinking', false);

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (this.apiKey) {
      headers['Authorization'] = `Bearer ${this.apiKey}`;
    }

    this.client = axios.create({
      baseURL: this.baseUrl,
      timeout: this.defaultTimeoutMs,
      headers,
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
      temperature,
      top_p: topP,
    };

    return this.executeWithRetry(
      async () => {
        const startTime = Date.now();
        const response = await this.client.post('/chat/completions', payload, {
          timeout: timeoutMs,
        });
        const latencyMs = Date.now() - startTime;

        const choice = response.data?.choices?.[0];
        const rawContent = choice?.message?.content || '';
        const usageData = response.data?.usage;

        const usage = {
          promptTokens: usageData?.prompt_tokens,
          completionTokens: usageData?.completion_tokens,
          totalTokens: usageData?.total_tokens,
          totalDurationMs: latencyMs,
        };

        return {
          rawText: rawContent,
          usage,
          model: response.data?.model || model,
          provider: this.providerName,
          latencyMs,
          finishReason: choice?.finish_reason || 'stop',
        };
      },
      maxRetries,
      `LM Studio chat completion (model: ${model})`,
    );
  }

  async generateStructured<T>(
    request: StructuredLlmRequest,
    jsonSchema?: Record<string, unknown>,
  ): Promise<LlmStructuredResponse<T>> {
    const reqWithOptions: LlmRequest = {
      ...request,
      options: {
        ...request.options,
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
      this.logger.warn(`Failed to parse LM Studio structured output: ${parseError}`, {
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
      const response = await this.client.get('/models', { timeout: 5000 });
      const rawModels = response.data?.data || response.data?.models || [];
      const modelNames: string[] = rawModels.map(
        (m: { id?: string; name?: string }) => m.id || m.name || '',
      );

      const targetModel = this.defaultModel;
      const modelAvailable =
        modelNames.length === 0 ||
        modelNames.some(
          (name) =>
            name === targetModel ||
            name.toLowerCase() === targetModel.toLowerCase() ||
            name.toLowerCase().includes(targetModel.toLowerCase()) ||
            targetModel.toLowerCase().includes(name.toLowerCase()),
        );

      if (!modelAvailable) {
        return {
          provider: this.providerName,
          model: targetModel,
          status: 'degraded',
          available: false,
          reason: `MODEL_NOT_FOUND: Model '${targetModel}' is not loaded in LM Studio. Available: [${modelNames.join(', ')}]`,
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
      const message =
        axios.isAxiosError(error) && error.response?.data?.error?.message
          ? error.response.data.error.message
          : error instanceof Error
            ? error.message
            : String(error);

      return {
        provider: this.providerName,
        model: this.defaultModel,
        status: 'degraded',
        available: false,
        reason: `LM_STUDIO_UNAVAILABLE: Could not connect to LM Studio at ${this.baseUrl} (${message})`,
        details: { baseUrl: this.baseUrl, error: message },
      };
    }
  }

  async getModelInfo(): Promise<LlmModelInfo> {
    try {
      const response = await this.client.get('/models', { timeout: 5000 });
      const rawModels = response.data?.data || response.data?.models || [];
      const models = rawModels.map((m: { id?: string; name?: string; owned_by?: string }) => ({
        name: m.id || m.name || '',
        provider: this.providerName,
        family: m.owned_by || 'lmstudio',
      }));

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
    // 1. Remove reasoning/thinking tags (e.g. <think>...</think>)
    let cleaned = raw.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();

    // 2. Check if enclosed in ```json ... ``` or ``` ... ```
    const fenceMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
    if (fenceMatch) {
      cleaned = fenceMatch[1].trim();
    }

    // 3. If there's a JSON substring starting with { or [
    const firstBrace = cleaned.indexOf('{');
    const lastBrace = cleaned.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      return cleaned.substring(firstBrace, lastBrace + 1);
    }

    const firstBracket = cleaned.indexOf('[');
    const lastBracket = cleaned.lastIndexOf(']');
    if (firstBracket !== -1 && lastBracket !== -1 && lastBracket > firstBracket) {
      return cleaned.substring(firstBracket, lastBracket + 1);
    }

    return cleaned;
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
