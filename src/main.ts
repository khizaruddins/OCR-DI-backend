import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { OcrLogger } from './common/logger.service';
import { LlmService } from './llm/services/llm.service';

async function bootstrap() {
  const logger = new OcrLogger();
  const app = await NestFactory.create(AppModule, {
    logger,
  });

  // Enable CORS for universal API access and frontend integrations
  app.enableCors();

  const port = process.env.PORT || 3000;

  // Global prefix for universal API
  app.setGlobalPrefix('');

  // Configure Swagger OpenAPI Documentation
  const swaggerConfig = new DocumentBuilder()
    .setTitle('OCR Document Processing & Evidence Intelligence Platform')
    .setDescription(
      'End-to-End Intelligent Document Processing orchestrating C++ Document Processing/OCR Engine v0.2, C++ Evidence Intelligence Engine v0.1, and Selective LLM Semantic Resolvers.\n\n' +
        '### Pipeline Flow\n' +
        '1. **Upload & Preflight Ingestion**: Ingests PDF/Images, checks vector streams in $<3\\text{ms}$.\n' +
        '2. **Adaptive Execution**: Digital pages bypass OCR in milliseconds; Scanned pages undergo CV deskewing and OCR.\n' +
        '3. **Full EDR**: Reconstructs reading order, tables, key-value sections, and token confidence.\n' +
        '4. **Evidence Intelligence**: Deterministic OCR correction, dictionary validation, fuzzy matching, and zero-loss audit.\n' +
        '5. **Targeted LLM Resolution**: Generates minimal `evidence-llm.json` context packet containing only unresolved fields.\n' +
        '6. **Selective LLM Inference (Optional)**: If `runLlm=true`, resolves edge-case ambiguities through LM Studio / Ollama.',
    )
    .setVersion('0.2.0')
    .addTag('Document Processing', 'End-to-end document upload, preflight, OCR, Full EDR, and Evidence Engine orchestration')
    .addTag('Document Intelligence', 'Structured extraction and pipeline orchestration endpoints')
    .addTag('Health', 'Service, OCR Engine, Evidence Engine, and LLM inference engine connectivity probes')
    .build();

  const swaggerDocument = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('docs', app, swaggerDocument, {
    swaggerOptions: {
      docExpansion: 'list',
      filter: true,
      showRequestDuration: true,
      persistAuthorization: true,
    },
    customSiteTitle: 'OCR DI LLM Backend - API Docs',
  });

  // Also setup alias on /api-docs and /swagger
  SwaggerModule.setup('api-docs', app, swaggerDocument, {
    swaggerOptions: {
      docExpansion: 'list',
      filter: true,
      showRequestDuration: true,
    },
    customSiteTitle: 'OCR DI LLM Backend - API Docs',
  });

  await app.listen(port);

  logger.log(`=======================================================`);
  logger.log(`  OCR Document Intelligence Engine (LLM Backend) v0.1`);
  logger.log(`  Listening on: http://localhost:${port}`);
  logger.log(`  Swagger UI:   http://localhost:${port}/docs`);
  logger.log(`  OpenAPI JSON: http://localhost:${port}/docs-json`);
  logger.log(`=======================================================`);

  // Non-blocking runtime health probe for LLM Provider
  try {
    const llmService = app.get(LlmService);
    const health = await llmService.healthCheck();
    if (health.available) {
      logger.log(`LLM Provider Connected: [${health.provider}] Model: [${health.model}] (Status: HEALTHY)`);
    } else {
      logger.warn(`LLM Provider Degraded: ${health.reason}`);
      logger.warn(`Service started successfully. LLM requests will be queued or rejected until LLM provider is online.`);
    }
  } catch (err: unknown) {
    logger.warn(`Could not probe LLM Provider during startup: ${String(err)}`);
  }
}

bootstrap();
