import { Module } from '@nestjs/common';
import { EdmoLogger } from '../common/logger.service';
import { LlmModule } from '../llm/llm.module';
import { OrchestrationModule } from '../orchestration/orchestration.module';
import { HealthController } from './health.controller';

@Module({
  imports: [LlmModule, OrchestrationModule],
  controllers: [HealthController],
  providers: [EdmoLogger],
})
export class HealthModule {}
