import {
  BadRequestException,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Response } from 'express';
import * as fs from 'fs';
import * as path from 'path';
import { OcrLogger } from '../../src/common/logger.service';
import { LlmService } from '../../src/llm/services/llm.service';
import { ArtifactService } from '../../src/orchestration/artifact.service';
import { DebugOcrController } from '../../src/orchestration/debug-ocr.controller';
import { DocumentProcessingService } from '../../src/orchestration/document-processing.service';
import {
  DocumentWorkspace,
  DocumentWorkspaceService,
} from '../../src/orchestration/document-workspace.service';
import { EvidenceEngineService } from '../../src/orchestration/evidence-engine.service';
import {
  OcrEngineService,
  RawOcrExecutionResult,
} from '../../src/orchestration/ocr-engine.service';
import { ProcessRunnerService } from '../../src/orchestration/process-runner.service';

describe('DebugOcrController - Raw OCR Extraction API (Unit)', () => {
  let controller: DebugOcrController;
  let ocrEngine: OcrEngineService;
  let workspaceService: DocumentWorkspaceService;
  let evidenceEngine: EvidenceEngineService;
  let llmService: LlmService;
  let processingService: DocumentProcessingService;
  let configService: ConfigService;
  let logger: OcrLogger;
  let mockRes: Partial<Response>;
  let resStatus: number;
  let resBody: any;
  let resHeaders: Record<string, string>;

  // Valid minimal PDF header: %PDF-1.4 ...
  const validPdfBuffer = Buffer.from(
    '%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n',
  );

  const mockRawOcrResultJson: Record<string, unknown> = {
    schema_version: '0.2',
    id: 'doc_mock_123',
    confidence: 0.954,
    document: {
      id: 'doc_mock_123',
      source: 'test.pdf',
      type: 'transcript',
      page_count: 1,
      file_size_bytes: 1024,
    },
    engine: {
      name: 'ocr-engine',
      provider: 'tesseract',
      version: '0.2.0',
    },
    pages: [
      {
        page_number: 1,
        width: 2479,
        height: 3508,
        confidence: 0.954,
        raw_text: 'ACCT 101 A',
        blocks: [
          {
            bbox: [100, 200, 300, 40],
            confidence: 0.96,
            lines: [
              {
                bbox: [100, 200, 300, 40],
                confidence: 0.96,
                text: 'ACCT 101 A',
                tokens: [
                  { bbox: [100, 200, 80, 40], confidence: 0.96, text: 'ACCT' },
                  { bbox: [190, 200, 60, 40], confidence: 0.96, text: '101' },
                  { bbox: [260, 200, 20, 40], confidence: 0.96, text: 'A' },
                ],
              },
            ],
          },
        ],
      },
    ],
  };

  beforeEach(() => {
    logger = new OcrLogger();
    jest.spyOn(logger, 'log').mockImplementation(() => {});
    jest.spyOn(logger, 'warn').mockImplementation(() => {});
    jest.spyOn(logger, 'error').mockImplementation(() => {});

    configService = {
      get: jest.fn((key: string) => {
        if (key === 'orchestrator.workDir') return '/tmp/ocr_test_debug';
        if (key === 'orchestrator.maxFileSizeMb') return 50;
        if (key === 'nodeEnv') return 'development';
        if (key === 'ocr.defaultDpi') return 300;
        return undefined;
      }),
    } as unknown as ConfigService;

    const runner = new ProcessRunnerService(logger);
    workspaceService = new DocumentWorkspaceService(configService, logger);
    ocrEngine = new OcrEngineService(configService, runner, logger);
    evidenceEngine = new EvidenceEngineService(configService, runner, logger);
    const artifactService = new ArtifactService(configService, logger);

    llmService = {
      generateStructured: jest.fn(),
    } as unknown as LlmService;

    processingService = new DocumentProcessingService(
      configService,
      workspaceService,
      ocrEngine,
      evidenceEngine,
      artifactService,
      llmService,
      logger,
    );

    controller = new DebugOcrController(
      configService,
      workspaceService,
      ocrEngine,
      logger,
    );

    resHeaders = {};
    resStatus = 200;
    resBody = null;

    mockRes = {
      setHeader: jest.fn((key: string, val: string) => {
        resHeaders[key.toLowerCase()] = val;
        return mockRes as Response;
      }),
      status: jest.fn((code: number) => {
        resStatus = code;
        return mockRes as Response;
      }),
      json: jest.fn((body: any) => {
        resBody = body;
        return mockRes as Response;
      }),
      send: jest.fn((body: any) => {
        resBody = body;
        return mockRes as Response;
      }),
    };
  });

  describe('1 & 2. Valid PDF invokes OCR engine and returns raw OCR output unmodified', () => {
    it('should invoke ocrEngine.processRawOcr and return the exact raw JSON output with mode RAW_OCR_ONLY', async () => {
      const mockWorkspace: DocumentWorkspace = {
        documentId: 'doc_test_123',
        requestId: 'req_123',
        workspaceDir: '/tmp/ocr_test_debug/doc_test_123',
        inputDir: '/tmp/ocr_test_debug/doc_test_123/input',
        inputFilePath: '/tmp/ocr_test_debug/doc_test_123/input/test.pdf',
        sanitizedFilename: 'test.pdf',
        originalFilename: 'test.pdf',
        mimeType: 'application/pdf',
        fileSizeBytes: validPdfBuffer.length,
        ocrDir: '/tmp/ocr_test_debug/doc_test_123/ocr',
        evidenceDir: '/tmp/ocr_test_debug/doc_test_123/evidence',
        logsDir: '/tmp/ocr_test_debug/doc_test_123/logs',
      };

      jest.spyOn(workspaceService, 'createWorkspace').mockResolvedValue(mockWorkspace);
      const cleanupSpy = jest.spyOn(workspaceService, 'cleanupWorkspace').mockResolvedValue();

      const rawResult: RawOcrExecutionResult = {
        success: true,
        exitCode: 0,
        executionTimeMs: 340,
        rawOutputPath: '/tmp/ocr_test_debug/doc_test_123/ocr/raw_ocr.json',
        rawOutputContent: JSON.stringify(mockRawOcrResultJson),
        rawOutputJson: mockRawOcrResultJson,
        pageCount: 1,
        engineName: 'ocr-engine',
        engineVersion: '0.2.0',
        artifacts: [],
      };

      const processRawOcrSpy = jest.spyOn(ocrEngine, 'processRawOcr').mockResolvedValue(rawResult);

      const file = {
        buffer: validPdfBuffer,
        originalname: 'test.pdf',
        mimetype: 'application/pdf',
      } as Express.Multer.File;

      await controller.extractRawOcr(
        file,
        { output_format: 'json' },
        {},
        undefined,
        undefined,
        mockRes as Response,
      );

      expect(resStatus).toBe(200);
      expect(resBody).toBeDefined();
      expect(resBody.success).toBe(true);
      expect(resBody.mode).toBe('RAW_OCR_ONLY');
      expect(resBody.document.filename).toBe('test.pdf');
      expect(resBody.document.page_count).toBe(1);
      expect(resBody.ocr.status).toBe('COMPLETED');
      expect(resBody.ocr.engine).toBe('ocr-engine');
      expect(resBody.ocr.execution_time_ms).toBe(340);
      expect(resBody.ocr.raw_output).toEqual(mockRawOcrResultJson);

      // Verify that processRawOcr was called with workspace and expected options
      expect(processRawOcrSpy).toHaveBeenCalledTimes(1);
      expect(processRawOcrSpy).toHaveBeenCalledWith(
        mockWorkspace,
        expect.objectContaining({
          outputFormat: 'json',
        }),
      );

      // Verify cleanup occurred
      expect(cleanupSpy).toHaveBeenCalledTimes(1);
      expect(cleanupSpy).toHaveBeenCalledWith(mockWorkspace);
    });

    it('should return plain text when output_format=text', async () => {
      const mockWorkspace: DocumentWorkspace = {
        documentId: 'doc_text_123',
        requestId: 'req_text_123',
        workspaceDir: '/tmp/ocr_test_debug/doc_text_123',
        inputDir: '/tmp/ocr_test_debug/doc_text_123/input',
        inputFilePath: '/tmp/ocr_test_debug/doc_text_123/input/test.pdf',
        sanitizedFilename: 'test.pdf',
        originalFilename: 'test.pdf',
        mimeType: 'application/pdf',
        fileSizeBytes: validPdfBuffer.length,
        ocrDir: '/tmp/ocr_test_debug/doc_text_123/ocr',
        evidenceDir: '/tmp/ocr_test_debug/doc_text_123/evidence',
        logsDir: '/tmp/ocr_test_debug/doc_text_123/logs',
      };

      jest.spyOn(workspaceService, 'createWorkspace').mockResolvedValue(mockWorkspace);
      jest.spyOn(workspaceService, 'cleanupWorkspace').mockResolvedValue();

      const rawTextContent = 'ACCT 101 Financial Accounting 3.0 A\n';
      const rawResult: RawOcrExecutionResult = {
        success: true,
        exitCode: 0,
        executionTimeMs: 250,
        rawOutputPath: '/tmp/ocr_test_debug/doc_text_123/ocr/raw_ocr.txt',
        rawOutputContent: rawTextContent,
        pageCount: 1,
        engineName: 'ocr-engine',
        engineVersion: '0.2.0',
        artifacts: [],
      };

      jest.spyOn(ocrEngine, 'processRawOcr').mockResolvedValue(rawResult);

      const file = {
        buffer: validPdfBuffer,
        originalname: 'test.pdf',
        mimetype: 'application/pdf',
      } as Express.Multer.File;

      await controller.extractRawOcr(
        file,
        { output_format: 'text' },
        {},
        undefined,
        undefined,
        mockRes as Response,
      );

      expect(resStatus).toBe(200);
      expect(resHeaders['content-type']).toBe('text/plain; charset=utf-8');
      expect(resBody).toBe(rawTextContent);
    });
  });

  describe('3, 4, 5 & 6. Downstream stage explicit bypass guarantees (Spies)', () => {
    it('should NEVER invoke evidence extraction, LLM routing/inference, or production document processing', async () => {
      const evidenceSpy = jest.spyOn(evidenceEngine, 'processEvidence');
      const llmSpy = jest.spyOn(llmService, 'generateStructured');
      const prodPipelineSpy = jest.spyOn(processingService, 'processDocument');

      const mockWorkspace: DocumentWorkspace = {
        documentId: 'doc_bypass_123',
        requestId: 'req_bypass_123',
        workspaceDir: '/tmp/ocr_test_debug/doc_bypass_123',
        inputDir: '/tmp/ocr_test_debug/doc_bypass_123/input',
        inputFilePath: '/tmp/ocr_test_debug/doc_bypass_123/input/test.pdf',
        sanitizedFilename: 'test.pdf',
        originalFilename: 'test.pdf',
        mimeType: 'application/pdf',
        fileSizeBytes: validPdfBuffer.length,
        ocrDir: '/tmp/ocr_test_debug/doc_bypass_123/ocr',
        evidenceDir: '/tmp/ocr_test_debug/doc_bypass_123/evidence',
        logsDir: '/tmp/ocr_test_debug/doc_bypass_123/logs',
      };

      jest.spyOn(workspaceService, 'createWorkspace').mockResolvedValue(mockWorkspace);
      jest.spyOn(workspaceService, 'cleanupWorkspace').mockResolvedValue();

      jest.spyOn(ocrEngine, 'processRawOcr').mockResolvedValue({
        success: true,
        exitCode: 0,
        executionTimeMs: 150,
        rawOutputPath: '/tmp/ocr_test_debug/doc_bypass_123/ocr/raw_ocr.json',
        rawOutputContent: JSON.stringify(mockRawOcrResultJson),
        rawOutputJson: mockRawOcrResultJson,
        pageCount: 1,
        engineName: 'ocr-engine',
        engineVersion: '0.2.0',
        artifacts: [],
      });

      const file = {
        buffer: validPdfBuffer,
        originalname: 'test.pdf',
        mimetype: 'application/pdf',
      } as Express.Multer.File;

      await controller.extractRawOcr(
        file,
        {},
        {},
        undefined,
        undefined,
        mockRes as Response,
      );

      // Verify that downstream_stages strictly declares NOT_EXECUTED
      expect(resBody.downstream_stages).toEqual({
        edr: 'NOT_EXECUTED',
        evidence: 'NOT_EXECUTED',
        llm: 'NOT_EXECUTED',
        enhanced_edr: 'NOT_EXECUTED',
        final_projection: 'NOT_EXECUTED',
      });

      // Verification via Spies that NO downstream components were touched
      expect(evidenceSpy).toHaveBeenCalledTimes(0);
      expect(llmSpy).toHaveBeenCalledTimes(0);
      expect(prodPipelineSpy).toHaveBeenCalledTimes(0);
    });
  });

  describe('7. OCR Error handling', () => {
    it('should return useful error response and clean up temporary workspace if OCR engine fails', async () => {
      const mockWorkspace: DocumentWorkspace = {
        documentId: 'doc_err_123',
        requestId: 'req_err_123',
        workspaceDir: '/tmp/ocr_test_debug/doc_err_123',
        inputDir: '/tmp/ocr_test_debug/doc_err_123/input',
        inputFilePath: '/tmp/ocr_test_debug/doc_err_123/input/test.pdf',
        sanitizedFilename: 'test.pdf',
        originalFilename: 'test.pdf',
        mimeType: 'application/pdf',
        fileSizeBytes: validPdfBuffer.length,
        ocrDir: '/tmp/ocr_test_debug/doc_err_123/ocr',
        evidenceDir: '/tmp/ocr_test_debug/doc_err_123/evidence',
        logsDir: '/tmp/ocr_test_debug/doc_err_123/logs',
      };

      jest.spyOn(workspaceService, 'createWorkspace').mockResolvedValue(mockWorkspace);
      const cleanupSpy = jest.spyOn(workspaceService, 'cleanupWorkspace').mockResolvedValue();

      jest
        .spyOn(ocrEngine, 'processRawOcr')
        .mockRejectedValue(new Error('Tesseract failed to parse raster image'));

      const file = {
        buffer: validPdfBuffer,
        originalname: 'test.pdf',
        mimetype: 'application/pdf',
      } as Express.Multer.File;

      await controller.extractRawOcr(
        file,
        {},
        {},
        undefined,
        undefined,
        mockRes as Response,
      );

      expect(resStatus).toBe(500);
      expect(resBody.success).toBe(false);
      expect(resBody.mode).toBe('RAW_OCR_ONLY');
      expect(resBody.ocr.status).toBe('FAILED');
      expect(resBody.ocr.error).toContain('Tesseract failed to parse raster image');
      expect(resBody.downstream_stages.edr).toBe('NOT_EXECUTED');

      // Verify workspace is cleaned up even on failure
      expect(cleanupSpy).toHaveBeenCalledTimes(1);
      expect(cleanupSpy).toHaveBeenCalledWith(mockWorkspace);
    });
  });

  describe('8. Upload Validation (File restrictions, size, magic signature)', () => {
    it('should reject empty files with 400 BadRequestException', async () => {
      const emptyFile = {
        buffer: Buffer.alloc(0),
        originalname: 'empty.pdf',
        mimetype: 'application/pdf',
      } as Express.Multer.File;

      await expect(
        controller.extractRawOcr(
          emptyFile,
          {},
          {},
          undefined,
          undefined,
          mockRes as Response,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject oversized files (>50MB) with 400 BadRequestException', async () => {
      const hugeFile = {
        buffer: Buffer.alloc(51 * 1024 * 1024),
        originalname: 'large.pdf',
        mimetype: 'application/pdf',
      } as Express.Multer.File;

      await expect(
        controller.extractRawOcr(
          hugeFile,
          {},
          {},
          undefined,
          undefined,
          mockRes as Response,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject unsupported file extensions (e.g. .exe) with 400 BadRequestException', async () => {
      const invalidFile = {
        buffer: Buffer.from('MZ...executable binary'),
        originalname: 'malware.exe',
        mimetype: 'application/x-msdownload',
      } as Express.Multer.File;

      await expect(
        controller.extractRawOcr(
          invalidFile,
          {},
          {},
          undefined,
          undefined,
          mockRes as Response,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject files with spoofed mime-type but invalid file magic numbers', async () => {
      const spoofedFile = {
        buffer: Buffer.from('Not a real PDF file content at all'),
        originalname: 'fake.pdf',
        mimetype: 'application/pdf',
      } as Express.Multer.File;

      await expect(
        controller.extractRawOcr(
          spoofedFile,
          {},
          {},
          undefined,
          undefined,
          mockRes as Response,
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('9. Artifact access and isolation when include_artifacts=true', () => {
    it('should return artifact metadata and inline content when include_artifacts=true', async () => {
      const mockWorkspace: DocumentWorkspace = {
        documentId: 'doc_artifact_123',
        requestId: 'req_artifact_123',
        workspaceDir: '/tmp/ocr_test_debug/doc_artifact_123',
        inputDir: '/tmp/ocr_test_debug/doc_artifact_123/input',
        inputFilePath: '/tmp/ocr_test_debug/doc_artifact_123/input/test.pdf',
        sanitizedFilename: 'test.pdf',
        originalFilename: 'test.pdf',
        mimeType: 'application/pdf',
        fileSizeBytes: validPdfBuffer.length,
        ocrDir: '/tmp/ocr_test_debug/doc_artifact_123/ocr',
        evidenceDir: '/tmp/ocr_test_debug/doc_artifact_123/evidence',
        logsDir: '/tmp/ocr_test_debug/doc_artifact_123/logs',
      };

      jest.spyOn(workspaceService, 'createWorkspace').mockResolvedValue(mockWorkspace);
      jest.spyOn(workspaceService, 'cleanupWorkspace').mockResolvedValue();

      const rawResult: RawOcrExecutionResult = {
        success: true,
        exitCode: 0,
        executionTimeMs: 300,
        rawOutputPath: '/tmp/ocr_test_debug/doc_artifact_123/ocr/raw_ocr.json',
        rawOutputContent: JSON.stringify(mockRawOcrResultJson),
        rawOutputJson: mockRawOcrResultJson,
        pageCount: 1,
        engineName: 'ocr-engine',
        engineVersion: '0.2.0',
        artifacts: [
          {
            name: 'raw_ocr',
            filename: 'raw_ocr.json',
            size_bytes: 512,
            mime_type: 'application/json',
            content: mockRawOcrResultJson,
          },
        ],
      };

      jest.spyOn(ocrEngine, 'processRawOcr').mockResolvedValue(rawResult);

      const file = {
        buffer: validPdfBuffer,
        originalname: 'test.pdf',
        mimetype: 'application/pdf',
      } as Express.Multer.File;

      await controller.extractRawOcr(
        file,
        { include_artifacts: true },
        {},
        undefined,
        undefined,
        mockRes as Response,
      );

      expect(resStatus).toBe(200);
      expect(resBody.ocr.artifacts).toHaveLength(1);
      expect(resBody.ocr.artifacts[0].name).toBe('raw_ocr');
      expect(resBody.ocr.artifacts[0].filename).toBe('raw_ocr.json');
      expect(resBody.ocr.artifacts[0].content).toEqual(mockRawOcrResultJson);
    });
  });

  describe('11. Authentication and Authorization', () => {
    it('should reject request when debug API key is configured but caller provides invalid key', async () => {
      // Simulate configured DEBUG_API_KEY
      process.env.DEBUG_API_KEY = 'secret-debug-key-xyz';
      const authController = new DebugOcrController(
        configService,
        workspaceService,
        ocrEngine,
        logger,
      );

      const file = {
        buffer: validPdfBuffer,
        originalname: 'test.pdf',
        mimetype: 'application/pdf',
      } as Express.Multer.File;

      await expect(
        authController.extractRawOcr(
          file,
          {},
          {},
          'Bearer wrong-key',
          undefined,
          mockRes as Response,
        ),
      ).rejects.toThrow(UnauthorizedException);

      delete process.env.DEBUG_API_KEY;
    });

    it('should allow request when correct debug API key is provided via X-Debug-Key', async () => {
      process.env.DEBUG_API_KEY = 'secret-debug-key-xyz';
      const authController = new DebugOcrController(
        configService,
        workspaceService,
        ocrEngine,
        logger,
      );

      const mockWorkspace: DocumentWorkspace = {
        documentId: 'doc_auth_123',
        requestId: 'req_auth_123',
        workspaceDir: '/tmp/ocr_test_debug/doc_auth_123',
        inputDir: '/tmp/ocr_test_debug/doc_auth_123/input',
        inputFilePath: '/tmp/ocr_test_debug/doc_auth_123/input/test.pdf',
        sanitizedFilename: 'test.pdf',
        originalFilename: 'test.pdf',
        mimeType: 'application/pdf',
        fileSizeBytes: validPdfBuffer.length,
        ocrDir: '/tmp/ocr_test_debug/doc_auth_123/ocr',
        evidenceDir: '/tmp/ocr_test_debug/doc_auth_123/evidence',
        logsDir: '/tmp/ocr_test_debug/doc_auth_123/logs',
      };

      jest.spyOn(workspaceService, 'createWorkspace').mockResolvedValue(mockWorkspace);
      jest.spyOn(workspaceService, 'cleanupWorkspace').mockResolvedValue();
      jest.spyOn(ocrEngine, 'processRawOcr').mockResolvedValue({
        success: true,
        exitCode: 0,
        executionTimeMs: 100,
        rawOutputPath: '/tmp/ocr_test_debug/doc_auth_123/ocr/raw_ocr.json',
        rawOutputContent: JSON.stringify(mockRawOcrResultJson),
        rawOutputJson: mockRawOcrResultJson,
        pageCount: 1,
        engineName: 'ocr-engine',
        engineVersion: '0.2.0',
        artifacts: [],
      });

      const file = {
        buffer: validPdfBuffer,
        originalname: 'test.pdf',
        mimetype: 'application/pdf',
      } as Express.Multer.File;

      await authController.extractRawOcr(
        file,
        {},
        {},
        undefined,
        'secret-debug-key-xyz',
        mockRes as Response,
      );

      expect(resStatus).toBe(200);
      expect(resBody.success).toBe(true);

      delete process.env.DEBUG_API_KEY;
    });

    it('should throw ForbiddenException if running in production and debug endpoints are disabled', async () => {
      const prodConfigService = {
        get: jest.fn((key: string) => {
          if (key === 'nodeEnv') return 'production';
          return undefined;
        }),
      } as unknown as ConfigService;

      const prodController = new DebugOcrController(
        prodConfigService,
        workspaceService,
        ocrEngine,
        logger,
      );

      const file = {
        buffer: validPdfBuffer,
        originalname: 'test.pdf',
        mimetype: 'application/pdf',
      } as Express.Multer.File;

      await expect(
        prodController.extractRawOcr(
          file,
          {},
          {},
          undefined,
          undefined,
          mockRes as Response,
        ),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('Download artifact endpoint security', () => {
    it('should prevent path traversal attempts with ../ in documentId or artifactName', async () => {
      await expect(
        controller.downloadArtifact(
          '../../etc',
          'passwd',
          undefined,
          undefined,
          mockRes as Response,
        ),
      ).rejects.toThrow();
    });
  });
});
