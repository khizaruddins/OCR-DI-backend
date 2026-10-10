export default () => ({
  port: parseInt(process.env.PORT || '3000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  ocr: {
    binaryPath: process.env.OCR_BINARY || '',
    timeoutMs: parseInt(process.env.OCR_TIMEOUT_MS || '120000', 10),
    defaultDpi: parseInt(process.env.OCR_DEFAULT_DPI || '200', 10),
  },
  evidence: {
    binaryPath: process.env.OCR_EVIDENCE_BINARY || '',
    timeoutMs: parseInt(process.env.OCR_EVIDENCE_TIMEOUT_MS || '30000', 10),
    defaultLlmThreshold: parseFloat(process.env.OCR_EVIDENCE_LLM_THRESHOLD || '0.95'),
  },
  orchestrator: {
    workDir: process.env.OCR_WORK_DIR || '/tmp/ocr',
    maxFileSizeMb: parseInt(process.env.OCR_MAX_FILE_SIZE_MB || '50', 10),
    keepArtifacts: process.env.OCR_KEEP_ARTIFACTS === 'true' || process.env.OCR_KEEP_ARTIFACTS === '1',
    llmEnabled: process.env.OCR_LLM_ENABLED !== 'false',
  },
  llm: {
    provider: process.env.LLM_PROVIDER || 'lmstudio',
    lmStudioBaseUrl: process.env.LM_STUDIO_BASE_URL || 'http://192.168.0.104:1234/v1',
    lmStudioModel: process.env.LM_STUDIO_MODEL || 'qwen3-8b-mlx',
    apiKey: process.env.LLM_API_KEY || process.env.LM_STUDIO_API_KEY || '',
    ollamaBaseUrl: process.env.OLLAMA_BASE_URL || 'http://localhost:11434',
    ollamaModel: process.env.OLLAMA_MODEL || 'qwen3:8b',
    temperature: parseFloat(process.env.LLM_TEMPERATURE || '0'),
    topP: parseFloat(process.env.LLM_TOP_P || '0.8'),
    timeoutMs: parseInt(process.env.LLM_TIMEOUT_MS || '300000', 10),
    maxRetries: parseInt(process.env.LLM_MAX_RETRIES || '2', 10),
    thinking: process.env.LLM_THINKING === 'true' || process.env.LLM_THINKING === '1',
  },
  prompts: {
    defaultVersion: process.env.PROMPT_VERSION || 'transcript.v1',
  },
  validation: {
    strictLoss: process.env.CONTEXT_VALIDATION_STRICT_LOSS !== 'false',
  },
  storage: {
    resultsDir: process.env.RESULTS_DIR || './results',
    persistRawResponse: process.env.PERSIST_RAW_RESPONSE !== 'false',
  },
  logging: {
    level: process.env.LOG_LEVEL || 'info',
  },
});
