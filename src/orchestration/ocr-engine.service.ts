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
    this.defaultDpi = this.configService.get<number>('ocr.defaultDpi') || 200;
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
}
