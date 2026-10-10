import { LlmRequest, StructuredLlmRequest } from '../dto/llm-request.dto';
import {
  LlmHealthStatus,
  LlmModelInfo,
  LlmResponse,
  LlmStructuredResponse,
} from '../dto/llm-response.dto';

export interface LlmProvider {
  readonly providerName: string;

  /**
   * Generate free-form or structured text response.
   */
  generate(request: LlmRequest): Promise<LlmResponse>;

  /**
   * Generate typed structured JSON response enforced by schema.
   */
  generateStructured<T>(
    request: StructuredLlmRequest,
    jsonSchema?: Record<string, unknown>,
  ): Promise<LlmStructuredResponse<T>>;

  /**
   * Check provider connectivity and model availability.
   * Must not throw uncaught errors; must return a structured LlmHealthStatus.
   */
  healthCheck(): Promise<LlmHealthStatus>;

  /**
   * Get list of available models on the provider.
   */
  getModelInfo(): Promise<LlmModelInfo>;
}
