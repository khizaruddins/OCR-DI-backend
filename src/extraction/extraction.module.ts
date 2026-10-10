import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EdmoLogger } from '../common/logger.service';
import { ContextModule } from '../context/context.module';
import { LlmModule } from '../llm/llm.module';
import { PromptModule } from '../prompts/prompt.module';
import { DocumentRouterService } from './document-router.service';
import { ExtractionService } from './extraction.service';

@Module({
  imports: [ConfigModule, LlmModule, PromptModule, ContextModule],
  providers: [EdmoLogger, DocumentRouterService, ExtractionService],
  exports: [DocumentRouterService, ExtractionService],
})
export class ExtractionModule {}
