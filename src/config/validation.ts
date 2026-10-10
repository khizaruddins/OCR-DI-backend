import { z } from 'zod';

export const envSchema = z.object({
  PORT: z.coerce.number().default(3000),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  
  // LLM Provider Configuration
  LLM_PROVIDER: z.enum(['lmstudio', 'ollama', 'mock', 'vllm', 'openai']).default('lmstudio'),
  LM_STUDIO_BASE_URL: z.string().url().default('http://192.168.0.104:1234/v1'),
  LM_STUDIO_MODEL: z.string().default('qwen3-8b-mlx'),
  LLM_API_KEY: z.string().optional(),
  LM_STUDIO_API_KEY: z.string().optional(),
  OLLAMA_BASE_URL: z.string().url().default('http://localhost:11434'),
  OLLAMA_MODEL: z.string().default('qwen3:8b'),
  
  // Hyperparameters
  LLM_TEMPERATURE: z.coerce.number().min(0).max(2).default(0),
  LLM_TOP_P: z.coerce.number().min(0).max(1).default(0.8),
  LLM_TIMEOUT_MS: z.coerce.number().default(300000),
  LLM_MAX_RETRIES: z.coerce.number().default(2),
  LLM_THINKING: z
    .string()
    .transform((val: string) => val === 'true' || val === '1')
    .default('false'),

  // Prompts & Validation
  PROMPT_VERSION: z.string().default('transcript.v1'),
  CONTEXT_VALIDATION_STRICT_LOSS: z
    .string()
    .transform((val: string) => val === 'true' || val === '1')
    .default('true'),

  // C++ Engine & Orchestrator Configuration
  OCR_BINARY: z.string().optional(),
  OCR_TIMEOUT_MS: z.coerce.number().default(120000),
  OCR_DEFAULT_DPI: z.coerce.number().default(300),
  OCR_EVIDENCE_BINARY: z.string().optional(),
  OCR_EVIDENCE_TIMEOUT_MS: z.coerce.number().default(30000),
  OCR_EVIDENCE_LLM_THRESHOLD: z.coerce.number().min(0).max(1).default(0.95),
  OCR_WORK_DIR: z.string().default('/tmp/ocr'),
  OCR_MAX_FILE_SIZE_MB: z.coerce.number().default(50),
  OCR_KEEP_ARTIFACTS: z
    .string()
    .transform((val: string) => val === 'true' || val === '1')
    .default('false'),
  OCR_LLM_ENABLED: z
    .string()
    .transform((val: string) => val === 'true' || val === '1')
    .default('true'),

  // Storage & Logging
  RESULTS_DIR: z.string().default('./results'),
  PERSIST_RAW_RESPONSE: z
    .string()
    .transform((val: string) => val === 'true' || val === '1')
    .default('true'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
});

export type EnvConfig = z.infer<typeof envSchema>;

export function validateEnvironment(config: Record<string, unknown>): EnvConfig {
  const result = envSchema.safeParse(config);
  if (!result.success) {
    const errorDetails = result.error.errors
      .map((err: z.ZodIssue) => `${err.path.join('.')}: ${err.message}`)
      .join(', ');
    throw new Error(`Environment validation error: ${errorDetails}`);
  }
  return result.data;
}
