import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { EdmoLogger } from '../../src/common/logger.service';
import { ContextValidatorService } from '../../src/context/context-validator.service';
import { LlmContext, LlmContextReport } from '../../src/context/interfaces/llm-context.interface';

describe('ContextValidatorService', () => {
  let service: ContextValidatorService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ContextValidatorService,
        EdmoLogger,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key, defaultValue) => {
              if (key === 'validation.strictLoss') return true;
              return defaultValue;
            }),
          },
        },
      ],
    }).compile();

    service = module.get<ContextValidatorService>(ContextValidatorService);
  });

  it('should validate a valid LLM context', () => {
    const validContext: LlmContext = {
      schema_version: 'llm-context-0.1',
      document: {
        type: 'transcript',
        page_count: 1,
      },
      sections: [{ title: 'Student Info', page: 1 }],
      tables: [{ table_id: 'table_1', rows: [['CS101', 'Intro', '3']] }],
    };

    const result = service.validate(validContext);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.documentType).toBe('transcript');
  });

  it('should explicitly reject raw OCR JSON', () => {
    const rawOcr = {
      ocr_version: '1.0',
      pages: [
        {
          page_num: 1,
          words: [{ text: 'Hello', confidence: 95 }],
        },
      ],
    };

    const result = service.validate(rawOcr);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('REJECTED_RAW_OCR');
  });

  it('should reject invalid schema_version', () => {
    const invalidSchema = {
      schema_version: 'random-schema-1.0',
      document: { type: 'transcript', page_count: 1 },
    };

    const result = service.validate(invalidSchema);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain("Invalid or missing schema_version");
  });

  it('should enforce Loss Gate when unaccounted_loss == 0', () => {
    const validContext: LlmContext = {
      schema_version: 'llm-context-0.1',
      document: { type: 'transcript', page_count: 1 },
    };
    const perfectReport: LlmContextReport = {
      schema_version: 'llm-context-report-0.1',
      status: 'VERIFIED_ZERO_UNACCOUNTED_LOSS',
      loss_analysis: {
        total_source_items: 50,
        unaccounted_loss: 0,
      },
    };

    const result = service.validate(validContext, perfectReport);
    expect(result.valid).toBe(true);
    expect(result.lossGatePassed).toBe(true);
  });

  it('should reject context when unaccounted_loss > 0 in strict mode', () => {
    const validContext: LlmContext = {
      schema_version: 'llm-context-0.1',
      document: { type: 'transcript', page_count: 1 },
    };
    const lossyReport: LlmContextReport = {
      schema_version: 'llm-context-report-0.1',
      status: 'UNACCOUNTED_LOSS_DETECTED',
      loss_analysis: {
        total_source_items: 50,
        unaccounted_loss: 3,
      },
    };

    const result = service.validate(validContext, lossyReport, false);
    expect(result.valid).toBe(false);
    expect(result.lossGatePassed).toBe(false);
    expect(result.errors[0]).toContain('CONTEXT_VALIDATION_FAILED: unaccounted_loss is 3');
  });

  it('should allow override for lossy context when allowLossOverride is true', () => {
    const validContext: LlmContext = {
      schema_version: 'llm-context-0.1',
      document: { type: 'transcript', page_count: 1 },
    };
    const lossyReport: LlmContextReport = {
      schema_version: 'llm-context-report-0.1',
      status: 'UNACCOUNTED_LOSS_DETECTED',
      loss_analysis: {
        total_source_items: 50,
        unaccounted_loss: 2,
      },
    };

    const result = service.validate(validContext, lossyReport, true);
    expect(result.valid).toBe(true);
    expect(result.warnings.length).toBeGreaterThan(0);
  });
});
