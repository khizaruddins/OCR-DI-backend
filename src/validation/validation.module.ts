import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EdmoLogger } from '../common/logger.service';
import { ExtractionModule } from '../extraction/extraction.module';
import { EvidenceValidatorService } from './evidence-validator.service';
import { ExtractionValidatorService } from './extraction-validator.service';
import { NormalizationService } from './normalization.service';
import { SchemaValidatorService } from './schema-validator.service';

@Module({
  imports: [ConfigModule, ExtractionModule],
  providers: [
    EdmoLogger,
    SchemaValidatorService,
    EvidenceValidatorService,
    NormalizationService,
    ExtractionValidatorService,
  ],
  exports: [
    SchemaValidatorService,
    EvidenceValidatorService,
    NormalizationService,
    ExtractionValidatorService,
  ],
})
export class ValidationModule {}
