import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import * as request from 'supertest';
import { AppModule } from '../../src/app.module';
import { LlmService } from '../../src/llm/services/llm.service';
import { EvidenceEngineService } from '../../src/orchestration/evidence-engine.service';
import { OcrEngineService } from '../../src/orchestration/ocr-engine.service';

describe('Document Processing Pipeline (Integration)', () => {
  let app: INestApplication;
  let ocrEngineService: OcrEngineService;
  let evidenceEngineService: EvidenceEngineService;
  let llmService: LlmService;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    ocrEngineService = app.get(OcrEngineService);
    evidenceEngineService = app.get(EvidenceEngineService);
    llmService = app.get(LlmService);
  });

  afterAll(async () => {
    await app.close();
  });

  describe('Health Probes', () => {
    it('GET /health/ocr returns OCR status', async () => {
      const res = await request(app.getHttpServer()).get('/health/ocr').expect(200);
      expect(res.body).toHaveProperty('status');
      expect(res.body).toHaveProperty('available');
    });

    it('GET /health/evidence returns Evidence Engine status', async () => {
      const res = await request(app.getHttpServer()).get('/health/evidence').expect(200);
      expect(res.body).toHaveProperty('status');
      expect(res.body).toHaveProperty('available');
    });

    it('GET /health/pipeline returns consolidated health', async () => {
      const res = await request(app.getHttpServer()).get('/health/pipeline').expect(200);
      expect(res.body).toHaveProperty('ocr');
      expect(res.body).toHaveProperty('evidence');
      expect(res.body).toHaveProperty('llm');
    }, 15000);
  });

  describe('POST /v1/documents/process', () => {
    it('should return 400 if no file is uploaded', async () => {
      await request(app.getHttpServer())
        .post('/v1/documents/process')
        .expect(400);
    });

    it('should successfully orchestrate pipeline on mocked engines', async () => {
      jest.spyOn(ocrEngineService, 'processDocument').mockResolvedValue({
        success: true,
        exitCode: 0,
        executionTimeMs: 12,
        edrPath: '/tmp/test/edr_full.json',
        rawOcrPath: '/tmp/test/raw_ocr.json',
        edrFullJson: {
          schema_version: 'edr-0.2',
          document: { type: 'transcript', page_count: 2 },
          processing_manifest: {
            strategy: 'ADAPTIVE',
            document: { type: 'DIGITAL_TEXT' },
            pages: { native_text: 2, ocr: 0 },
          },
        },
        pageCount: 2,
        documentType: 'transcript',
        documentClassification: 'DIGITAL_TEXT',
        nativeTextPages: 2,
        ocrPages: 0,
        strategy: 'ADAPTIVE',
      });

      jest.spyOn(evidenceEngineService, 'processEvidence').mockResolvedValue({
        success: true,
        exitCode: 0,
        executionTimeMs: 20,
        evidenceFullPath: '/tmp/test/evidence-full.json',
        evidenceLlmPath: '/tmp/test/evidence-llm.json',
        evidenceReportPath: '/tmp/test/evidence-report.json',
        evidenceFullJson: {},
        evidenceLlmJson: {
          schema_version: 'edmo-llm-context-0.1',
          document: { id: 'doc_mock_123', type: 'transcript', page_count: 2 },
          llm_required: true,
          tasks: [
            {
              task_id: 'resolve_1',
              field: 'course_title',
              ocr_value: 'MATHEMAT1CS',
              confidence: 0.85,
            },
          ],
        },
        evidenceReportJson: {
          schema_version: 'evidence-report-0.1',
          coverage: { unaccounted_loss: 0 },
        },
        zeroLossVerified: true,
        unaccountedLoss: 0,
        llmRequired: true,
        taskCount: 1,
        estimatedTokens: 140,
        averageConfidence: 0.95,
        correctionsAttempted: 8,
        correctionsApplied: 1,
      });

      const res = await request(app.getHttpServer())
        .post('/v1/documents/process')
        .attach('file', Buffer.from('%PDF-1.4 mock transcript'), 'test_transcript.pdf')
        .field('documentType', 'transcript')
        .field('runLlm', 'false')
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.document).toHaveProperty('document_id');
      expect(res.body.document_analysis.native_text_pages).toBe(2);
      expect(res.body.document_analysis.ocr_pages).toBe(0);
      expect(res.body.evidence.zero_loss_verified).toBe(true);
      expect(res.body.llm.required).toBe(true);
      expect(res.body.llm.called).toBe(false);
      expect(res.body.llm_context).toHaveProperty('tasks');
      expect(res.body.performance.stages.ocr_ms).toBeGreaterThanOrEqual(0);
      expect(res.body.performance.stages.evidence_ms).toBeGreaterThanOrEqual(0);
    });

    it('should successfully orchestrate reverse path LLM patch merge when runLlm=true', async () => {
      jest.spyOn(ocrEngineService, 'processDocument').mockResolvedValue({
        success: true,
        exitCode: 0,
        executionTimeMs: 12,
        edrPath: '/tmp/test/edr_full.json',
        rawOcrPath: '/tmp/test/raw_ocr.json',
        edrFullJson: {
          schema_version: 'edr-0.2',
          document: { id: 'doc_mock_123', type: 'transcript', page_count: 2 },
          processing_manifest: {
            strategy: 'ADAPTIVE',
            document: { type: 'DIGITAL_TEXT' },
            pages: { native_text: 2, ocr: 0 },
          },
        },
        pageCount: 2,
        documentType: 'transcript',
        documentClassification: 'DIGITAL_TEXT',
        nativeTextPages: 2,
        ocrPages: 0,
        strategy: 'ADAPTIVE',
      });

      jest.spyOn(evidenceEngineService, 'processEvidence').mockResolvedValue({
        success: true,
        exitCode: 0,
        executionTimeMs: 20,
        evidenceFullPath: '/tmp/test/evidence-full.json',
        evidenceLlmPath: '/tmp/test/evidence-llm.json',
        evidenceReportPath: '/tmp/test/evidence-report.json',
        evidenceFullJson: {},
        evidenceLlmJson: {
          schema_version: 'edmo-llm-context-0.1',
          document: { id: 'doc_mock_123', type: 'transcript', page_count: 2 },
          llm_required: true,
          tasks: [
            {
              task_id: 'resolve_001',
              field: 'course_title',
              ocr_value: 'MATHEMAT1CS',
              confidence: 0.85,
            },
          ],
        },
        evidenceReportJson: {
          schema_version: 'evidence-report-0.1',
          coverage: { unaccounted_loss: 0 },
        },
        zeroLossVerified: true,
        unaccountedLoss: 0,
        llmRequired: true,
        taskCount: 1,
        estimatedTokens: 140,
        averageConfidence: 0.95,
        correctionsAttempted: 8,
        correctionsApplied: 1,
      });

      jest.spyOn(llmService, 'generateStructured').mockResolvedValue({
        data: {
          results: [
            {
              patch_id: 'patch_001',
              task_id: 'resolve_001',
              field: 'course_title',
              original_value: 'MATHEMAT1CS',
              corrected_value: 'MATHEMATICS',
              confidence: 0.95,
              reason_code: 'OCR_CORRECTION',
              evidence_supported: true,
            },
          ],
        },
        provider: 'mock',
        model: 'qwen3-8b',
        latencyMs: 5,
        rawText: '{"results": []}',
        parseError: undefined,
      });

      jest.spyOn(evidenceEngineService, 'mergeLlmPatches').mockResolvedValue({
        enhancedEdrPath: '/tmp/test/enhanced_edr.json',
        finalDocumentPath: '/tmp/test/final_document.json',
        patchReportPath: '/tmp/test/patch-report.json',
        enhancedEdrJson: {
          schema_version: 'edr-enhanced-0.1',
          document_id: 'doc_mock_123',
          audit: { unaccounted_loss: 0, zero_loss: true },
        },
        finalDocumentJson: {
          document_type: 'transcript',
          document_id: 'doc_mock_123',
          student: { name: 'Marcus Thorne' },
          courses: [{ course_title: 'MATHEMATICS', confidence: 0.94, resolution_method: 'LLM' }],
        },
        patchReportJson: {
          document_id: 'doc_mock_123',
          patches: { received: 1, accepted: 1, rejected: 0 },
        },
        executionTimeMs: 5,
      });

      const res = await request(app.getHttpServer())
        .post('/v1/documents/process')
        .attach('file', Buffer.from('%PDF-1.4 mock transcript'), 'test_transcript.pdf')
        .field('documentType', 'transcript')
        .field('runLlm', 'true')
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.pipeline.status).toBe('FINAL_DOCUMENT_READY');
      expect(res.body.enhanced_edr).toHaveProperty('schema_version', 'edr-enhanced-0.1');
      expect(res.body.final_document).toHaveProperty('courses');
      expect(res.body.result).toHaveProperty('courses');
      expect(res.body.patch_report).toHaveProperty('patches');
    });
  });
});
