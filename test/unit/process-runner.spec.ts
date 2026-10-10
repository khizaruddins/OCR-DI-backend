import { EdmoLogger } from '../../src/common/logger.service';
import { ProcessRunnerService } from '../../src/orchestration/process-runner.service';

describe('ProcessRunnerService', () => {
  let runner: ProcessRunnerService;
  let logger: EdmoLogger;

  beforeEach(() => {
    logger = new EdmoLogger();
    jest.spyOn(logger, 'debug').mockImplementation(() => {});
    jest.spyOn(logger, 'warn').mockImplementation(() => {});
    jest.spyOn(logger, 'error').mockImplementation(() => {});
    runner = new ProcessRunnerService(logger);
  });

  it('should successfully execute a basic shell command', async () => {
    const result = await runner.run('echo', ['hello world']);
    expect(result.exitCode).toBe(0);
    expect(result.stdout.trim()).toBe('hello world');
    expect(result.timedOut).toBe(false);
    expect(result.executionTimeMs).toBeGreaterThanOrEqual(0);
  });

  it('should capture standard error when command fails', async () => {
    const result = await runner.run('ls', ['--non-existent-flag-xyz']);
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr.length).toBeGreaterThan(0);
  });

  it('should terminate and report timedOut when execution exceeds timeoutMs', async () => {
    const result = await runner.run('sleep', ['2'], { timeoutMs: 100 });
    expect(result.timedOut).toBe(true);
    expect(result.exitCode).toBe(-1);
  });

  it('should handle non-existent binary paths gracefully', async () => {
    await expect(runner.run('/non/existent/path/to/binary', [])).rejects.toThrow();
  });
});
