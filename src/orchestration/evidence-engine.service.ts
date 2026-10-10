import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';
import * as path from 'path';
import { EdmoLogger } from '../common/logger.service';
import { DocumentWorkspace } from './document-workspace.service';
import { ProcessRunnerService } from './process-runner.service';

export interface EvidenceEngineOptions {
  documentType?: string;
  llmThreshold?: number;
  debug?: boolean;
  contextLevel?: 'targeted' | 'expanded';
}

export interface EvidenceExecutionResult {
  success: boolean;
  exitCode: number;
  executionTimeMs: number;
  evidenceFullPath: string;
  evidenceLlmPath: string;
  evidenceReportPath: string;
  resolutionRequestPath?: string;
  enhancedEdrPath?: string;
  finalDocumentPath?: string;
  patchReportPath?: string;
  finalizationReportPath?: string;
  evidenceFullJson: Record<string, unknown>;
  evidenceLlmJson: Record<string, unknown>;
  resolutionRequestJson?: Record<string, unknown>;
  evidenceReportJson: Record<string, unknown>;
  enhancedEdrJson?: Record<string, unknown>;
  finalDocumentJson?: Record<string, unknown>;
  patchReportJson?: Record<string, unknown>;
  finalizationReportJson?: Record<string, unknown>;
  zeroLossVerified: boolean;
  unaccountedLoss: number;
  llmRequired: boolean;
  taskCount: number;
  estimatedTokens: number;
  averageConfidence: number;
  correctionsAttempted: number;
  correctionsApplied: number;
}

@Injectable()
export class EvidenceEngineService {
  private binaryPath: string;
  private readonly timeoutMs: number;
  private readonly defaultLlmThreshold: number;

  constructor(
    private readonly configService: ConfigService,
    private readonly processRunner: ProcessRunnerService,
    private readonly logger: EdmoLogger,
  ) {
    this.binaryPath = this.configService.get<string>('evidence.binaryPath') || '';
    this.timeoutMs = this.configService.get<number>('evidence.timeoutMs') || 30000;
    this.defaultLlmThreshold =
      this.configService.get<number>('evidence.defaultLlmThreshold') || 0.95;
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
      path.resolve(process.cwd(), '../edmo-evidence-engine/build/bin/edmo-evidence'),
      path.resolve(process.cwd(), 'edmo-evidence-engine/build/bin/edmo-evidence'),
      path.resolve(__dirname, '../../../../edmo-evidence-engine/build/bin/edmo-evidence'),
      path.resolve(__dirname, '../../../edmo-evidence-engine/build/bin/edmo-evidence'),
      path.resolve(__dirname, '../../edmo-evidence-engine/build/bin/edmo-evidence'),
      '/usr/local/bin/edmo-evidence',
      'edmo-evidence',
    ];

    for (const candidate of candidatePaths) {
      if (fs.existsSync(candidate)) {
        this.binaryPath = candidate;
        return candidate;
      }
    }

