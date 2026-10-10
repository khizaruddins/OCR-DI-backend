import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EdmoLogger } from './common/logger.service';
import configuration from './config/configuration';
import { validateEnvironment } from './config/validation';
import { ContextModule } from './context/context.module';
import { DocumentsModule } from './documents/documents.module';
import { EvaluationModule } from './evaluation/evaluation.module';
import { ExtractionModule } from './extraction/extraction.module';
import { HealthModule } from './health/health.module';
import { LlmModule } from './llm/llm.module';
import { OrchestrationModule } from './orchestration/orchestration.module';
import { PromptModule } from './prompts/prompt.module';
import { ValidationModule } from './validation/validation.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      validate: validateEnvironment,
    }),
    LlmModule,
    ContextModule,
    PromptModule,
    ExtractionModule,
    ValidationModule,
    DocumentsModule,
    OrchestrationModule,
    HealthModule,
    EvaluationModule,
  ],
  providers: [EdmoLogger],
  exports: [EdmoLogger],
})
export class AppModule {}
