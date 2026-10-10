import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EdmoLogger } from '../common/logger.service';
import { ContextLoaderService } from './context-loader.service';
import { ContextValidatorService } from './context-validator.service';

@Module({
  imports: [ConfigModule],
  providers: [EdmoLogger, ContextValidatorService, ContextLoaderService],
  exports: [ContextValidatorService, ContextLoaderService],
})
export class ContextModule {}
