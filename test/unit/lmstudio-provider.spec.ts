import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import axios from 'axios';
import { EdmoLogger } from '../../src/common/logger.service';
import { LmStudioProvider } from '../../src/llm/providers/lmstudio.provider';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('LmStudioProvider', () => {
  let provider: LmStudioProvider;
  let mockAxiosInstance: { post: jest.Mock; get: jest.Mock };

  beforeEach(async () => {
    mockAxiosInstance = {
      post: jest.fn(),
      get: jest.fn(),
    };
    mockedAxios.create.mockReturnValue(
      mockAxiosInstance as unknown as ReturnType<typeof axios.create>,
    );

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LmStudioProvider,
        EdmoLogger,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string, defaultValue: unknown) => {
              if (key === 'llm.lmStudioBaseUrl') return 'http://192.168.0.104:1234/v1';
              if (key === 'llm.lmStudioModel') return 'qwen3-8b-mlx';
              if (key === 'llm.apiKey') return 'sk-lm-test-key';
              if (key === 'llm.temperature') return 0;
              if (key === 'llm.topP') return 0.8;
              if (key === 'llm.timeoutMs') return 300000;
              return defaultValue;
            }),
          },
        },
      ],
    }).compile();

    provider = module.get<LmStudioProvider>(LmStudioProvider);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should instantiate axios client with Bearer authorization header', () => {
    expect(mockedAxios.create).toHaveBeenCalledWith(
      expect.objectContaining({
        baseURL: 'http://192.168.0.104:1234/v1',
        timeout: 300000,
        headers: expect.objectContaining({
          'Content-Type': 'application/json',
          Authorization: 'Bearer sk-lm-test-key',
        }),
      }),
    );
  });

  it('should generate structured response when LM Studio responds with valid JSON', async () => {
    const mockJson = {
      schema_version: 'edmo-transcript-0.1',
      document_type: 'transcript',
      academic_records: [],
    };

    mockAxiosInstance.post.mockResolvedValueOnce({
      data: {
        id: 'chatcmpl-123',
        model: 'qwen3-8b-mlx',
        choices: [
          {
            message: { content: JSON.stringify(mockJson) },
            finish_reason: 'stop',
          },
        ],
        usage: {
          prompt_tokens: 120,
          completion_tokens: 65,
          total_tokens: 185,
        },
      },
    });

    const response = await provider.generateStructured({
      prompt: 'Extract transcript',
    });

    expect(response.data).toEqual(mockJson);
    expect(response.usage?.promptTokens).toBe(120);
    expect(response.usage?.completionTokens).toBe(65);
    expect(response.usage?.totalTokens).toBe(185);
    expect(response.parseError).toBeUndefined();
    expect(response.provider).toBe('lmstudio');
  });

  it('should strip <think> tags and markdown fences before parsing JSON', async () => {
    const mockData = { test: 'clean_output' };
    const rawContent = `<think>\nLet me analyze the request...\n</think>\n\`\`\`json\n${JSON.stringify(mockData)}\n\`\`\``;

    mockAxiosInstance.post.mockResolvedValueOnce({
      data: {
        choices: [
          {
            message: { content: rawContent },
          },
        ],
      },
    });

    const response = await provider.generateStructured({
      prompt: 'Extract test',
    });

    expect(response.data).toEqual(mockData);
    expect(response.parseError).toBeUndefined();
  });

  it('should return degraded health status without throwing when LM Studio is offline', async () => {
    mockAxiosInstance.get.mockRejectedValueOnce(new Error('connect ECONNREFUSED 192.168.0.104:1234'));

    const health = await provider.healthCheck();

    expect(health.status).toBe('degraded');
    expect(health.available).toBe(false);
    expect(health.reason).toContain('LM_STUDIO_UNAVAILABLE');
  });

  it('should return healthy status when LM Studio responds with models', async () => {
    mockAxiosInstance.get.mockResolvedValueOnce({
      data: {
        data: [{ id: 'qwen3-8b-mlx' }, { id: 'text-embedding-nomic' }],
      },
    });

    const health = await provider.healthCheck();

    expect(health.status).toBe('healthy');
    expect(health.available).toBe(true);
    expect(health.model).toBe('qwen3-8b-mlx');
  });

  it('should return model info list from /models', async () => {
    mockAxiosInstance.get.mockResolvedValueOnce({
      data: {
        data: [{ id: 'qwen3-8b-mlx', owned_by: 'organization_owner' }],
      },
    });

    const info = await provider.getModelInfo();

    expect(info.provider).toBe('lmstudio');
    expect(info.models.length).toBe(1);
    expect(info.models[0].name).toBe('qwen3-8b-mlx');
  });
});