    return this.binaryPath || 'edmo-evidence';
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
      const res = await this.processRunner.run(binary, ['--help'], { timeoutMs: 5000 });
      if (res.exitCode === 0 || res.stdout.includes('EDMO Evidence Intelligence Engine')) {
        return {
          available: true,
          binary,
          version: '0.1.0',
        };
      }
      return {
        available: true,
        binary,
        version: '0.1.0',
      };
    } catch (err) {
      return {
        available: false,
        binary,
        reason: err instanceof Error ? err.message : String(err),
      };
    }
  }

  async processEvidence(
    workspace: DocumentWorkspace,
    edrPath: string,
    options: EvidenceEngineOptions = {},
  ): Promise<EvidenceExecutionResult> {
    const binary = this.resolveBinaryPath();
    if (!fs.existsSync(binary) && !binary.startsWith('edmo-evidence')) {
      throw new Error(`Evidence Engine binary not found: ${binary}`);
    }

    const threshold = options.llmThreshold || this.defaultLlmThreshold;
    const args: string[] = [
      '--input',
      edrPath,
      '--output-dir',
      workspace.evidenceDir,
      '--document-id',
      workspace.documentId,
      '--llm-threshold',
      threshold.toString(),
      '--confidence-epsilon',
      '0.001',
    ];

    if (options.documentType) {
      args.push('--document-type', options.documentType);
    }

    if (options.contextLevel) {
      args.push('--context-level', options.contextLevel);
    }

    if (options.debug) {
      args.push('--debug', '--verbose');
    }

    this.logger.log(
      'Invoking C++ Evidence Intelligence Engine',
      { documentId: workspace.documentId, binary, args },
    );

    const result = await this.processRunner.run(binary, args, {
      timeoutMs: this.timeoutMs,
      cwd: workspace.workspaceDir,
    });

    if (result.timedOut) {
      throw new Error(`Evidence processing timed out after ${this.timeoutMs}ms`);
    }

    if (result.exitCode !== 0) {
      const errDetail = result.stderr || result.stdout || `exit code ${result.exitCode}`;
      this.logger.error(
        'Evidence Engine execution failed',
        undefined,
        { documentId: workspace.documentId, exitCode: result.exitCode, errDetail },
      );
      throw new Error(`Evidence Engine process failed: ${errDetail}`);
    }

    const evidenceFullPath = path.join(workspace.evidenceDir, 'evidence-full.json');
    const evidenceLlmPath = path.join(workspace.evidenceDir, 'evidence-llm.json');
    const evidenceReportPath = path.join(workspace.evidenceDir, 'evidence-report.json');

    // Validate existence of all required artifacts
    if (!fs.existsSync(evidenceFullPath)) {
      throw new Error(
        `Evidence artifact missing: evidence-full.json not found at ${evidenceFullPath}`,
      );
    }
    if (!fs.existsSync(evidenceLlmPath)) {
      throw new Error(
        `Evidence artifact missing: evidence-llm.json not found at ${evidenceLlmPath}`,
      );
    }
    if (!fs.existsSync(evidenceReportPath)) {
      throw new Error(
        `Evidence artifact missing: evidence-report.json not found at ${evidenceReportPath}`,
      );
    }

    const fullJson = JSON.parse(await fs.promises.readFile(evidenceFullPath, 'utf8'));
    const llmJson = JSON.parse(await fs.promises.readFile(evidenceLlmPath, 'utf8'));
    const reportJson = JSON.parse(await fs.promises.readFile(evidenceReportPath, 'utf8'));

    // Check optional/enhanced artifacts
    const resolutionRequestPath = path.join(workspace.evidenceDir, 'llm-resolution-request.json');
    const enhancedEdrPath = path.join(workspace.evidenceDir, 'enhanced_edr.json');
    const finalDocumentPath = path.join(workspace.evidenceDir, 'final_document.json');
    const patchReportPath = path.join(workspace.evidenceDir, 'patch-report.json');
    const finalizationReportPath = path.join(workspace.evidenceDir, 'finalization-report.json');

    let resolutionRequestJson: Record<string, unknown> | undefined;
    let enhancedEdrJson: Record<string, unknown> | undefined;
    let finalDocumentJson: Record<string, unknown> | undefined;
    let patchReportJson: Record<string, unknown> | undefined;
    let finalizationReportJson: Record<string, unknown> | undefined;

    if (fs.existsSync(resolutionRequestPath)) {
      try {
        resolutionRequestJson = JSON.parse(await fs.promises.readFile(resolutionRequestPath, 'utf8'));
      } catch { /* supplementary */ }
    }
    if (fs.existsSync(enhancedEdrPath)) {
      try {
        enhancedEdrJson = JSON.parse(await fs.promises.readFile(enhancedEdrPath, 'utf8'));
      } catch { /* supplementary */ }
    }
    if (fs.existsSync(finalDocumentPath)) {
      try {
        finalDocumentJson = JSON.parse(await fs.promises.readFile(finalDocumentPath, 'utf8'));
      } catch { /* supplementary */ }
    }
    if (fs.existsSync(patchReportPath)) {
      try {
        patchReportJson = JSON.parse(await fs.promises.readFile(patchReportPath, 'utf8'));
      } catch { /* supplementary */ }
    }
    if (fs.existsSync(finalizationReportPath)) {
      try {
        finalizationReportJson = JSON.parse(await fs.promises.readFile(finalizationReportPath, 'utf8'));
      } catch { /* supplementary */ }
    }

    // Extract metrics from report
    const coverage = (reportJson.coverage || {}) as Record<string, unknown>;
    const unaccountedLoss = typeof coverage.unaccounted_loss === 'number' ? coverage.unaccounted_loss : 0;
    const zeroLossVerified = unaccountedLoss === 0;

    const llmSection = (reportJson.llm || {}) as Record<string, unknown>;
    const llmRequired = Boolean(llmSection.required ?? llmJson.llm_required ?? false);
    const taskCount = (llmSection.task_count as number) || (llmJson.tasks as unknown[])?.length || (resolutionRequestJson?.tasks as unknown[])?.length || 0;
    const estimatedTokens = (llmSection.estimated_tokens as number) || 0;

    const confidenceSection = (reportJson.confidence || {}) as Record<string, unknown>;
    const averageConfidence = (confidenceSection.average as number) || 0;

    const correctionSection = (reportJson.correction || {}) as Record<string, unknown>;
    const correctionsAttempted = (correctionSection.attempted as number) || 0;
    const correctionsApplied = (correctionSection.corrected as number) || 0;

    this.logger.log(
      'Evidence Engine processing complete',
      {
        documentId: workspace.documentId,
        zeroLossVerified,
        unaccountedLoss,
        llmRequired,
        taskCount,
        executionTimeMs: result.executionTimeMs,
      },
    );

    return {
      success: true,
      exitCode: result.exitCode,
      executionTimeMs: result.executionTimeMs,
      evidenceFullPath,
      evidenceLlmPath,
      evidenceReportPath,
      resolutionRequestPath: fs.existsSync(resolutionRequestPath) ? resolutionRequestPath : undefined,
      enhancedEdrPath: fs.existsSync(enhancedEdrPath) ? enhancedEdrPath : undefined,
      finalDocumentPath: fs.existsSync(finalDocumentPath) ? finalDocumentPath : undefined,
      patchReportPath: fs.existsSync(patchReportPath) ? patchReportPath : undefined,
      finalizationReportPath: fs.existsSync(finalizationReportPath) ? finalizationReportPath : undefined,
      evidenceFullJson: fullJson,
      evidenceLlmJson: llmJson,
      resolutionRequestJson,
      evidenceReportJson: reportJson,
      enhancedEdrJson,
      finalDocumentJson,
      patchReportJson,
      finalizationReportJson,
      zeroLossVerified,
      unaccountedLoss,
      llmRequired,
      taskCount,
      estimatedTokens,
      averageConfidence,
      correctionsAttempted,
      correctionsApplied,
    };
  }

  async mergeLlmPatches(
    workspace: DocumentWorkspace,
    edrPath: string,
    patchPath: string,
    options: EvidenceEngineOptions = {},
  ): Promise<{
    enhancedEdrPath: string;
    finalDocumentPath: string;
    patchReportPath: string;
    finalizationReportPath?: string;
    enhancedEdrJson: Record<string, unknown>;
    finalDocumentJson: Record<string, unknown>;
    patchReportJson: Record<string, unknown>;
    finalizationReportJson?: Record<string, unknown>;
    executionTimeMs: number;
  }> {
    const binary = this.resolveBinaryPath();
    if (!fs.existsSync(binary) && !binary.startsWith('edmo-evidence')) {
      throw new Error(`Evidence Engine binary not found: ${binary}`);
    }

    const threshold = options.llmThreshold || this.defaultLlmThreshold;
    const args: string[] = [
      '--input',
      edrPath,
      '--output-dir',
      workspace.evidenceDir,
      '--document-id',
      workspace.documentId,
      '--llm-patch',
      patchPath,
      '--llm-threshold',
      threshold.toString(),
      '--confidence-epsilon',
      '0.001',
    ];

    if (options.documentType) {
      args.push('--document-type', options.documentType);
    }

    if (options.debug) {
      args.push('--debug', '--verbose');
    }

    this.logger.log(
      'Invoking C++ Evidence Intelligence Engine for Reverse Path Patch Merge',
      { documentId: workspace.documentId, binary, args },
    );

    const result = await this.processRunner.run(binary, args, {
      timeoutMs: this.timeoutMs,
      cwd: workspace.workspaceDir,
    });

    if (result.timedOut) {
      throw new Error(`Patch merge timed out after ${this.timeoutMs}ms`);
    }

    if (result.exitCode !== 0) {
      const errDetail = result.stderr || result.stdout || `exit code ${result.exitCode}`;
      this.logger.error(
        'Evidence Engine patch merge failed',
        undefined,
        { documentId: workspace.documentId, exitCode: result.exitCode, errDetail },
      );
      throw new Error(`Evidence Engine patch merge failed: ${errDetail}`);
    }

    const enhancedEdrPath = path.join(workspace.evidenceDir, 'enhanced_edr.json');
    const finalDocumentPath = path.join(workspace.evidenceDir, 'final_document.json');
    const patchReportPath = path.join(workspace.evidenceDir, 'patch-report.json');
    const finalizationReportPath = path.join(workspace.evidenceDir, 'finalization-report.json');

    if (!fs.existsSync(enhancedEdrPath)) {
      throw new Error(`Enhanced EDR artifact missing at ${enhancedEdrPath}`);
    }
    if (!fs.existsSync(finalDocumentPath)) {
      throw new Error(`Final Document projection missing at ${finalDocumentPath}`);
    }
    if (!fs.existsSync(patchReportPath)) {
      throw new Error(`Patch report artifact missing at ${patchReportPath}`);
    }

    const enhancedEdrJson = JSON.parse(await fs.promises.readFile(enhancedEdrPath, 'utf8'));
    const finalDocumentJson = JSON.parse(await fs.promises.readFile(finalDocumentPath, 'utf8'));
    const patchReportJson = JSON.parse(await fs.promises.readFile(patchReportPath, 'utf8'));
    let finalizationReportJson: Record<string, unknown> | undefined;

    if (fs.existsSync(finalizationReportPath)) {
      try {
        finalizationReportJson = JSON.parse(await fs.promises.readFile(finalizationReportPath, 'utf8'));
      } catch { /* supplementary */ }
    }

    return {
      enhancedEdrPath,
      finalDocumentPath,
      patchReportPath,
      finalizationReportPath: fs.existsSync(finalizationReportPath) ? finalizationReportPath : undefined,
      enhancedEdrJson,
      finalDocumentJson,
      patchReportJson,
      finalizationReportJson,
      executionTimeMs: result.executionTimeMs,
    };
  }
}
