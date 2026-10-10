import { Injectable } from '@nestjs/common';
import { BenchmarkService, BenchmarkSummary } from './benchmark.service';

@Injectable()
export class EvaluationService {
  constructor(private readonly benchmarkService: BenchmarkService) {}

  async evaluateBatch(
    contextPaths: string[],
    model?: string,
    promptVersion?: string,
    outputPath?: string,
  ): Promise<BenchmarkSummary> {
    return this.benchmarkService.runBenchmark(
      contextPaths,
      model,
      promptVersion,
      outputPath,
    );
  }
}
