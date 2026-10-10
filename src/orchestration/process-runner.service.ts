import { Injectable } from '@nestjs/common';
import { spawn } from 'child_process';
import * as path from 'path';
import { OcrLogger } from '../common/logger.service';

export interface ProcessRunOptions {
  cwd?: string;
  timeoutMs?: number;
  env?: Record<string, string>;
}

export interface ProcessRunResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  executionTimeMs: number;
  timedOut: boolean;
}

@Injectable()
export class ProcessRunnerService {
  constructor(private readonly logger: OcrLogger) {}

  async run(
    executable: string,
    args: string[],
    options: ProcessRunOptions = {},
  ): Promise<ProcessRunResult> {
    const startTime = Date.now();
    const timeoutMs = options.timeoutMs || 60000;

    const execPath = path.isAbsolute(executable)
      ? executable
      : executable.includes(path.sep) || executable.includes('/')
      ? path.resolve(process.cwd(), executable)
      : executable;

    this.logger.debug(
      'Executing subprocess',
      { executable: execPath, args, cwd: options.cwd, timeoutMs },
    );

    return new Promise<ProcessRunResult>((resolve, reject) => {
      let childProcess: ReturnType<typeof spawn> | null = null;
      let isTimedOut = false;
      let timeoutHandle: NodeJS.Timeout | null = null;

      try {
        childProcess = spawn(execPath, args, {
          cwd: options.cwd,
          env: { ...process.env, ...options.env },
          shell: false,
          detached: process.platform !== 'win32', // Allows killing process tree via negative PID
        });
      } catch (err: unknown) {
        return reject(
          new Error(
            `Failed to spawn process ${executable}: ${err instanceof Error ? err.message : String(err)}`,
          ),
        );
      }

      let stdoutData = '';
      let stderrData = '';

      if (childProcess.stdout) {
        childProcess.stdout.setEncoding('utf8');
        childProcess.stdout.on('data', (chunk: string) => {
          stdoutData += chunk;
        });
      }

      if (childProcess.stderr) {
        childProcess.stderr.setEncoding('utf8');
        childProcess.stderr.on('data', (chunk: string) => {
          stderrData += chunk;
        });
      }

      const killProcessTree = () => {
        if (!childProcess || childProcess.killed) return;
        try {
          if (process.platform !== 'win32' && childProcess.pid) {
            process.kill(-childProcess.pid, 'SIGKILL');
          } else {
            childProcess.kill('SIGKILL');
          }
        } catch {
          // Process may have already exited
        }
      };

      timeoutHandle = setTimeout(() => {
        isTimedOut = true;
        this.logger.warn(
          'Subprocess timed out, killing process tree',
          { executable, timeoutMs, pid: childProcess?.pid },
        );
        killProcessTree();
      }, timeoutMs);

      childProcess.on('error', (err: Error) => {
        if (timeoutHandle) clearTimeout(timeoutHandle);
        this.logger.error('Subprocess error', err.stack, { executable, error: err.message });
        reject(err);
      });

      childProcess.on('close', (code: number | null, signal: string | null) => {
        if (timeoutHandle) clearTimeout(timeoutHandle);
        const executionTimeMs = Date.now() - startTime;

        const effectiveExitCode = isTimedOut
          ? -1
          : code !== null
          ? code
          : signal
          ? 128
          : 0;

        resolve({
          exitCode: effectiveExitCode,
          stdout: stdoutData,
          stderr: stderrData,
          executionTimeMs,
          timedOut: isTimedOut,
        });
      });
    });
  }
}
