import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';
import * as path from 'path';
import { OcrLogger } from '../common/logger.service';
import { DocumentWorkspace } from './document-workspace.service';
import { ProcessRunnerService } from './process-runner.service';

export interface OcrEngineOptions {
  dpi?: number;
  documentType?: string;
  orientation?: boolean;
  debug?: boolean;
  forceOcr?: boolean;
  forceNativeText?: boolean;
}

export interface OcrExecutionResult {
  success: boolean;
  exitCode: number;
  executionTimeMs: number;
  edrPath: string;
  rawOcrPath: string;
  preflightPath?: string;
  edrFullJson: Record<string, unknown>;
  preflightJson?: Record<string, unknown>;
  pageCount: number;
  documentType: string;
  documentClassification: string;
  nativeTextPages: number;
  ocrPages: number;
  strategy: string;
}

export interface ProcessRawOcrOptions {
  dpi?: number;
  outputFormat?: 'json' | 'text';
  forceOcr?: boolean;
  forceNativeText?: boolean;
  orientation?: boolean;
  includeArtifacts?: boolean;
  debug?: boolean;
}

export interface RawOcrExecutionResult {
  success: boolean;
  exitCode: number;
  executionTimeMs: number;
  rawOutputPath: string;
  rawOutputContent: string;
  rawOutputJson?: Record<string, unknown>;
  pageCount: number;
  engineName: string;
  engineVersion: string;
  artifacts: {
    name: string;
    filename: string;
    size_bytes: number;
    mime_type: string;
    content?: unknown;
  }[];
}

@Injectable()
export class OcrEngineService {
  private binaryPath: string;
  private readonly timeoutMs: number;
  private readonly defaultDpi: number;

  constructor(
    private readonly configService: ConfigService,
    private readonly processRunner: ProcessRunnerService,
    private readonly logger: OcrLogger,
  ) {
    this.binaryPath = this.configService.get<string>('ocr.binaryPath') || '';
    this.timeoutMs = this.configService.get<number>('ocr.timeoutMs') || 120000;
    this.defaultDpi = this.configService.get<number>('ocr.defaultDpi') || 300;
  }

  resolveBinaryPath(): string {
    if (this.binaryPath) {
      const resolved = path.isAbsolute(this.binaryPath)
        ? this.binaryPath
        : path.resolve(process.cwd(), this.binaryPath);
      if (fs.existsSync(resolved)) {
        return resolved;
      }
    }

    const candidatePaths = [
      path.resolve(process.cwd(), '../OCR Layer/build/bin/ocr-engine'),
      path.resolve(process.cwd(), '../OCR Layer/build/bin/edmo-ocr'),
      path.resolve(process.cwd(), 'OCR Layer/build/bin/ocr-engine'),
      path.resolve(process.cwd(), 'OCR Layer/build/bin/ocr-engine'),
      path.resolve(__dirname, '../../../../OCR Layer/build/bin/ocr-engine'),
      path.resolve(__dirname, '../../../OCR Layer/build/bin/ocr-engine'),
      path.resolve(__dirname, '../../OCR Layer/build/bin/ocr-engine'),
      '/usr/local/bin/ocr-engine',
      'ocr-engine',
    ];

    for (const candidate of candidatePaths) {
      if (fs.existsSync(candidate)) {
        this.binaryPath = candidate;
        return candidate;
      }
    }

    return this.binaryPath || 'ocr-engine';
  }

  async getHealth(): Promise<{
    available: boolean;
    binary: string;
    version?: string;
    reason?: string;
  }> {
    const binary = this.resolveBinaryPath();
    if (!fs.existsSync(binary)) {
      return {
        available: false,
        binary,
        reason: 'Binary file not found on disk',
      };
    }

    try {
      const res = await this.processRunner.run(binary, ['--version'], { timeoutMs: 5000 });
      if (res.exitCode === 0 && res.stdout) {
        const firstLine = res.stdout.split('\n')[0].trim();
        return {
          available: true,
          binary,
          version: firstLine,
        };
      }
      return {
        available: true,
        binary,
        version: '0.2.0',
      };
    } catch (err) {
      return {
        available: false,
        binary,
        reason: err instanceof Error ? err.message : String(err),
      };
    }
  }

