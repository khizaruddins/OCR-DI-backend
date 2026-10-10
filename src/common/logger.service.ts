import { Injectable, LoggerService } from '@nestjs/common';
import pino from 'pino';

@Injectable()
export class OcrLogger implements LoggerService {
  private readonly logger: pino.Logger;

  constructor() {
    const isDev = process.env.NODE_ENV !== 'production';
    this.logger = pino({
      level: process.env.LOG_LEVEL || 'info',
      transport: isDev
        ? {
            target: 'pino-pretty',
            options: {
              colorize: true,
              translateTime: 'SYS:standard',
              ignore: 'pid,hostname',
            },
          }
        : undefined,
      redact: {
        paths: [
          'student_name',
          'student.name',
          'student_id',
          'student.student_id',
          'birthdate',
          'student.birthdate',
          '*.student_name',
          '*.student_id',
        ],
        censor: '[REDACTED_PII]',
      },
    });
  }

  log(message: string, context?: Record<string, unknown> | string) {
    if (typeof context === 'object') {
      this.logger.info(context, message);
    } else {
      this.logger.info({ context }, message);
    }
  }

  error(message: string, trace?: string, context?: Record<string, unknown> | string) {
    if (typeof context === 'object') {
      this.logger.error({ ...context, trace }, message);
    } else {
      this.logger.error({ context, trace }, message);
    }
  }

  warn(message: string, context?: Record<string, unknown> | string) {
    if (typeof context === 'object') {
      this.logger.warn(context, message);
    } else {
      this.logger.warn({ context }, message);
    }
  }

  debug(message: string, context?: Record<string, unknown> | string) {
    if (typeof context === 'object') {
      this.logger.debug(context, message);
    } else {
      this.logger.debug({ context }, message);
    }
  }

  verbose(message: string, context?: Record<string, unknown> | string) {
    if (typeof context === 'object') {
      this.logger.trace(context, message);
    } else {
      this.logger.trace({ context }, message);
    }
  }
}

export { OcrLogger as EdmoLogger };
