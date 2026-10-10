export interface LlmUsage {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  loadDurationMs?: number;
  totalDurationMs?: number;
}

export interface LlmResponse {
  rawText: string;
  usage?: LlmUsage;
  model: string;
  provider: string;
  latencyMs: number;
  finishReason?: string;
}

export interface LlmStructuredResponse<T> {
  data: T;
  rawText: string;
  usage?: LlmUsage;
  model: string;
  provider: string;
  latencyMs: number;
  parseError?: string;
}

export interface LlmModelDetails {
  name: string;
  provider: string;
  size?: number;
  family?: string;
  parameterSize?: string;
  quantizationLevel?: string;
}

export interface LlmHealthStatus {
  provider: string;
  model: string;
  status: 'healthy' | 'degraded' | 'unhealthy';
  available: boolean;
  reason?: string;
  details?: Record<string, unknown>;
}

export interface LlmModelInfo {
  provider: string;
  models: LlmModelDetails[];
}
