export const LLM_PROVIDER_TOKEN = 'LLM_PROVIDER_TOKEN';

export const SCHEMA_VERSIONS = {
  CONTEXT: 'llm-context-0.1',
  CONTEXT_REPORT: 'llm-context-report-0.1',
  TRANSCRIPT: 'edmo-transcript-0.1',
  REQUEST: 'edmo-intelligence-request-0.1',
  RESPONSE: 'edmo-intelligence-response-0.1',
  VALIDATION_REPORT: 'edmo-validation-report-0.1',
} as const;

export const DEFAULT_MODELS = {
  LMSTUDIO: 'qwen3-8b-mlx',
  OLLAMA: 'qwen3:8b',
} as const;

export const PROMPT_VERSIONS = {
  TRANSCRIPT_V1: 'transcript.v1',
} as const;
