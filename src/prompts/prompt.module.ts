import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { OcrLogger } from '../common/logger.service';
import { PromptBuilderService } from './prompt-builder.service';

@Module({
  imports: [ConfigModule],
  providers: [OcrLogger, PromptBuilderService],
  exports: [PromptBuilderService],
})
export class PromptModule {}
