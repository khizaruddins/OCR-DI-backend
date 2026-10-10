import { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Test, TestingModule } from '@nestjs/testing';
import * as request from 'supertest';
import { AppModule } from '../../src/app.module';

describe('Swagger Documentation (Integration)', () => {
  let app: INestApplication;
  let swaggerDocument: any;

  beforeAll(async () => {
    process.env.LLM_PROVIDER = 'mock';

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();

    const config = new DocumentBuilder()
      .setTitle('OCR Document Intelligence Engine (LLM Backend)')
      .setDescription('API documentation for OCR DI LLM backend')
      .setVersion('0.1.0')
      .addTag('Document Intelligence')
      .addTag('Health')
      .build();

    swaggerDocument = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('docs', app, swaggerDocument);

    await app.init();
  });

  afterAll(async () => {
    delete process.env.LLM_PROVIDER;
    await app.close();
  });

  it('should generate valid OpenAPI 3.0 document with expected info', () => {
    expect(swaggerDocument).toBeDefined();
    expect(swaggerDocument.openapi).toMatch(/^3\./);
    expect(swaggerDocument.info.title).toBe('OCR Document Intelligence Engine (LLM Backend)');
    expect(swaggerDocument.info.version).toBe('0.1.0');
  });

  it('should document all endpoints', () => {
    const paths = swaggerDocument.paths;
    expect(paths['/v1/intelligence/extract']).toBeDefined();
    expect(paths['/v1/intelligence/extract'].post).toBeDefined();

    expect(paths['/v1/intelligence/extract-file']).toBeDefined();
    expect(paths['/v1/intelligence/extract-file'].post).toBeDefined();

    expect(paths['/v1/models']).toBeDefined();
    expect(paths['/v1/models'].get).toBeDefined();

    expect(paths['/health']).toBeDefined();
    expect(paths['/health'].get).toBeDefined();

    expect(paths['/health/llm']).toBeDefined();
    expect(paths['/health/llm'].get).toBeDefined();
  });

  it('should document expected request and response schemas', () => {
    const schemas = swaggerDocument.components.schemas;
    expect(schemas).toBeDefined();
    expect(schemas.ExtractRequestDto).toBeDefined();
    expect(schemas.ExtractFileRequestDto).toBeDefined();
    expect(schemas.ExtractResponseDto).toBeDefined();
    expect(schemas.HealthResponseDto).toBeDefined();
    expect(schemas.LlmHealthResponseDto).toBeDefined();
    expect(schemas.LlmModelInfoResponseDto).toBeDefined();
  });

  it('should serve Swagger UI HTML on /docs', async () => {
    const response = await request(app.getHttpServer())
      .get('/docs/')
      .expect(200);

    expect(response.text).toContain('swagger-ui');
  });

  it('should serve OpenAPI JSON specification on /docs-json', async () => {
    const response = await request(app.getHttpServer())
      .get('/docs-json')
      .expect(200);

    expect(response.body.openapi).toMatch(/^3\./);
    expect(response.body.info.title).toBe('OCR Document Intelligence Engine (LLM Backend)');
    expect(response.body.paths['/v1/intelligence/extract']).toBeDefined();
  });
});
