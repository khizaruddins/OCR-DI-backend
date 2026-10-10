import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import * as fs from 'fs';
import * as path from 'path';
import * as request from 'supertest';
import { AppModule } from '../../src/app.module';

describe('Live Debug Raw OCR Extraction API End-to-End Test', () => {
  let app: INestApplication;
  const sophiaPdfPath = '/home/khizaruddin/Downloads/Sophia Jones Transcript.pdf';
  const fixturePdfPath = path.resolve(
    __dirname,
    '../../../OCR Layer/tests/fixtures/digital-transcript.pdf',
  );

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('POST /api/debug/ocr/raw should run existing OCR engine and return raw JSON with mode RAW_OCR_ONLY', async () => {
    const targetFile = fs.existsSync(fixturePdfPath) ? fixturePdfPath : sophiaPdfPath;
    const fileBuffer = await fs.promises.readFile(targetFile);

    const res = await request(app.getHttpServer())
      .post('/api/debug/ocr/raw')
      .attach('file', fileBuffer, path.basename(targetFile))
      .field('output_format', 'json')
      .field('include_artifacts', 'true')
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.mode).toBe('RAW_OCR_ONLY');
    expect(res.body.document).toBeDefined();
    expect(res.body.document.filename).toBe(path.basename(targetFile));
    expect(res.body.document.page_count).toBeGreaterThanOrEqual(1);

    expect(res.body.ocr).toBeDefined();
    expect(res.body.ocr.status).toBe('COMPLETED');
    expect(res.body.ocr.engine).toBe('ocr-engine');
    expect(res.body.ocr.execution_time_ms).toBeGreaterThanOrEqual(0);
    expect(res.body.ocr.raw_output).toBeDefined();
    expect(res.body.ocr.raw_output.schema_version).toBeDefined();
    expect(res.body.ocr.raw_output.pages).toBeInstanceOf(Array);

    expect(res.body.downstream_stages).toEqual({
      edr: 'NOT_EXECUTED',
      evidence: 'NOT_EXECUTED',
      llm: 'NOT_EXECUTED',
      enhanced_edr: 'NOT_EXECUTED',
      final_projection: 'NOT_EXECUTED',
    });

    expect(res.body.ocr.artifacts).toBeInstanceOf(Array);
    expect(res.body.ocr.artifacts.length).toBeGreaterThanOrEqual(1);
  });

  it('POST /api/debug/ocr/raw with output_format=text should return raw recognized text as text/plain', async () => {
    const targetFile = fs.existsSync(fixturePdfPath) ? fixturePdfPath : sophiaPdfPath;
    const fileBuffer = await fs.promises.readFile(targetFile);

    const res = await request(app.getHttpServer())
      .post('/api/debug/ocr/raw')
      .attach('file', fileBuffer, path.basename(targetFile))
      .field('output_format', 'text')
      .expect(200);

    expect(res.header['content-type']).toContain('text/plain');
    expect(typeof res.text).toBe('string');
    expect(res.text.length).toBeGreaterThan(0);
  });
});
