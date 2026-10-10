import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import axios from 'axios';
import { EdmoLogger } from '../../src/common/logger.service';
import { OllamaProvider } from '../../src/llm/providers/ollama.provider';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('OllamaProvider', () => {
  let provider: OllamaProvider;
  let mockAxiosInstance: { post: jest.Mock; get: jest.Mock };

  beforeEach(async () => {
    mockAxiosInstance = {
      post: jest.fn(),
      get: jest.fn(),
    };
    mockedAxios.create.mockReturnValue(mockAxiosInstance as unknown as ReturnType<typeof axios.create>);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OllamaProvider,
        EdmoLogger,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key, defaultValue) => defaultValue),
          },
        },
      ],
    }).compile();

    provider = module.get<OllamaProvider>(OllamaProvider);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should generate structured response when Ollama responds with valid JSON', async () => {
    const mockJson = {
      schema_version: 'edmo-transcript-0.1',
      document_type: 'transcript',
      academic_records: [],
    };

    mockAxiosInstance.post.mockResolvedValueOnce({
      data: {
        message: { content: JSON.stringify(mockJson) },
        prompt_eval_count: 50,
        eval_count: 30,
        load_duration: 1000000,
        total_duration: 5000000,
      },
    });

    const response = await provider.generateStructured({
      prompt: 'Extract transcript',
    });

    expect(response.data).toEqual(mockJson);
    expect(response.usage?.promptTokens).toBe(50);
    expect(response.usage?.completionTokens).toBe(30);
    expect(response.parseError).toBeUndefined();
  });

  it('should return degraded health status without throwing when Ollama is offline', async () => {
    mockAxiosInstance.get.mockRejectedValueOnce(new Error('connect ECONNREFUSED 127.0.0.1:11434'));

    const health = await provider.healthCheck();

    expect(health.status).toBe('degraded');
    expect(health.available).toBe(false);
    expect(health.reason).toContain('OLLAMA_UNAVAILABLE');
  });

  it('should return degraded health status when model is not pulled in Ollama', async () => {
    mockAxiosInstance.get.mockResolvedValueOnce({
      data: {
        models: [{ name: 'llama3:8b' }, { name: 'mistral:7b' }],
      },
    });

    const health = await provider.healthCheck();

    expect(health.status).toBe('degraded');
    expect(health.available).toBe(false);
    expect(health.reason).toContain('MODEL_NOT_FOUND');
  });

  it('should return healthy status when Ollama and target model are available', async () => {
    mockAxiosInstance.get.mockResolvedValueOnce({
      data: {
        models: [{ name: 'qwen3:8b' }],
      },
    });

    const health = await provider.healthCheck();

    expect(health.status).toBe('healthy');
    expect(health.available).toBe(true);
  });
});