  async processDocument(
    workspace: DocumentWorkspace,
    options: OcrEngineOptions = {},
  ): Promise<OcrExecutionResult> {
    const binary = this.resolveBinaryPath();
    if (!fs.existsSync(binary) && !binary.startsWith('ocr-engine')) {
      throw new Error(`OCR Engine binary not found: ${binary}`);
    }

    const dpi = options.dpi || this.defaultDpi;
    const args: string[] = [
      workspace.inputFilePath,
      '--output-dir',
      workspace.ocrDir,
      '--document-id',
      workspace.documentId,
      '--dpi',
      dpi.toString(),
      '--format',
      'full-json',
      '--include-preflight',
      '--representation',
      'all',
    ];

    if (options.documentType && options.documentType !== 'auto') {
      args.push('--document-type', options.documentType);
    }

    if (options.orientation === false) {
      args.push('--no-orientation');
    }

    if (options.forceOcr) {
      args.push('--force-ocr');
    }

    if (options.forceNativeText) {
      args.push('--force-native-text');
    }

    if (options.debug) {
      args.push('--verbose');
    }

    this.logger.log(
      'Invoking C++ OCR Engine',
      { documentId: workspace.documentId, binary, args },
    );

    const result = await this.processRunner.run(binary, args, {
      timeoutMs: this.timeoutMs,
      cwd: workspace.workspaceDir,
    });

    if (result.timedOut) {
      throw new Error(`OCR processing timed out after ${this.timeoutMs}ms`);
    }

    if (result.exitCode !== 0) {
      const errDetail = result.stderr || result.stdout || `exit code ${result.exitCode}`;
      this.logger.error(
        'OCR engine execution failed',
        undefined,
        { documentId: workspace.documentId, exitCode: result.exitCode, errDetail },
      );
      throw new Error(`OCR Engine process failed: ${errDetail}`);
    }

    // Locate generated artifacts
    const stem = path.parse(workspace.sanitizedFilename).name;
    const documentOutputDir = path.join(workspace.ocrDir, stem);
    const edrPath = path.join(documentOutputDir, 'edr_full.json');
    const rawOcrPath = path.join(documentOutputDir, 'raw_ocr.json');
    const preflightPath = path.join(documentOutputDir, 'preflight.json');

    if (!fs.existsSync(edrPath)) {
      throw new Error(
        `OCR Engine completed but expected Full EDR artifact not found at: ${edrPath}`,
      );
    }

    const edrRawContent = await fs.promises.readFile(edrPath, 'utf8');
    let edrFullJson: Record<string, unknown>;
    try {
      edrFullJson = JSON.parse(edrRawContent);
    } catch {
      throw new Error(`Failed to parse Full EDR JSON at: ${edrPath}`);
    }

    let preflightJson: Record<string, unknown> | undefined;
    if (fs.existsSync(preflightPath)) {
      try {
        preflightJson = JSON.parse(await fs.promises.readFile(preflightPath, 'utf8'));
      } catch {
        // Preflight is supplementary
      }
    }

    // Extract manifest statistics
    const manifest = (edrFullJson.processing_manifest || {}) as Record<string, unknown>;
    const manifestPages = (manifest.pages || {}) as Record<string, number>;
    const docMeta = (edrFullJson.document || {}) as Record<string, unknown>;

    const pageCount = (docMeta.page_count as number) || (edrFullJson.pages as unknown[])?.length || 1;
    const documentType = (docMeta.type as string) || 'generic';
    const documentClassification = ((manifest.document as Record<string, unknown>)?.type as string) || documentType;
    const nativeTextPages = manifestPages.native_text || 0;
    const ocrPages = manifestPages.ocr || (pageCount - nativeTextPages);
    const strategy = (manifest.strategy as string) || 'ADAPTIVE';

    this.logger.log(
      'OCR engine execution complete',
      {
        documentId: workspace.documentId,
        pageCount,
        nativeTextPages,
        ocrPages,
        executionTimeMs: result.executionTimeMs,
      },
    );

    return {
      success: true,
      exitCode: result.exitCode,
      executionTimeMs: result.executionTimeMs,
      edrPath,
      rawOcrPath,
      preflightPath: fs.existsSync(preflightPath) ? preflightPath : undefined,
      edrFullJson,
      preflightJson,
      pageCount,
      documentType,
      documentClassification,
      nativeTextPages,
      ocrPages,
      strategy,
    };
  }

