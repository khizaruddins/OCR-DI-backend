import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OcrLogger } from '../common/logger.service';
import {
  ContextValidationResult,
  LlmContext,
  LlmContextReport,
} from './interfaces/llm-context.interface';

@Injectable()
export class ContextValidatorService {
  private readonly strictLoss: boolean;

  constructor(
    private readonly configService: ConfigService,
    private readonly logger: OcrLogger,
  ) {
    this.strictLoss = this.configService.get<boolean>(
      'validation.strictLoss',
      true,
    );
  }

  validate(
    context: unknown,
    report?: LlmContextReport | null,
    allowLossOverride = false,
  ): ContextValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!context || typeof context !== 'object') {
      return {
        valid: false,
        errors: ['Context must be a non-null JSON object.'],
        warnings: [],
        documentType: 'unknown',
        pageCount: 0,
        tableCount: 0,
        sectionCount: 0,
        unaccountedLoss: -1,
        lossGatePassed: false,
      };
    }

    const ctx = context as Record<string, unknown>;

    // 1. Raw OCR Check - strictly reject raw OCR JSON
    if (this.isRawOcr(ctx)) {
      errors.push(
        'REJECTED_RAW_OCR: Direct Raw OCR JSON is not accepted as LLM input. Must use Loss-Aware LLM Context JSON.',
      );
      return {
        valid: false,
        errors,
        warnings,
        documentType: 'raw_ocr',
        pageCount: 0,
        tableCount: 0,
        sectionCount: 0,
        unaccountedLoss: -1,
        lossGatePassed: false,
      };
    }

    // 2. Schema version validation
    const schemaVersion = ctx.schema_version;
    if (typeof schemaVersion !== 'string' || (!schemaVersion.startsWith('llm-context') && !schemaVersion.startsWith('edmo-llm-context'))) {
      errors.push(
        `Invalid or missing schema_version: expected 'llm-context-*' or 'edmo-llm-context-*', got '${schemaVersion}'`,
      );
    }

    // 3. Document object validation
    const doc = ctx.document as Record<string, unknown> | undefined;
    if (!doc || typeof doc !== 'object') {
      errors.push("Missing required top-level 'document' object.");
    } else {
      if (!doc.type || typeof doc.type !== 'string') {
        errors.push("Document object missing required 'type' string.");
      }
      if (typeof doc.page_count !== 'number' || doc.page_count <= 0) {
        errors.push("Document object missing or invalid 'page_count' (must be number > 0).");
      }
    }

    // 4. Validate sections if present
    if (ctx.sections !== undefined) {
      if (!Array.isArray(ctx.sections)) {
        errors.push("'sections' must be an array.");
      }
    }

    // 5. Validate tables if present
    if (ctx.tables !== undefined) {
      if (!Array.isArray(ctx.tables)) {
        errors.push("'tables' must be an array.");
      } else {
        ctx.tables.forEach((tbl, idx) => {
          if (!tbl || typeof tbl !== 'object') {
            errors.push(`Table at index ${idx} is not an object.`);
          } else {
            const t = tbl as Record<string, unknown>;
            if (t.rows && !Array.isArray(t.rows)) {
              errors.push(`Table[${idx}].rows must be an array.`);
            }
          }
        });
      }
    }

    // 6. Loss Gate Validation: unaccounted_loss == 0
    let unaccountedLoss = 0;
    let lossGatePassed = true;

    if (report && report.loss_analysis) {
      unaccountedLoss = report.loss_analysis.unaccounted_loss ?? 0;
      if (unaccountedLoss > 0) {
        if (this.strictLoss && !allowLossOverride) {
          lossGatePassed = false;
          errors.push(
            `CONTEXT_VALIDATION_FAILED: unaccounted_loss is ${unaccountedLoss} (> 0). Context quality gate failed.`,
          );
        } else {
          warnings.push(
            `Warning: unaccounted_loss is ${unaccountedLoss} (> 0), processed with override.`,
          );
        }
      }
    }

    const documentType = (doc?.type as string) || 'unknown';
    const pageCount = (doc?.page_count as number) || 0;
    const tableCount = Array.isArray(ctx.tables) ? ctx.tables.length : 0;
    const sectionCount = Array.isArray(ctx.sections) ? ctx.sections.length : 0;

    const valid = errors.length === 0;

    if (!valid) {
      this.logger.warn('Context validation failed', { errors, documentType });
    }

    return {
      valid,
      errors,
      warnings,
      documentType,
      pageCount,
      tableCount,
      sectionCount,
      unaccountedLoss,
      lossGatePassed,
    };
  }

  private isRawOcr(ctx: Record<string, unknown>): boolean {
    if (ctx.engine_version || ctx.ocr_version || ctx.tesseract_version) {
      return true;
    }
    if (
      Array.isArray(ctx.pages) &&
      ctx.pages.length > 0 &&
      (ctx.pages[0]?.words || ctx.pages[0]?.blocks || ctx.pages[0]?.lines) &&
      !ctx.schema_version
    ) {
      return true;
    }
    return false;
  }
}
