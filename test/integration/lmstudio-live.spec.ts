import axios from 'axios';
import * as path from 'path';
const chalk = require('chalk');
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../../src/app.module';
import { DocumentsService } from '../../src/documents/documents.service';

async function runLiveLmStudioTest() {
  console.log(chalk.cyan.bold('\n======================================================'));
  console.log(chalk.cyan.bold('  OCR Live LM Studio Integration Test (Qwen3-8B-MLX)'));
  console.log(chalk.cyan.bold('======================================================\n'));

  const lmStudioUrl =
    process.env.LM_STUDIO_BASE_URL || 'http://192.168.0.104:1234/v1';
  const targetModel = process.env.LM_STUDIO_MODEL || 'qwen3-8b-mlx';
  const apiKey = process.env.LLM_API_KEY || process.env.LM_STUDIO_API_KEY;

  console.log(chalk.gray(`Probing LM Studio at ${lmStudioUrl}...`));

  let isRunning = false;
  let availableModels: string[] = [];

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (apiKey) {
    headers['Authorization'] = `Bearer ${apiKey}`;
  }

  try {
    const res = await axios.get(`${lmStudioUrl.replace(/\/+$/, '')}/models`, {
      headers,
      timeout: 5000,
    });
    isRunning = true;
    availableModels = (res.data?.data || []).map((m: { id: string }) => m.id);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.log(
      chalk.yellow.bold(
        `[SKIPPED] LM Studio endpoint is unreachable on ${lmStudioUrl} (${msg}). Skipping live test.`,
      ),
    );
    process.exit(0);
  }

  console.log(chalk.green(`✔ LM Studio is online.`));
  console.log(chalk.white(`Available Models: [${availableModels.join(', ')}]`));
  console.log(chalk.gray(`Executing live extraction on Sophia Jones transcript...`));

  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
  const documentsService = app.get(DocumentsService);

  const contextPath = path.resolve(
    __dirname,
    '../../examples/transcript/sophia_jones_transcript/llm_context.json',
  );

  const startTime = Date.now();
  try {
    const response = await documentsService.processFileExtraction({
      context_file_path: contextPath,
      options: {
        model: targetModel,
        prompt_version: 'transcript.v1',
      },
    });
    const elapsed = Date.now() - startTime;

    console.log(chalk.green.bold('\n✔ Live LM Studio Qwen3-8B-MLX Extraction Passed!'));
    console.log(chalk.white(`Model Used:          ${chalk.yellow(response.model.name)} (${response.model.provider})`));
    console.log(chalk.white(`Latency:             ${chalk.yellow(elapsed)} ms`));
    console.log(chalk.white(`Input Tokens:        ${response.telemetry.input_tokens || 'N/A'}`));
    console.log(chalk.white(`Output Tokens:       ${response.telemetry.output_tokens || 'N/A'}`));
    console.log(chalk.white(`Schema Valid:        ${response.validation.schema_valid ? chalk.green('YES') : chalk.red('NO')}`));
    console.log(chalk.white(`Evidence Supported:  ${chalk.green(response.validation.evidence_validation.supported_values)}`));
    console.log(chalk.white(`Hallucinations:      ${chalk.green(response.validation.evidence_validation.unsupported_values)}`));
    console.log(chalk.white(`Overall Status:      ${chalk.green.bold(response.validation.status)}`));

    if (!response.validation.schema_valid) {
      console.error(chalk.red('Schema validation failed during live test:'), response.validation.schema_errors);
      process.exit(1);
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(chalk.red.bold(`Live LM Studio extraction failed: ${msg}`));
    process.exit(1);
  } finally {
    await app.close();
  }
}

runLiveLmStudioTest();
