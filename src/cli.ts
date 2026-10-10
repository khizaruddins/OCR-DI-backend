import { NestFactory } from '@nestjs/core';
import { Command } from 'commander';
import * as fs from 'fs';
import * as path from 'path';
const chalk = require('chalk');
import { AppModule } from './app.module';
import { BenchmarkService } from './evaluation/benchmark.service';
import { DocumentsService } from './documents/documents.service';
import { LlmService } from './llm/services/llm.service';

const program = new Command();

program
  .name('ocr-intelligence')
  .description('EDMO Document Intelligence CLI Engine')
  .version('0.1.0');

program
  .command('extract')
  .description('Extract structured candidate & validated data from an LLM context file')
  .requiredOption('-c, --context <path>', 'Path to llm_context.json')
  .option('-r, --report <path>', 'Path to llm_context_report.json (optional)')
  .option('-m, --model <model>', 'LLM model name (e.g. qwen3-8b-mlx or qwen3:8b)')
  .option('-p, --prompt-version <version>', 'Prompt version (e.g. transcript.v1)')
  .option('-o, --output <dir>', 'Output directory for intelligence artifacts')
  .option('--allow-loss-override', 'Allow processing even if unaccounted_loss > 0', false)
  .action(async (options) => {
    console.log(chalk.cyan.bold('\n======================================================'));
    console.log(chalk.cyan.bold('  EDMO Document Intelligence - Extraction Pipeline'));
    console.log(chalk.cyan.bold('======================================================\n'));

    const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
    const documentsService = app.get(DocumentsService);

    const contextPath = path.resolve(options.context);
    console.log(chalk.gray(`Context File: ${contextPath}`));

    try {
      const response = await documentsService.processFileExtraction({
        context_file_path: contextPath,
        report_file_path: options.report ? path.resolve(options.report) : undefined,
        options: {
          model: options.model,
          prompt_version: options.promptVersion,
          output_dir: options.output ? path.resolve(options.output) : undefined,
          allow_loss_override: options.allowLossOverride,
        },
      });

      console.log(chalk.green.bold('\n✔ Extraction & Validation Succeeded!'));
      console.log(chalk.white(`Document ID:         ${chalk.yellow(response.document.id)}`));
      console.log(chalk.white(`Document Type:       ${chalk.yellow(response.document.type)}`));
      console.log(chalk.white(`Model Used:          ${chalk.yellow(response.model.name)} (${response.model.provider})`));
      console.log(chalk.white(`Prompt Version:      ${chalk.yellow(response.telemetry.prompt_version)}`));
      console.log(chalk.white(`Latency:             ${chalk.yellow(response.telemetry.latency_ms)} ms`));
      console.log(chalk.white(`Tokens:              In: ${response.telemetry.input_tokens || 0}, Out: ${response.telemetry.output_tokens || 0}`));
      console.log(chalk.white(`Overall Status:      ${response.validation.status === 'PASS' ? chalk.green.bold('PASS') : response.validation.status === 'WARN' ? chalk.yellow.bold('WARN') : chalk.red.bold('FAIL')}`));
      console.log(chalk.white(`Schema Valid:        ${response.validation.schema_valid ? chalk.green('YES') : chalk.red('NO')}`));
      console.log(chalk.white(`Supported Values:    ${chalk.green(response.validation.evidence_validation.supported_values)}`));
      console.log(chalk.white(`Unsupported Values:  ${response.validation.evidence_validation.unsupported_values > 0 ? chalk.red(response.validation.evidence_validation.unsupported_values) : chalk.green('0')}`));
      console.log(chalk.white(`Missing Supported:   ${response.validation.evidence_validation.missing_supported_values > 0 ? chalk.yellow(response.validation.evidence_validation.missing_supported_values) : chalk.green('0')}`));

      const qm = response.validation.quality_metrics;
      console.log(chalk.cyan('\nExtraction Quality Metrics:'));
      console.log(chalk.white(`- Field Precision:   ${(qm.field_precision * 100).toFixed(1)}%`));
      console.log(chalk.white(`- Field Recall:      ${(qm.field_recall * 100).toFixed(1)}%`));
      console.log(chalk.white(`- Course Records:    ${qm.candidate_records_count} extracted (from ${qm.source_rows_count} source rows)`));

      if (response.artifact_paths?.output_dir) {
        console.log(chalk.magenta(`\nArtifacts written to:`));
        console.log(chalk.gray(`  Directory:         ${response.artifact_paths.output_dir}`));
        console.log(chalk.gray(`  llm_request:       ${response.artifact_paths.llm_request}`));
        console.log(chalk.gray(`  llm_response:      ${response.artifact_paths.llm_response}`));
        console.log(chalk.gray(`  candidate_doc:     ${response.artifact_paths.candidate_document}`));
        console.log(chalk.gray(`  validation_report: ${response.artifact_paths.validation_report}`));
        console.log(chalk.gray(`  validated_doc:     ${response.artifact_paths.validated_document}`));
      }
      console.log('');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(chalk.red.bold(`\n✖ Extraction Failed: ${msg}\n`));
      process.exit(1);
    } finally {
      await app.close();
    }
  });

