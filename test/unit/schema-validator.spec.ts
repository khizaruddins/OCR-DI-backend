import { Test, TestingModule } from '@nestjs/testing';
import { EdmoLogger } from '../../src/common/logger.service';
import { TranscriptExtractionSchema } from '../../src/extraction/schemas/transcript.schema';
import { SchemaValidatorService } from '../../src/validation/schema-validator.service';

describe('SchemaValidatorService', () => {
  let service: SchemaValidatorService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [SchemaValidatorService, EdmoLogger],
    }).compile();

    service = module.get<SchemaValidatorService>(SchemaValidatorService);
  });

  it('should pass valid transcript candidate data', () => {
    const validData = {
      schema_version: 'edmo-transcript-0.1',
      document_type: 'transcript',
      student: {
        name: 'Sophia Jones',
        student_id: '2291829',
        birthdate: null,
      },
      institution: {
        name: 'University of Oxford',
      },
      program: {
        degree: 'Bachelors',
        major: 'Accounting',
      },
      academic_records: [
        {
          course_code: 'ACCT 101',
          course_title: 'Intro to Accounting',
          credits: 3,
          grade: 'A',
          term: null,
          year: null,
          evidence: {
            page: 1,
            source: 'table_p1_1',
            row: 1,
          },
        },
      ],
      academic_summary: {
        cumulative_gpa: 3.8,
        total_credits_earned: 3,
      },
    };

    const result = service.validate(TranscriptExtractionSchema, validData);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('should accept nulls for nullable fields without forcing values', () => {
    const nullableData = {
      schema_version: 'edmo-transcript-0.1',
      document_type: 'transcript',
      student: {
        name: null,
        student_id: null,
      },
      institution: {
        name: null,
      },
      program: {
        degree: null,
        major: null,
      },
      academic_records: [
        {
          course_code: null,
          course_title: 'Unidentified Course',
          credits: null,
          grade: null,
          term: null,
          year: null,
        },
      ],
    };

    const result = service.validate(TranscriptExtractionSchema, nullableData);
    expect(result.valid).toBe(true);
  });

  it('should fail when schema_version or document_type is wrong', () => {
    const invalidData = {
      schema_version: 'wrong-version',
      document_type: 'unknown',
    };

    const result = service.validate(TranscriptExtractionSchema, invalidData);
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });
});
