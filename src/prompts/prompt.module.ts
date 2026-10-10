import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EdmoLogger } from '../common/logger.service';
import { PromptBuilderService } from './prompt-builder.service';

@Module({
  imports: [ConfigModule],
  providers: [EdmoLogger, PromptBuilderService],
  exports: [PromptBuilderService],
})
export class PromptModule {}