program
  .command('benchmark')
  .description('Run extraction quality and performance benchmarks against context files')
  .option('-c, --contexts <paths...>', 'Paths to llm_context.json files')
  .option('-m, --model <model>', 'LLM model name to benchmark (default: qwen3:8b)')
  .option('-p, --prompt-version <version>', 'Prompt version to test (default: transcript.v1)')
  .option('-s, --summary <path>', 'Path to write benchmark summary JSON')
  .action(async (options) => {
    console.log(chalk.cyan.bold('\n======================================================'));
    console.log(chalk.cyan.bold('  EDMO Document Intelligence - Benchmark Suite'));
    console.log(chalk.cyan.bold('======================================================\n'));

    const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
    const benchmarkService = app.get(BenchmarkService);

    let contextPaths: string[] = options.contexts || [];
    if (contextPaths.length === 0) {
      // Default example files
      const candidateDirs = [
        path.resolve(process.cwd(), 'examples/transcript'),
        path.resolve(__dirname, '../examples/transcript'),
        path.resolve(__dirname, '../../examples/transcript'),
      ];

      for (const candidateDir of candidateDirs) {
        if (fs.existsSync(candidateDir)) {
          const subdirs = fs.readdirSync(candidateDir);
          for (const sub of subdirs) {
            const candidate = path.join(candidateDir, sub, 'llm_context.json');
            if (fs.existsSync(candidate)) {
              contextPaths.push(candidate);
            }
          }
          if (contextPaths.length > 0) break;
        }
      }
    }

    if (contextPaths.length === 0) {
      console.error(chalk.red('No context files specified or found in examples.'));
      await app.close();
      process.exit(1);
    }

    try {
      const summary = await benchmarkService.runBenchmark(
        contextPaths,
        options.model,
        options.promptVersion,
        options.summary,
      );

      console.log(chalk.green.bold('\nBenchmark Completed Successfully!'));
      console.log(chalk.white(`Total Documents:     ${summary.totalDocuments}`));
      console.log(chalk.white(`Successful Runs:     ${chalk.green(summary.successfulRuns)}`));
      console.log(chalk.white(`Failed Runs:         ${summary.failedRuns > 0 ? chalk.red(summary.failedRuns) : chalk.green('0')}`));
      console.log(chalk.white(`Average Latency:     ${chalk.yellow(summary.averageLatencyMs)} ms`));
      console.log(chalk.white(`Avg Field Precision: ${(summary.averageFieldPrecision * 100).toFixed(1)}%`));
      console.log(chalk.white(`Avg Field Recall:    ${(summary.averageFieldRecall * 100).toFixed(1)}%`));

      console.log(chalk.cyan('\nPer-Document Results:'));
      summary.results.forEach((r, idx) => {
        console.log(
          chalk.white(
            `[${idx + 1}] ${chalk.bold(r.documentId)} | Latency: ${r.latencyMs}ms | Schema: ${r.schemaValid ? 'OK' : 'ERR'} | Unsupported: ${r.unsupportedValues} | Precision: ${(r.fieldPrecision * 100).toFixed(0)}% | Status: ${r.overallStatus}`,
          ),
        );
      });
      console.log('');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(chalk.red(`\nBenchmark error: ${msg}\n`));
      process.exit(1);
    } finally {
      await app.close();
    }
  });

program
  .command('health')
  .description('Check LM Studio / Ollama connectivity and LLM service status')
  .action(async () => {
    const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
    const llmService = app.get(LlmService);

    try {
      const health = await llmService.healthCheck();
      console.log(chalk.cyan.bold('\n======================================================'));
      console.log(chalk.cyan.bold('  EDMO LLM Provider Health Status'));
      console.log(chalk.cyan.bold('======================================================\n'));
      console.log(chalk.white(`Provider:   ${chalk.yellow(health.provider)}`));
      console.log(chalk.white(`Target:     ${chalk.yellow(health.model)}`));
      console.log(
        chalk.white(
          `Status:     ${health.available ? chalk.green.bold('HEALTHY') : chalk.yellow.bold('DEGRADED')}`,
        ),
      );
      if (health.reason) {
        console.log(chalk.gray(`Reason:     ${health.reason}`));
      }
      console.log('');
    } catch (err: unknown) {
      console.error(chalk.red(`Health check failed: ${String(err)}`));
    } finally {
      await app.close();
    }
  });

program.parse(process.argv);