  async processRawOcr(
    workspace: DocumentWorkspace,
    options: ProcessRawOcrOptions = {},
  ): Promise<RawOcrExecutionResult> {
    const binary = this.resolveBinaryPath();
    if (!fs.existsSync(binary) && !binary.startsWith('ocr-engine')) {
      throw new Error(`OCR Engine binary not found: ${binary}`);
    }

    const isText = options.outputFormat === 'text';
    const filename = isText ? 'raw_ocr.txt' : 'raw_ocr.json';
    const rawOutputPath = path.join(workspace.ocrDir, filename);

    const dpi = options.dpi || this.defaultDpi;
    const args: string[] = [
      workspace.inputFilePath,
      '-o',
      rawOutputPath,
      '--document-id',
      workspace.documentId,
      '--dpi',
      dpi.toString(),
      '--format',
      isText ? 'text' : 'full-json',
      '--representation',
      'none',
    ];

    if (options.orientation === false) {
      args.push('--no-orientation');
    }

    if (options.forceOcr) {
      args.push('--force-ocr');
    }

    if (options.forceNativeText) {
      args.push('--force-native-text');
    }

    if (options.debug) {
      args.push('--verbose');
    }

    this.logger.log(
      'Invoking C++ OCR Engine in RAW_OCR_ONLY mode (bypassing EDR, Evidence, and LLM stages)',
      { documentId: workspace.documentId, binary, args },
    );

    const result = await this.processRunner.run(binary, args, {
      timeoutMs: this.timeoutMs,
      cwd: workspace.workspaceDir,
    });

    if (result.timedOut) {
      throw new Error(`OCR processing timed out after ${this.timeoutMs}ms`);
    }

    if (result.exitCode !== 0) {
      const errDetail = result.stderr || result.stdout || `exit code ${result.exitCode}`;
      this.logger.error(
        'Raw OCR engine execution failed',
        undefined,
        { documentId: workspace.documentId, exitCode: result.exitCode, errDetail },
      );
      throw new Error(`OCR Engine process failed: ${errDetail}`);
    }

    if (!fs.existsSync(rawOutputPath)) {
      throw new Error(`Raw OCR output file was not produced at: ${rawOutputPath}`);
    }

    const rawOutputContent = await fs.promises.readFile(rawOutputPath, 'utf8');
    let rawOutputJson: Record<string, unknown> | undefined;
    let pageCount = 1;
    let engineName = 'ocr-engine';
    let engineVersion = '0.2.0';

    if (!isText) {
      try {
        rawOutputJson = JSON.parse(rawOutputContent);
        if (rawOutputJson) {
          const doc = rawOutputJson.document as Record<string, unknown> | undefined;
          if (doc && typeof doc.page_count === 'number') {
            pageCount = doc.page_count;
          } else if (Array.isArray(rawOutputJson.pages)) {
            pageCount = rawOutputJson.pages.length;
          }
          const eng = rawOutputJson.engine as Record<string, unknown> | undefined;
          if (eng && typeof eng.name === 'string') {
            engineName = eng.name;
          }
          if (eng && typeof eng.version === 'string') {
            engineVersion = eng.version;
          }
        }
      } catch (err) {
        throw new Error(
          `Failed to parse raw OCR JSON output: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    const artifacts = [];
    if (options.includeArtifacts) {
      const stat = await fs.promises.stat(rawOutputPath);
      artifacts.push({
        name: 'raw_ocr',
        filename,
        size_bytes: stat.size,
        mime_type: isText ? 'text/plain' : 'application/json',
        content: rawOutputJson || rawOutputContent,
      });
    }

    this.logger.log(
      'Raw OCR execution completed successfully',
      {
        documentId: workspace.documentId,
        pageCount,
        executionTimeMs: result.executionTimeMs,
        format: options.outputFormat || 'json',
      },
    );

    return {
      success: true,
      exitCode: result.exitCode,
      executionTimeMs: result.executionTimeMs,
      rawOutputPath,
      rawOutputContent,
      rawOutputJson,
      pageCount,
      engineName,
      engineVersion,
      artifacts,
    };
  }
}
