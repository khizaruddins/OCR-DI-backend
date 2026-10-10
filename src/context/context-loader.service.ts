import { Injectable } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { OcrLogger } from '../common/logger.service';
import { ContextValidatorService } from './context-validator.service';
import {
  ContextValidationResult,
  LlmContext,
  LlmContextReport,
} from './interfaces/llm-context.interface';

export interface LoadedContextData {
  context: LlmContext;
  report?: LlmContextReport | null;
  validation: ContextValidationResult;
  sourcePath?: string;
}

@Injectable()
export class ContextLoaderService {
  constructor(
    private readonly validator: ContextValidatorService,
    private readonly logger: OcrLogger,
  ) {}

  loadFromFile(
    contextFilePath: string,
    reportFilePath?: string,
    allowLossOverride = false,
  ): LoadedContextData {
    const resolvedContextPath = path.resolve(contextFilePath);
    if (!fs.existsSync(resolvedContextPath)) {
      throw new Error(`Context file not found at: ${resolvedContextPath}`);
    }

    const contextRaw = fs.readFileSync(resolvedContextPath, 'utf8');
    let contextJson: LlmContext;
    try {
      contextJson = JSON.parse(contextRaw);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      throw new Error(`Failed to parse JSON in context file ${resolvedContextPath}: ${msg}`);
    }

    // Try auto-discovering report file if not explicitly given
    let reportJson: LlmContextReport | null = null;
    let resolvedReportPath = reportFilePath ? path.resolve(reportFilePath) : undefined;

    if (!resolvedReportPath) {
      const autoReportPath = path.join(
        path.dirname(resolvedContextPath),
        'llm_context_report.json',
      );
      if (fs.existsSync(autoReportPath)) {
        resolvedReportPath = autoReportPath;
      }
    }

    if (resolvedReportPath && fs.existsSync(resolvedReportPath)) {
      try {
        const reportRaw = fs.readFileSync(resolvedReportPath, 'utf8');
        reportJson = JSON.parse(reportRaw);
      } catch (e: unknown) {
        this.logger.warn(`Could not parse context report at ${resolvedReportPath}`, { error: String(e) });
      }
    }

    const validation = this.validator.validate(contextJson, reportJson, allowLossOverride);

    return {
      context: contextJson,
      report: reportJson,
      validation,
      sourcePath: resolvedContextPath,
    };
  }

  loadFromObject(
    contextObj: unknown,
    reportObj?: unknown,
    allowLossOverride = false,
  ): LoadedContextData {
    const context = contextObj as LlmContext;
    const report = (reportObj as LlmContextReport) || null;
    const validation = this.validator.validate(context, report, allowLossOverride);

    return {
      context,
      report,
      validation,
    };
  }
}
