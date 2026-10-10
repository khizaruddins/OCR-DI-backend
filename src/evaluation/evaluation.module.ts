import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { OcrLogger } from '../common/logger.service';
import { ContextModule } from '../context/context.module';
import { DocumentsModule } from '../documents/documents.module';
import { BenchmarkService } from './benchmark.service';
import { EvaluationService } from './evaluation.service';

@Module({
  imports: [ConfigModule, ContextModule, DocumentsModule],
  providers: [OcrLogger, BenchmarkService, EvaluationService],
  exports: [BenchmarkService, EvaluationService],
})
export class EvaluationModule {}
