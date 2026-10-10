import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import * as fs from 'fs';
import * as path from 'path';
import * as request from 'supertest';
import { AppModule } from '../../src/app.module';
import { LlmService } from '../../src/llm/services/llm.service';

describe('Live C++ Engines End-to-End Test', () => {
  let app: INestApplication;
  let llmService: LlmService;
  const fixturePath = path.resolve(
    __dirname,
    '../../../OCR Layer/tests/fixtures/digital-transcript.pdf',
  );

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
    llmService = app.get(LlmService);
  });

  afterAll(async () => {
    await app.close();
  });

  it('should process a real transcript PDF through live C++ OCR and Evidence Engine with 0 unaccounted loss', async () => {
    if (!fs.existsSync(fixturePath)) {
      console.warn(`Fixture not found at ${fixturePath}, skipping live test.`);
      return;
    }

    const pdfBuffer = await fs.promises.readFile(fixturePath);

    const res = await request(app.getHttpServer())
      .post('/v1/documents/process')
      .attach('file', pdfBuffer, 'digital-transcript.pdf')
      .field('documentType', 'transcript')
      .field('runLlm', 'false')
      .field('debug', 'false')
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.document).toBeDefined();
    expect(res.body.document.document_id).toMatch(/^doc_\d+_[a-f0-9]+$/);
    expect(res.body.document_analysis.page_count).toBe(2);
    expect(res.body.document_analysis.native_text_pages + res.body.document_analysis.ocr_pages).toBe(2);
    expect(res.body.document_analysis.strategy).toBe('ADAPTIVE');
    expect(res.body.edr.available).toBe(true);
    expect(res.body.evidence.available).toBe(true);
    expect(res.body.evidence.zero_loss_verified).toBe(true);
    expect(res.body.evidence.unaccounted_loss).toBe(0);
    expect(res.body.llm.called).toBe(false);

    if (res.body.llm.required) {
      expect(res.body.pipeline.status).toBe('LLM_RESOLUTION_REQUIRED');
      expect(res.body.document_readiness).toBe('RESOLUTION_PENDING');
      expect(res.body.next_action).toBe('RUN_LLM');
      expect(res.body.resolution_request).toBeDefined();
      expect(res.body.final_document).toBeUndefined();
    } else {
      expect(res.body.pipeline.status).toBe('FINAL_DOCUMENT_READY');
      expect(res.body.document_readiness).toBe('READY');
      expect(res.body.final_document).toBeDefined();
    }

    expect(res.body.llm_context).toHaveProperty('schema_version');
    expect(res.body.performance.total_ms).toBeGreaterThan(0);
    expect(res.body.performance.stages.ocr_ms).toBeGreaterThan(0);
    expect(res.body.performance.stages.evidence_ms).toBeGreaterThan(0);
  });

  it('should process a transcript and resolve tasks with LLM when runLlm=true', async () => {
    if (!fs.existsSync(fixturePath)) {
      return;
    }

    jest.spyOn(llmService, 'generateStructured').mockImplementation(async (req) => {
      let tasks: any[] = [];
      try {
        const startIdx = req.prompt.indexOf('{');
        const endIdx = req.prompt.lastIndexOf('}');
        if (startIdx !== -1 && endIdx !== -1) {
          const parsed = JSON.parse(req.prompt.substring(startIdx, endIdx + 1));
          tasks = parsed.tasks || [];
        }
      } catch {}

      const resolutions = tasks.map((t: any) => ({
        task_id: t.task_id,
        patch_id: `patch_${t.task_id}`,
        field: t.field,
        status: 'RESOLVED',
        value: t.current_value || t.ocr_value || 'Artificial Intelligence: Principles & Techniques',
        corrected_value: t.current_value || t.ocr_value || 'Artificial Intelligence: Principles & Techniques',
        original_value: t.current_value || t.ocr_value || '',
        confidence: 0.99,
        llm_confidence: 0.99,
        resolution_method: 'LLM',
        reason: 'OCR correction',
        source: { page: t.evidence?.target?.page || t.source?.page || 1 },
      }));

      return {
        data: { resolutions },
        rawText: JSON.stringify({ resolutions }),
        model: 'qwen3:8b',
        provider: 'mock',
        latencyMs: 10,
        parseError: undefined,
      };
    });

    const pdfBuffer = await fs.promises.readFile(fixturePath);

    const res = await request(app.getHttpServer())
      .post('/v1/documents/process')
      .attach('file', pdfBuffer, 'digital-transcript.pdf')
      .field('documentType', 'transcript')
      .field('runLlm', 'true')
      .field('debug', 'false')
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.pipeline.status).toBe('FINAL_DOCUMENT_READY');
    expect(['READY', 'PARTIAL']).toContain(res.body.document_readiness);
    expect(res.body.final_document).toBeDefined();
    expect(res.body.final_document).toHaveProperty('schema_version', 'ocr-final-document-0.1');
    expect(res.body.final_document).toHaveProperty('confidence');
    expect(res.body.final_document.confidence).toHaveProperty('overall');
    expect(res.body.final_document.confidence).toHaveProperty('extraction');
    expect(res.body.final_document.confidence).toHaveProperty('resolved_field');
  });
});
