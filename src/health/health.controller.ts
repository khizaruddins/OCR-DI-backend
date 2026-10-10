import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { LlmService } from '../llm/services/llm.service';
import { EvidenceEngineService } from '../orchestration/evidence-engine.service';
import { OcrEngineService } from '../orchestration/ocr-engine.service';
import {
  HealthResponseDto,
  LlmHealthResponseDto,
} from './dto/health-response.dto';

@ApiTags('Health')
@Controller('health')
export class HealthController {
  constructor(
    private readonly llmService: LlmService,
    private readonly ocrEngine: OcrEngineService,
    private readonly evidenceEngine: EvidenceEngineService,
  ) {}

  @Get()
  @ApiOperation({
    summary: 'Check service & engine runtime health',
    description:
      'Provides an overarching health status of the EDMO platform, including OCR Engine, Evidence Engine, and LLM provider connectivity.',
  })
  @ApiOkResponse({
    description: 'System health status information',
    type: HealthResponseDto,
  })
  async getHealth(): Promise<HealthResponseDto> {
    const [llmHealth, ocrHealth, evidenceHealth] = await Promise.all([
      this.llmService.healthCheck(),
      this.ocrEngine.getHealth(),
      this.evidenceEngine.getHealth(),
    ]);

    const isHealthy = ocrHealth.available && evidenceHealth.available;
    const serviceStatus = isHealthy ? 'healthy' : 'degraded';

    const healthInfo = {
      provider: llmHealth.provider,
      model: llmHealth.model,
      status: llmHealth.status,
      available: llmHealth.available,
      reason: llmHealth.reason,
    };

    return {
      service: 'edmo-di-llm-backend',
      version: '0.1.0',
      status: serviceStatus,
      llm: healthInfo,
      ollama: healthInfo,
    };
  }

  @Get('ocr')
  @ApiOperation({
    summary: 'Probe OCR Engine binary status',
    description: 'Verifies existence, permissions, and availability of the C++ EDMO OCR Engine binary.',
  })
  @ApiOkResponse({
    description: 'OCR Engine health status',
    schema: {
      example: {
        status: 'healthy',
        binary: '/path/to/edmo-ocr',
        available: true,
        version: 'EDMO Document Processing & OCR Engine v0.2.0',
      },
    },
  })
  async getOcrHealth(): Promise<Record<string, unknown>> {
    const health = await this.ocrEngine.getHealth();
    return {
      status: health.available ? 'healthy' : 'unavailable',
      ...health,
    };
  }

  @Get('evidence')
  @ApiOperation({
    summary: 'Probe Evidence Intelligence Engine binary status',
    description: 'Verifies existence, permissions, and availability of the C++ Evidence Intelligence Engine binary.',
  })
  @ApiOkResponse({
    description: 'Evidence Engine health status',
    schema: {
      example: {
        status: 'healthy',
        binary: '/path/to/edmo-evidence',
        available: true,
        version: '0.1.0',
      },
    },
  })
  async getEvidenceHealth(): Promise<Record<string, unknown>> {
    const health = await this.evidenceEngine.getHealth();
    return {
      status: health.available ? 'healthy' : 'unavailable',
      ...health,
    };
  }

  @Get('pipeline')
  @ApiOperation({
    summary: 'Probe full Document Intelligence pipeline status',
    description: 'Returns consolidated status of OCR Engine, Evidence Engine, and LLM provider.',
  })
  @ApiOkResponse({
    description: 'Pipeline health status',
    schema: {
      example: {
        status: 'healthy',
        ocr: true,
        evidence: true,
        llm: true,
      },
    },
  })
  async getPipelineHealth(): Promise<Record<string, unknown>> {
    const [llmHealth, ocrHealth, evidenceHealth] = await Promise.all([
      this.llmService.healthCheck(),
      this.ocrEngine.getHealth(),
      this.evidenceEngine.getHealth(),
    ]);

    const isHealthy = ocrHealth.available && evidenceHealth.available;

    return {
      status: isHealthy ? 'healthy' : 'degraded',
      ocr: ocrHealth.available,
      evidence: evidenceHealth.available,
      llm: llmHealth.available,
      details: {
        ocr: ocrHealth,
        evidence: evidenceHealth,
        llm: llmHealth,
      },
    };
  }

  @Get('llm')
  @ApiOperation({
    summary: 'Probe LLM provider connectivity',
    description:
      'Directly tests connection to the underlying LLM provider endpoint (LM Studio / Ollama) and verifies model readiness.',
  })
  @ApiOkResponse({
    description: 'Direct LLM provider probe result',
    type: LlmHealthResponseDto,
  })
  async getLlmHealth(): Promise<LlmHealthResponseDto> {
    return this.llmService.healthCheck();
  }
}
