import { Inject, Injectable } from '@nestjs/common';
import { LLM_PROVIDER_TOKEN } from '../../common/constants';
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
export class LlmService {
  constructor(
    @Inject(LLM_PROVIDER_TOKEN) private readonly activeProvider: LlmProvider,
    private readonly logger: EdmoLogger,
  ) {}

  get providerName(): string {
    return this.activeProvider.providerName;
  }

  async generate(request: LlmRequest): Promise<LlmResponse> {
    this.logger.debug(`Dispatching text generation to provider: ${this.activeProvider.providerName}`);
    return this.activeProvider.generate(request);
  }

  async generateStructured<T>(
    request: StructuredLlmRequest,
    jsonSchema?: Record<string, unknown>,
  ): Promise<LlmStructuredResponse<T>> {
    this.logger.debug(
      `Dispatching structured generation to provider: ${this.activeProvider.providerName}`,
    );
    return this.activeProvider.generateStructured<T>(request, jsonSchema);
  }

  async healthCheck(): Promise<LlmHealthStatus> {
    return this.activeProvider.healthCheck();
  }

  async getModelInfo(): Promise<LlmModelInfo> {
    return this.activeProvider.getModelInfo();
  }
}
