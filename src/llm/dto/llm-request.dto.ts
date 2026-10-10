export interface LlmMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface LlmGenerationOptions {
  temperature?: number;
  topP?: number;
  timeoutMs?: number;
  maxRetries?: number;
  thinking?: boolean;
  model?: string;
  format?: 'json' | Record<string, unknown>;
}

export interface LlmRequest {
  systemPrompt?: string;
  prompt: string;
  messages?: LlmMessage[];
  options?: LlmGenerationOptions;
}

export interface StructuredLlmRequest<TSchema = unknown> extends LlmRequest {
  schema?: TSchema;
  jsonSchema?: Record<string, unknown>;
}
