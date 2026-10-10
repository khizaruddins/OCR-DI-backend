import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { OcrLogger } from '../common/logger.service';
import { ContextLoaderService } from './context-loader.service';
import { ContextValidatorService } from './context-validator.service';

@Module({
  imports: [ConfigModule],
  providers: [OcrLogger, ContextValidatorService, ContextLoaderService],
  exports: [ContextValidatorService, ContextLoaderService],
})
export class ContextModule {}
