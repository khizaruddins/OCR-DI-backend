import axios from 'axios';
import * as path from 'path';
const chalk = require('chalk');
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../../src/app.module';
import { DocumentsService } from '../../src/documents/documents.service';

async function runLiveOllamaTest() {
  console.log(chalk.cyan.bold('\n======================================================'));
  console.log(chalk.cyan.bold('  EDMO Live Ollama Integration Test (Qwen3-8B)'));
  console.log(chalk.cyan.bold('======================================================\n'));

  const ollamaUrl = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
  const targetModel = process.env.OLLAMA_MODEL || 'qwen3:8b';

  console.log(chalk.gray(`Probing Ollama at ${ollamaUrl}...`));

  let isOllamaRunning = false;
  let hasTargetModel = false;
  let availableModels: string[] = [];

  try {
    const res = await axios.get(`${ollamaUrl}/api/tags`, { timeout: 3000 });
    isOllamaRunning = true;
    availableModels = (res.data?.models || []).map((m: { name: string }) => m.name);
    hasTargetModel = availableModels.some(
      (m) => m === targetModel || m.startsWith(`${targetModel}:`) || m.startsWith(targetModel.split(':')[0]),
    );
  } catch {
    isOllamaRunning = false;
  }

  if (!isOllamaRunning) {
    console.log(
      chalk.yellow.bold(
        `[SKIPPED] Ollama daemon is not running on ${ollamaUrl}. Skipping live LLM inference test.`,
      ),
    );
    console.log(chalk.gray('To run live test, start Ollama: ollama serve && ollama pull qwen3:8b\n'));
    process.exit(0);
  }

  if (!hasTargetModel) {
    console.log(
      chalk.yellow.bold(
        `[SKIPPED] Ollama is running, but model '${targetModel}' is not pulled. Available: [${availableModels.join(', ')}]`,
      ),
    );
    console.log(chalk.gray(`To pull the model, run: ollama pull ${targetModel}\n`));
    process.exit(0);
  }

  console.log(chalk.green(`✔ Ollama is online and model '${targetModel}' is ready.`));
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

    console.log(chalk.green.bold('\n✔ Live Qwen3-8B Inference Test Passed!'));
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
    console.error(chalk.red.bold(`Live inference test failed: ${msg}`));
    process.exit(1);
  } finally {
    await app.close();
  }
}

runLiveOllamaTest();
