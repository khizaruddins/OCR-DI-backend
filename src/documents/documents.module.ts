import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EdmoLogger } from '../common/logger.service';
import { ContextModule } from '../context/context.module';
import { ExtractionModule } from '../extraction/extraction.module';
import { LlmModule } from '../llm/llm.module';
import { ValidationModule } from '../validation/validation.module';
import { DocumentsController } from './documents.controller';
import { DocumentsService } from './documents.service';

@Module({
  imports: [
    ConfigModule,
    ContextModule,
    ExtractionModule,
    ValidationModule,
    LlmModule,
  ],
  controllers: [DocumentsController],
  providers: [EdmoLogger, DocumentsService],
  exports: [DocumentsService],
})
export class DocumentsModule {}
