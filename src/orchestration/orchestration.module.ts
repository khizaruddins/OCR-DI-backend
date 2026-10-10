import { Module } from '@nestjs/common';
import { OcrLogger } from '../common/logger.service';
import { LlmModule } from '../llm/llm.module';
import { ArtifactService } from './artifact.service';
import { DocumentProcessingController } from './document-processing.controller';
import { DocumentProcessingService } from './document-processing.service';
import { DocumentWorkspaceService } from './document-workspace.service';
import { EvidenceEngineService } from './evidence-engine.service';
import { OcrEngineService } from './ocr-engine.service';
import { ProcessRunnerService } from './process-runner.service';

@Module({
  imports: [LlmModule],
  controllers: [DocumentProcessingController],
  providers: [
    OcrLogger,
    ProcessRunnerService,
    DocumentWorkspaceService,
    OcrEngineService,
    EvidenceEngineService,
    ArtifactService,
    DocumentProcessingService,
  ],
  exports: [
    OcrLogger,
    ProcessRunnerService,
    DocumentWorkspaceService,
    OcrEngineService,
    EvidenceEngineService,
    ArtifactService,
    DocumentProcessingService,
  ],
})
export class OrchestrationModule {}
