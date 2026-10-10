import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { OcrLogger } from '../common/logger.service';
import { SchemaValidationResult } from './interfaces/validation.interfaces';

@Injectable()
export class SchemaValidatorService {
  constructor(private readonly logger: OcrLogger) {}

  validate<T>(schema: z.ZodType<T>, data: unknown): SchemaValidationResult {
    const result = schema.safeParse(data);
    if (result.success) {
      return {
        valid: true,
        errors: [],
      };
    }

    const errors = result.error.errors.map((err: z.ZodIssue) => ({
      path: err.path.join('.'),
      message: err.message,
    }));

    this.logger.debug(`Schema validation reported ${errors.length} error(s)`, { errors });

    return {
      valid: false,
      errors,
    };
  }
}
