import { Injectable } from '@nestjs/common';
import { OcrLogger } from '../common/logger.service';
import { LlmContext } from '../context/interfaces/llm-context.interface';
import { DocumentRouterService } from '../extraction/document-router.service';
import { ExtractionResult } from '../extraction/extraction.service';
import { EvidenceValidatorService } from './evidence-validator.service';
import {
  QualityMetrics,
  ValidatedExtractionResult,
  ValidationReport,
  ValidationStatus,
} from './interfaces/validation.interfaces';
import { NormalizationService } from './normalization.service';
import { SchemaValidatorService } from './schema-validator.service';

@Injectable()
export class ExtractionValidatorService {
  constructor(
    private readonly schemaValidator: SchemaValidatorService,
    private readonly evidenceValidator: EvidenceValidatorService,
    private readonly normalizer: NormalizationService,
    private readonly router: DocumentRouterService,
    private readonly logger: OcrLogger,
  ) {}

  validateAndNormalize<T = Record<string, unknown>>(
    context: LlmContext,
    extractionResult: ExtractionResult<T>,
  ): ValidatedExtractionResult<T> {
    const candidate = extractionResult.candidate as Record<string, unknown>;
    const docType = extractionResult.documentType || context.document?.type || 'transcript';
    const routing = this.router.route(docType);

    // 1. Schema Validation
    const schemaValidation = this.schemaValidator.validate(routing.schema, candidate);

    // 2. Evidence Validation
    const evidenceValidation = this.evidenceValidator.validateEvidence(
      context,
      candidate || {},
    );

    // 3. Deterministic Normalization
    let validatedDocument: T | null = null;
    if (candidate) {
      if (docType === 'transcript') {
        validatedDocument = this.normalizer.normalizeTranscript<T>(candidate as T);
      } else {
        validatedDocument = candidate as T;
      }
    }

    // 4. Calculate Precision, Recall, and Metrics
    const sourceRowsCount = this.countSourceRows(context);
    const candidateRecords = Array.isArray(candidate?.academic_records)
      ? candidate.academic_records.length
      : 0;

    const totalEvaluatedFields =
      evidenceValidation.supported_values + evidenceValidation.unsupported_values;

    const fieldPrecision =
      totalEvaluatedFields > 0
        ? parseFloat((evidenceValidation.supported_values / totalEvaluatedFields).toFixed(4))
        : 1.0;

    const totalExpectedFields =
      evidenceValidation.supported_values + evidenceValidation.missing_supported_values;

    const fieldRecall =
      totalExpectedFields > 0
        ? parseFloat((evidenceValidation.supported_values / totalExpectedFields).toFixed(4))
        : 1.0;

    const recordPrecision =
      candidateRecords > 0
        ? parseFloat(
            Math.max(
              0,
              (candidateRecords - evidenceValidation.unsupported_values) / candidateRecords,
            ).toFixed(4),
          )
        : 1.0;

    const recordRecall =
      sourceRowsCount > 0
        ? parseFloat(
            Math.min(1, candidateRecords / Math.max(1, sourceRowsCount)).toFixed(4),
          )
        : 1.0;

    const qualityMetrics: QualityMetrics = {
      field_precision: fieldPrecision,
      field_recall: fieldRecall,
      record_precision: recordPrecision,
      record_recall: recordRecall,
      source_rows_count: sourceRowsCount,
      candidate_records_count: candidateRecords,
      latency_ms: extractionResult.latencyMs,
      input_tokens: extractionResult.usage?.promptTokens,
      output_tokens: extractionResult.usage?.completionTokens,
    };

    // 5. Determine Overall Status
    let status: ValidationStatus = 'PASS';
    const warnings: string[] = [];

    if (!schemaValidation.valid) {
      status = 'FAIL';
    } else if (evidenceValidation.unsupported_values > 0) {
      status = 'WARN';
      warnings.push(
        `${evidenceValidation.unsupported_values} field(s) were flagged as UNSUPPORTED_BY_EVIDENCE.`,
      );
    } else if (evidenceValidation.missing_supported_values > 0) {
      warnings.push(
        `${evidenceValidation.missing_supported_values} field(s) in context were omitted in extraction.`,
      );
    }

    if (extractionResult.parseError) {
      status = 'FAIL';
      warnings.push(`LLM Response Parse Error: ${extractionResult.parseError}`);
    }

    const validationReport: ValidationReport = {
      schema_version: 'edmo-validation-report-0.1',
      status,
      schema_valid: schemaValidation.valid,
      schema_errors: schemaValidation.errors,
      evidence_validation: evidenceValidation,
      hallucination_flags: evidenceValidation.unsupported_values,
      warnings,
      quality_metrics: qualityMetrics,
    };

    this.logger.log(`Document validation completed with status: ${status}`, {
      status,
      schemaValid: schemaValidation.valid,
      unsupportedValues: evidenceValidation.unsupported_values,
      fieldPrecision,
      fieldRecall,
    });

    return {
      candidateDocument: candidate as unknown as T,
      validatedDocument,
      validationReport,
    };
  }

  private countSourceRows(context: LlmContext): number {
    let count = 0;
    if (Array.isArray(context.tables)) {
      context.tables.forEach((t) => {
        if (Array.isArray(t.rows)) {
          count += t.rows.length;
        }
      });
    }
    return count;
  }
}
