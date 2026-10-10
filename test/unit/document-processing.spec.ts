import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OcrLogger } from '../../src/common/logger.service';
import { LlmService } from '../../src/llm/services/llm.service';
import { ArtifactService } from '../../src/orchestration/artifact.service';
import { DocumentProcessingService } from '../../src/orchestration/document-processing.service';
import { DocumentWorkspaceService } from '../../src/orchestration/document-workspace.service';
import { EvidenceEngineService } from '../../src/orchestration/evidence-engine.service';
import { OcrEngineService } from '../../src/orchestration/ocr-engine.service';
import { ProcessRunnerService } from '../../src/orchestration/process-runner.service';

describe('DocumentProcessingService (Unit)', () => {
  let service: DocumentProcessingService;
  let workspaceService: DocumentWorkspaceService;
  let ocrEngine: OcrEngineService;
  let evidenceEngine: EvidenceEngineService;
  let artifactService: ArtifactService;
  let llmService: LlmService;
  let configService: ConfigService;
  let logger: OcrLogger;

  beforeEach(() => {
    logger = new OcrLogger();
    jest.spyOn(logger, 'log').mockImplementation(() => {});
    jest.spyOn(logger, 'warn').mockImplementation(() => {});
    jest.spyOn(logger, 'error').mockImplementation(() => {});

    configService = {
      get: jest.fn((key: string) => {
        if (key === 'orchestrator.workDir') return '/tmp/ocr_test';
        if (key === 'orchestrator.maxFileSizeMb') return 50;
        if (key === 'orchestrator.keepArtifacts') return false;
        return undefined;
      }),
    } as unknown as ConfigService;

    const runner = new ProcessRunnerService(logger);
    workspaceService = new DocumentWorkspaceService(configService, logger);
    ocrEngine = new OcrEngineService(configService, runner, logger);
    evidenceEngine = new EvidenceEngineService(configService, runner, logger);
    artifactService = new ArtifactService(configService, logger);

    llmService = {
      generateStructured: jest.fn().mockResolvedValue({
        data: {
          results: [
            {
              task_id: 'resolve_1',
              field: 'course_title',
              original_value: 'MATHEMAT1CS',
              corrected_value: 'MATHEMATICS',
              confidence: 0.96,
            },
          ],
        },
        parseError: undefined,
      }),
    } as unknown as LlmService;

    service = new DocumentProcessingService(
      configService,
      workspaceService,
      ocrEngine,
      evidenceEngine,
      artifactService,
      llmService,
      logger,
    );
  });

  describe('Upload Validation', () => {
    it('should throw BadRequestException if file is empty', () => {
      const emptyFile = {
        buffer: Buffer.alloc(0),
        originalname: 'test.pdf',
        mimetype: 'application/pdf',
      } as Express.Multer.File;

      expect(() => service.validateUpload(emptyFile)).toThrow(BadRequestException);
    });

    it('should throw BadRequestException for unsupported file format', () => {
      const invalidFile = {
        buffer: Buffer.from('fake exe content'),
        originalname: 'program.exe',
        mimetype: 'application/x-msdownload',
      } as Express.Multer.File;

      expect(() => service.validateUpload(invalidFile)).toThrow(BadRequestException);
    });

    it('should accept valid PDF file buffer', () => {
      const validPdf = {
        buffer: Buffer.from('%PDF-1.4 sample content'),
        originalname: 'transcript.pdf',
        mimetype: 'application/pdf',
      } as Express.Multer.File;

      expect(() => service.validateUpload(validPdf)).not.toThrow();
    });

    it('should accept valid PNG and JPEG images', () => {
      const validPng = {
        buffer: Buffer.from('fake png content'),
        originalname: 'transcript.png',
        mimetype: 'image/png',
      } as Express.Multer.File;

      const validJpg = {
        buffer: Buffer.from('fake jpg content'),
        originalname: 'transcript.jpg',
        mimetype: 'image/jpeg',
      } as Express.Multer.File;

      expect(() => service.validateUpload(validPng)).not.toThrow();
      expect(() => service.validateUpload(validJpg)).not.toThrow();
    });
  });

  describe('Pipeline Execution Flow', () => {
    it('should return LLM_RESOLUTION_REQUIRED and block final document when llmRequired=true and runLlm=false (Mode A)', async () => {
      const validFile = {
        buffer: Buffer.from('%PDF-1.4 sample content'),
        originalname: 'test_transcript.pdf',
        mimetype: 'application/pdf',
      } as Express.Multer.File;

      jest.spyOn(ocrEngine, 'processDocument').mockResolvedValue({
        success: true,
        exitCode: 0,
        executionTimeMs: 15,
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

      jest.spyOn(evidenceEngine, 'processEvidence').mockResolvedValue({
        success: true,
        exitCode: 0,
        executionTimeMs: 25,
        evidenceFullPath: '/tmp/test/evidence-full.json',
        evidenceLlmPath: '/tmp/test/evidence-llm.json',
        evidenceReportPath: '/tmp/test/evidence-report.json',
        resolutionRequestJson: {
          schema_version: 'ocr-llm-resolution-request-0.1',
          document_id: 'doc_123',
          document_type: 'transcript',
          resolution_mode: 'FIELD_CORRECTION',
          instructions: {
            do_not_return_the_final_document: true,
            return_only_resolutions: true,
          },
          tasks: [
            {
              task_id: 'resolve_1',
              field: 'course_title',
              current_value: 'MATHEMAT1CS',
              status: 'LLM_REQUIRED',
            },
          ],
        },
        evidenceFullJson: {},
        evidenceLlmJson: {
          schema_version: 'ocr-llm-context-0.1',
          document: { id: 'doc_123', type: 'transcript' },
          llm_required: true,
          tasks: [
            {
              task_id: 'resolve_1',
              field: 'course_title',
              ocr_value: 'MATHEMAT1CS',
              confidence: 0.82,
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
        estimatedTokens: 120,
        averageConfidence: 0.94,
        correctionsAttempted: 10,
        correctionsApplied: 1,
      });

      const response = await service.processDocument(validFile, {
        runLlm: false,
        documentType: 'transcript',
      });

      expect(response.success).toBe(true);
      expect(response.pipeline.status).toBe('LLM_RESOLUTION_REQUIRED');
      expect(response.document_readiness).toBe('RESOLUTION_PENDING');
      expect(response.next_action).toBe('RUN_LLM');
      expect(response.resolution_request).toBeDefined();
      expect(response.final_document).toBeUndefined();
      expect(response.result).toBeUndefined();
      expect(response.document.document_type).toBe('transcript');
      expect(response.document_analysis.native_text_pages).toBe(2);
      expect(response.document_analysis.ocr_pages).toBe(0);
      expect(response.evidence.zero_loss_verified).toBe(true);
      expect(response.evidence.unaccounted_loss).toBe(0);
      expect(response.llm.required).toBe(true);
      expect(response.llm.called).toBe(false);
      expect(llmService.generateStructured).not.toHaveBeenCalled();
    });

    it('should invoke selective LLM resolver and merge patches when runLlm=true and tasks exist', async () => {
      const validFile = {
        buffer: Buffer.from('%PDF-1.4 sample content'),
        originalname: 'test_transcript.pdf',
        mimetype: 'application/pdf',
      } as Express.Multer.File;

      jest.spyOn(ocrEngine, 'processDocument').mockResolvedValue({
        success: true,
        exitCode: 0,
        executionTimeMs: 10,
        edrPath: '/tmp/test/edr_full.json',
        rawOcrPath: '/tmp/test/raw_ocr.json',
        edrFullJson: { schema_version: 'edr-0.2' },
        pageCount: 1,
        documentType: 'transcript',
        documentClassification: 'DIGITAL_TEXT',
        nativeTextPages: 1,
        ocrPages: 0,
        strategy: 'NATIVE_TEXT',
      });

      jest.spyOn(evidenceEngine, 'processEvidence').mockResolvedValue({
        success: true,
        exitCode: 0,
        executionTimeMs: 15,
        evidenceFullPath: '/tmp/test/evidence-full.json',
        evidenceLlmPath: '/tmp/test/evidence-llm.json',
        evidenceReportPath: '/tmp/test/evidence-report.json',
        resolutionRequestJson: {
          schema_version: 'ocr-llm-resolution-request-0.1',
          tasks: [{ task_id: 'resolve_1', field: 'course_title' }],
        },
        evidenceFullJson: {},
        evidenceLlmJson: {
          tasks: [{ task_id: 'resolve_1', field: 'course_title' }],
        },
        evidenceReportJson: { coverage: { unaccounted_loss: 0 } },
        zeroLossVerified: true,
        unaccountedLoss: 0,
        llmRequired: true,
        taskCount: 1,
        estimatedTokens: 120,
        averageConfidence: 0.94,
        correctionsAttempted: 5,
        correctionsApplied: 0,
      });

      jest.spyOn(evidenceEngine, 'mergeLlmPatches').mockResolvedValue({
        enhancedEdrPath: '/tmp/test/enhanced_edr.json',
        finalDocumentPath: '/tmp/test/final_document.json',
        patchReportPath: '/tmp/test/patch-report.json',
        enhancedEdrJson: {
          schema_version: 'edr-enhanced-0.1',
          document_id: 'doc_123',
          audit: { unaccounted_loss: 0, zero_loss: true },
        },
        finalDocumentJson: {
          schema_version: 'ocr-final-document-0.1',
          document: { document_id: 'doc_123', document_type: 'transcript', page_count: 1 },
          document_readiness: 'READY',
          student: { name: 'Marcus Thorne' },
          courses: [{ course_title: 'MATHEMATICS', confidence: 0.94, resolution_method: 'LLM' }],
        },
        patchReportJson: {
          document_id: 'doc_123',
          patches: { received: 1, accepted: 1, rejected: 0 },
        },
        executionTimeMs: 5,
      });

      const response = await service.processDocument(validFile, {
        runLlm: true,
      });

      expect(response.success).toBe(true);
      expect(response.pipeline.status).toBe('FINAL_DOCUMENT_READY');
      expect(response.document_readiness).toBe('READY');
      expect(response.llm.called).toBe(true);
      expect(response.llm.results).toBeDefined();
      expect(response.llm.results?.length).toBe(1);
      expect(response.result).toBeDefined();
      expect(response.result).toHaveProperty('schema_version', 'ocr-final-document-0.1');
      expect(llmService.generateStructured).toHaveBeenCalled();
      expect(evidenceEngine.mergeLlmPatches).toHaveBeenCalled();
    });

    it('should complete with FINAL_DOCUMENT_READY and READY readiness when no LLM is required (Mode B)', async () => {
      const validFile = {
        buffer: Buffer.from('%PDF-1.4 sample content'),
        originalname: 'clean_transcript.pdf',
        mimetype: 'application/pdf',
      } as Express.Multer.File;

      jest.spyOn(ocrEngine, 'processDocument').mockResolvedValue({
        success: true,
        exitCode: 0,
        executionTimeMs: 8,
        edrPath: '/tmp/test/edr_full.json',
        rawOcrPath: '/tmp/test/raw_ocr.json',
        edrFullJson: { schema_version: 'edr-0.2' },
        pageCount: 1,
        documentType: 'transcript',
        documentClassification: 'DIGITAL_TEXT',
        nativeTextPages: 1,
        ocrPages: 0,
        strategy: 'NATIVE_TEXT',
      });

      jest.spyOn(evidenceEngine, 'processEvidence').mockResolvedValue({
        success: true,
        exitCode: 0,
        executionTimeMs: 12,
        evidenceFullPath: '/tmp/test/evidence-full.json',
        evidenceLlmPath: '/tmp/test/evidence-llm.json',
        evidenceReportPath: '/tmp/test/evidence-report.json',
        enhancedEdrJson: {
          schema_version: 'edr-enhanced-0.1',
          document_id: 'doc_clean_001',
          audit: { unaccounted_loss: 0, zero_loss: true },
        },
        finalDocumentJson: {
          schema_version: 'ocr-final-document-0.1',
          document: { document_id: 'doc_clean_001', document_type: 'transcript', page_count: 1 },
          document_readiness: 'READY',
          student: { name: 'Alice Smith' },
          courses: [{ course_code: 'BIO 101', course_title: 'General Biology', credits: 3.0, grade: 'A', confidence: 0.99 }],
          confidence: { overall: 0.985, method: 'WEIGHTED_SEMANTIC_FIELDS' },
        },
        evidenceFullJson: {},
        evidenceLlmJson: { tasks: [] },
        evidenceReportJson: { coverage: { unaccounted_loss: 0 } },
        zeroLossVerified: true,
        unaccountedLoss: 0,
        llmRequired: false,
        taskCount: 0,
        estimatedTokens: 0,
        averageConfidence: 0.98,
        correctionsAttempted: 0,
        correctionsApplied: 0,
      });

      const response = await service.processDocument(validFile, { runLlm: false });

      expect(response.success).toBe(true);
      expect(response.pipeline.status).toBe('FINAL_DOCUMENT_READY');
      expect(response.document_readiness).toBe('READY');
      expect(response.llm.required).toBe(false);
      expect(response.llm.called).toBe(false);
      expect(response.result).toBeDefined();
      expect(response.result).toHaveProperty('schema_version', 'ocr-final-document-0.1');
      expect(response.result).toHaveProperty('courses');
    });

    it('should return LLM_RESPONSE_INVALID and block finalization when LLM returns invalid response', async () => {
      const validFile = {
        buffer: Buffer.from('%PDF-1.4 sample content'),
        originalname: 'test_transcript.pdf',
        mimetype: 'application/pdf',
      } as Express.Multer.File;

      jest.spyOn(ocrEngine, 'processDocument').mockResolvedValue({
        success: true,
        exitCode: 0,
        executionTimeMs: 10,
        edrPath: '/tmp/test/edr_full.json',
        rawOcrPath: '/tmp/test/raw_ocr.json',
        edrFullJson: { schema_version: 'edr-0.2' },
        pageCount: 1,
        documentType: 'transcript',
        documentClassification: 'DIGITAL_TEXT',
        nativeTextPages: 1,
        ocrPages: 0,
        strategy: 'NATIVE_TEXT',
      });

      jest.spyOn(evidenceEngine, 'processEvidence').mockResolvedValue({
        success: true,
        exitCode: 0,
        executionTimeMs: 15,
        evidenceFullPath: '/tmp/test/evidence-full.json',
        evidenceLlmPath: '/tmp/test/evidence-llm.json',
        evidenceReportPath: '/tmp/test/evidence-report.json',
        evidenceFullJson: {},
        evidenceLlmJson: {
          tasks: [{ task_id: 'resolve_1', field: 'course_title' }],
        },
        evidenceReportJson: { coverage: { unaccounted_loss: 0 } },
        zeroLossVerified: true,
        unaccountedLoss: 0,
        llmRequired: true,
        taskCount: 1,
        estimatedTokens: 120,
        averageConfidence: 0.94,
        correctionsAttempted: 5,
        correctionsApplied: 0,
      });

      // Mock LLM returning parse error or empty data
      jest.spyOn(llmService, 'generateStructured').mockResolvedValue({
        data: null,
        rawText: 'invalid',
        model: 'qwen3:8b',
        provider: 'mock',
        latencyMs: 10,
        parseError: 'Malformed JSON',
      });

      const response = await service.processDocument(validFile, { runLlm: true });

      expect(response.pipeline.status).toBe('LLM_RESPONSE_INVALID');
      expect(response.document_readiness).toBe('FAILED');
      expect(response.next_action).toBe('RUN_LLM');
      expect(response.final_document).toBeUndefined();
      expect(response.result).toBeUndefined();
    });

    it('TEST 10: should escalate from TEXT_LLM to TEXT_LLM_EXPANDED when first attempt is AMBIGUOUS and resolve successfully', async () => {
      const validFile = {
        buffer: Buffer.from('%PDF-1.4 sample content'),
        originalname: 'test_escalation.pdf',
        mimetype: 'application/pdf',
      } as Express.Multer.File;

      jest.spyOn(ocrEngine, 'processDocument').mockResolvedValue({
        success: true,
        exitCode: 0,
        executionTimeMs: 10,
        edrPath: '/tmp/test/edr_full.json',
        rawOcrPath: '/tmp/test/raw_ocr.json',
        edrFullJson: { schema_version: 'edr-0.2' },
        pageCount: 1,
        documentType: 'transcript',
        documentClassification: 'DIGITAL_TEXT',
        nativeTextPages: 1,
        ocrPages: 0,
        strategy: 'NATIVE_TEXT',
      });

      jest.spyOn(evidenceEngine, 'processEvidence').mockImplementation(async (_ws, _edr, opts) => {
        const isExpanded = opts?.contextLevel === 'expanded';
        return {
          success: true,
          exitCode: 0,
          executionTimeMs: 15,
          evidenceFullPath: '/tmp/test/evidence-full.json',
          evidenceLlmPath: '/tmp/test/evidence-llm.json',
          evidenceReportPath: '/tmp/test/evidence-report.json',
          resolutionRequestJson: {
            schema_version: 'ocr-llm-resolution-request-0.1',
            context_level: isExpanded ? 'EXPANDED' : 'TARGETED',
            tasks: [{ task_id: 'resolve_001', field: 'major' }],
          },
          evidenceFullJson: {},
          evidenceLlmJson: {
            tasks: [{ task_id: 'resolve_001', field: 'major' }],
          },
          evidenceReportJson: { coverage: { unaccounted_loss: 0 } },
          zeroLossVerified: true,
          unaccountedLoss: 0,
          llmRequired: true,
          taskCount: 1,
          estimatedTokens: isExpanded ? 300 : 120,
          averageConfidence: 0.92,
          correctionsAttempted: 0,
          correctionsApplied: 0,
        };
      });

      // LLM call 1 returns AMBIGUOUS; LLM call 2 returns RESOLVED
      jest.spyOn(llmService, 'generateStructured')
        .mockResolvedValueOnce({
          data: {
            resolutions: [
              {
                task_id: 'resolve_001',
                field: 'major',
                status: 'AMBIGUOUS',
                value: null,
                confidence: 0.5,
              },
            ],
          },
          rawText: '',
          model: 'qwen3:8b',
          provider: 'mock',
          latencyMs: 10,
        })
        .mockResolvedValueOnce({
          data: {
            resolutions: [
              {
                task_id: 'resolve_001',
                field: 'major',
                status: 'RESOLVED',
                value: 'Computer Science',
                confidence: 0.98,
                resolution_method: 'LLM',
              },
            ],
          },
          rawText: '',
          model: 'qwen3:8b',
          provider: 'mock',
          latencyMs: 12,
        });

      jest.spyOn(evidenceEngine, 'mergeLlmPatches').mockResolvedValue({
        enhancedEdrPath: '/tmp/test/enhanced_edr.json',
        finalDocumentPath: '/tmp/test/final_document.json',
        patchReportPath: '/tmp/test/patch-report.json',
        enhancedEdrJson: { schema_version: 'edr-enhanced-0.1' },
        finalDocumentJson: {
          schema_version: 'ocr-final-document-0.1',
          document_readiness: 'READY',
          academic: { major: 'Computer Science' },
        },
        patchReportJson: { patches: { received: 1, accepted: 1, rejected: 0 } },
        executionTimeMs: 5,
      });

      const response = await service.processDocument(validFile, { runLlm: true });

      expect(response.success).toBe(true);
      expect(response.pipeline.status).toBe('FINAL_DOCUMENT_READY');
      expect(response.document_readiness).toBe('READY');
      expect(response.output?.type).toBe('FINAL_DOCUMENT');
      expect(response.output?.final_document_available).toBe(true);
      expect(response.llm.strategy).toBe('TEXT_LLM_EXPANDED');
      expect(response.llm.attempts?.length).toBe(2);
      expect(response.llm.attempts?.[0]).toMatchObject({
        task_id: 'resolve_001',
        attempt: 1,
        strategy: 'TEXT_LLM',
        context_level: 'TARGETED',
        status: 'AMBIGUOUS',
      });
      expect(response.llm.attempts?.[1]).toMatchObject({
        task_id: 'resolve_001',
        attempt: 2,
        strategy: 'TEXT_LLM_EXPANDED',
        context_level: 'EXPANDED',
        status: 'RESOLVED',
      });
      expect(response.final_document).toBeDefined();
    });

    it('TEST 11: should set AI_UNRESOLVED and block finalization when both AI attempts fail on mandatory field', async () => {
      const validFile = {
        buffer: Buffer.from('%PDF-1.4 sample content'),
        originalname: 'test_both_fail.pdf',
        mimetype: 'application/pdf',
      } as Express.Multer.File;

      jest.spyOn(ocrEngine, 'processDocument').mockResolvedValue({
        success: true,
        exitCode: 0,
        executionTimeMs: 10,
        edrPath: '/tmp/test/edr_full.json',
        rawOcrPath: '/tmp/test/raw_ocr.json',
        edrFullJson: { schema_version: 'edr-0.2' },
        pageCount: 1,
        documentType: 'transcript',
        documentClassification: 'DIGITAL_TEXT',
        nativeTextPages: 1,
        ocrPages: 0,
        strategy: 'NATIVE_TEXT',
      });

      jest.spyOn(evidenceEngine, 'processEvidence').mockResolvedValue({
        success: true,
        exitCode: 0,
        executionTimeMs: 15,
        evidenceFullPath: '/tmp/test/evidence-full.json',
        evidenceLlmPath: '/tmp/test/evidence-llm.json',
        evidenceReportPath: '/tmp/test/evidence-report.json',
        resolutionRequestJson: {
          schema_version: 'ocr-llm-resolution-request-0.1',
          tasks: [{ task_id: 'resolve_001', field: 'student_name' }],
        },
        evidenceFullJson: {},
        evidenceLlmJson: {
          tasks: [{ task_id: 'resolve_001', field: 'student_name' }],
        },
        evidenceReportJson: { coverage: { unaccounted_loss: 0 } },
        zeroLossVerified: true,
        unaccountedLoss: 0,
        llmRequired: true,
        taskCount: 1,
        estimatedTokens: 120,
        averageConfidence: 0.90,
        correctionsAttempted: 0,
        correctionsApplied: 0,
      });

      // Both attempts return AMBIGUOUS
      jest.spyOn(llmService, 'generateStructured')
        .mockResolvedValueOnce({
          data: {
            resolutions: [
              { task_id: 'resolve_001', field: 'student_name', status: 'AMBIGUOUS' },
            ],
          },
          rawText: '',
          model: 'qwen3:8b',
          provider: 'mock',
          latencyMs: 10,
        })
        .mockResolvedValueOnce({
          data: {
            resolutions: [
              { task_id: 'resolve_001', field: 'student_name', status: 'UNRESOLVED' },
            ],
          },
          rawText: '',
          model: 'qwen3:8b',
          provider: 'mock',
          latencyMs: 10,
        });

      jest.spyOn(evidenceEngine, 'mergeLlmPatches').mockResolvedValue({
        enhancedEdrPath: '/tmp/test/enhanced_edr.json',
        finalDocumentPath: '/tmp/test/final_document.json',
        patchReportPath: '/tmp/test/patch-report.json',
        enhancedEdrJson: { schema_version: 'edr-enhanced-0.1' },
        finalDocumentJson: {
          schema_version: 'ocr-final-document-0.1',
          document_readiness: 'PARTIAL',
          student: { name: null },
        },
        patchReportJson: { patches: { received: 0, accepted: 0, rejected: 0 } },
        executionTimeMs: 5,
      });

      const response = await service.processDocument(validFile, { runLlm: true });

      expect(response.success).toBe(true);
      expect(response.pipeline.status).toBe('PARTIAL');
      expect(response.document_readiness).toBe('RESOLUTION_BLOCKED');
      expect(response.output?.type).toBe('AI_UNRESOLVED_REPORT');
      expect(response.output?.final_document_available).toBe(false);
      expect(response.final_document).toBeUndefined();
      expect(response.final_document_candidate).toBeDefined();
      expect((response.artifacts as Record<string, boolean>)?.final_document).toBe(false);
      expect(response.llm.attempts?.length).toBe(2);
      expect(response.llm.attempts?.[1]?.status).toBe('UNRESOLVED');
    });
  });
});
