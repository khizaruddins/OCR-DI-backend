import { Injectable } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { EdmoLogger } from '../common/logger.service';
import { ContextLoaderService } from '../context/context-loader.service';
import { DocumentsService } from '../documents/documents.service';
import { ExtractResponseDto } from '../documents/dto/extract-request.dto';

export interface BenchmarkItemResult {
  documentId: string;
  documentType: string;
  model: string;
  promptVersion: string;
  latencyMs: number;
  inputTokens?: number;
  outputTokens?: number;
  schemaValid: boolean;
  evidenceValid: boolean;
  unsupportedValues: number;
  missingSupportedValues: number;
  fieldPrecision: number;
  fieldRecall: number;
  recordPrecision: number;
  recordRecall: number;
  overallStatus: string;
}

export interface BenchmarkSummary {
  timestamp: string;
  totalDocuments: number;
  successfulRuns: number;
  failedRuns: number;
  averageLatencyMs: number;
  totalTokens: number;
  averageFieldPrecision: number;
  averageFieldRecall: number;
  results: BenchmarkItemResult[];
}

@Injectable()
export class BenchmarkService {
  constructor(
    private readonly contextLoader: ContextLoaderService,
    private readonly documentsService: DocumentsService,
    private readonly logger: EdmoLogger,
  ) {}

  async runBenchmark(
    contextPaths: string[],
    model?: string,
    promptVersion?: string,
    outputSummaryPath?: string,
  ): Promise<BenchmarkSummary> {
    const results: BenchmarkItemResult[] = [];
    let totalLatency = 0;
    let totalTokens = 0;
    let totalFieldPrecision = 0;
    let totalFieldRecall = 0;
    let successfulRuns = 0;
    let failedRuns = 0;

    for (const ctxPath of contextPaths) {
      this.logger.log(`Running benchmark on: ${ctxPath}`);
      try {
        const response: ExtractResponseDto = await this.documentsService.processFileExtraction({
          context_file_path: ctxPath,
          options: {
            model,
            prompt_version: promptVersion,
          },
        });

        const qm = response.validation.quality_metrics;
        const latency = response.telemetry.latency_ms;
        const tokens = (response.telemetry.input_tokens || 0) + (response.telemetry.output_tokens || 0);

        totalLatency += latency;
        totalTokens += tokens;
        totalFieldPrecision += qm.field_precision;
        totalFieldRecall += qm.field_recall;
        successfulRuns++;

        results.push({
          documentId: response.document.id,
          documentType: response.document.type,
          model: response.model.name,
          promptVersion: response.telemetry.prompt_version,
          latencyMs: latency,
          inputTokens: response.telemetry.input_tokens,
          outputTokens: response.telemetry.output_tokens,
          schemaValid: response.validation.schema_valid,
          evidenceValid: response.validation.evidence_validation.unsupported_values === 0,
          unsupportedValues: response.validation.evidence_validation.unsupported_values,
          missingSupportedValues: response.validation.evidence_validation.missing_supported_values,
          fieldPrecision: qm.field_precision,
          fieldRecall: qm.field_recall,
          recordPrecision: qm.record_precision,
          recordRecall: qm.record_recall,
          overallStatus: response.validation.status,
        });
      } catch (err: unknown) {
        failedRuns++;
        const msg = err instanceof Error ? err.message : String(err);
        this.logger.error(`Benchmark failed for context ${ctxPath}: ${msg}`);
        results.push({
          documentId: path.basename(path.dirname(ctxPath)),
          documentType: 'unknown',
          model: model || 'default',
          promptVersion: promptVersion || 'default',
          latencyMs: 0,
          schemaValid: false,
          evidenceValid: false,
          unsupportedValues: 0,
          missingSupportedValues: 0,
          fieldPrecision: 0,
          fieldRecall: 0,
          recordPrecision: 0,
          recordRecall: 0,
          overallStatus: `FAILED: ${msg}`,
        });
      }
    }

    const summary: BenchmarkSummary = {
      timestamp: new Date().toISOString(),
      totalDocuments: contextPaths.length,
      successfulRuns,
      failedRuns,
      averageLatencyMs: successfulRuns > 0 ? Math.round(totalLatency / successfulRuns) : 0,
      totalTokens,
      averageFieldPrecision:
        successfulRuns > 0 ? parseFloat((totalFieldPrecision / successfulRuns).toFixed(4)) : 0,
      averageFieldRecall:
        successfulRuns > 0 ? parseFloat((totalFieldRecall / successfulRuns).toFixed(4)) : 0,
      results,
    };

    if (outputSummaryPath) {
      const resolvedPath = path.resolve(outputSummaryPath);
      const dir = path.dirname(resolvedPath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(resolvedPath, JSON.stringify(summary, null, 2), 'utf8');
      this.logger.log(`Benchmark summary saved to ${resolvedPath}`);
    }

    return summary;
  }
}
