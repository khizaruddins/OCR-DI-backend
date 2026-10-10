import { DynamicModule, Module, Provider } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { LLM_PROVIDER_TOKEN } from '../common/constants';
import { EdmoLogger } from '../common/logger.service';
import { LmStudioProvider } from './providers/lmstudio.provider';
import { MockLlmProvider } from './providers/mock.provider';
import { OllamaProvider } from './providers/ollama.provider';
import { LlmService } from './services/llm.service';

@Module({
  imports: [ConfigModule],
  providers: [
    EdmoLogger,
    LmStudioProvider,
    OllamaProvider,
    MockLlmProvider,
    {
      provide: LLM_PROVIDER_TOKEN,
      useFactory: (
        configService: ConfigService,
        lmStudioProvider: LmStudioProvider,
        ollamaProvider: OllamaProvider,
        mockProvider: MockLlmProvider,
      ) => {
        const providerType = configService.get<string>('llm.provider', 'lmstudio');
        if (providerType === 'mock') {
          return mockProvider;
        }
        if (providerType === 'ollama') {
          return ollamaProvider;
        }
        return lmStudioProvider;
      },
      inject: [ConfigService, LmStudioProvider, OllamaProvider, MockLlmProvider],
    },
    LlmService,
  ],
  exports: [
    LlmService,
    LLM_PROVIDER_TOKEN,
    LmStudioProvider,
    OllamaProvider,
    MockLlmProvider,
  ],
})
export class LlmModule {
  static forTest(mockProviderOverride?: Provider): DynamicModule {
    return {
      module: LlmModule,
      imports: [ConfigModule],
      providers: [
        EdmoLogger,
        mockProviderOverride || {
          provide: LLM_PROVIDER_TOKEN,
          useClass: MockLlmProvider,
        },
        LlmService,
      ],
      exports: [LlmService, LLM_PROVIDER_TOKEN],
    };
  }
}
