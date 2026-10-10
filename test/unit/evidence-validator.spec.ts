import { Test, TestingModule } from '@nestjs/testing';
import { EdmoLogger } from '../../src/common/logger.service';
import { LlmContext } from '../../src/context/interfaces/llm-context.interface';
import { EvidenceValidatorService } from '../../src/validation/evidence-validator.service';

describe('EvidenceValidatorService & Hallucination Detection', () => {
  let service: EvidenceValidatorService;

  const mockContext: LlmContext = {
    schema_version: 'llm-context-0.1',
    document: { type: 'transcript', page_count: 1 },
    student: {
      student_name: 'Sophia Jones',
      student_id: '2291829',
    },
    institution: {
      name: 'University of Oxford',
    },
    sections: [
      {
        title: 'Student Information',
        page: 1,
        fields: {
          'NAME': 'Sophia Jones',
          'STUDENT ID': '2291829',
        },
      },
    ],
    tables: [
      {
        table_id: 'table_p1_1',
        headers: ['course_code', 'course_title', 'credits'],
        rows: [
          ['ACCT 101', 'Intro to Accounting', '3'],
          ['ACCT 102', 'Introduction to Accounting II', '3'],
        ],
      },
    ],
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [EvidenceValidatorService, EdmoLogger],
    }).compile();

    service = module.get<EvidenceValidatorService>(EvidenceValidatorService);
  });

  it('should verify supported evidence with 0 hallucinations', () => {
    const candidate = {
      schema_version: 'edmo-transcript-0.1',
      document_type: 'transcript',
      student: {
        name: 'Sophia Jones',
        student_id: '2291829',
      },
      institution: {
        name: 'University of Oxford',
      },
      academic_records: [
        {
          course_code: 'ACCT 101',
          course_title: 'Intro to Accounting',
          credits: 3,
          evidence: {
            page: 1,
            source: 'table_p1_1',
            row: 0,
          },
        },
      ],
    };

    const summary = service.validateEvidence(mockContext, candidate);

    expect(summary.unsupported_values).toBe(0);
    expect(summary.missing_supported_values).toBe(0);
    expect(summary.supported_values).toBeGreaterThan(0);
  });

  it('should flag hallucinated course code as UNSUPPORTED_BY_EVIDENCE', () => {
    const candidateWithHallucination = {
      schema_version: 'edmo-transcript-0.1',
      document_type: 'transcript',
      student: {
        name: 'Sophia Jones',
        student_id: '2291829',
      },
      academic_records: [
        {
          course_code: 'CS999', // Hallucination: Not in document context!
          course_title: 'Quantum Hacking 101',
          credits: 4,
        },
      ],
    };

    const summary = service.validateEvidence(mockContext, candidateWithHallucination);

    expect(summary.unsupported_values).toBeGreaterThan(0);
    const flagged = summary.details.find(
      (d) => d.field === 'academic_records[0].course_code' && d.status === 'UNSUPPORTED_BY_EVIDENCE',
    );
    expect(flagged).toBeDefined();
    expect(flagged?.value).toBe('CS999');
  });

  it('should flag missing supported student name as MISSING_SUPPORTED_FIELD', () => {
    const candidateMissingField = {
      schema_version: 'edmo-transcript-0.1',
      document_type: 'transcript',
      student: {
        name: null, // Context has 'Sophia Jones', but model returned null
        student_id: '2291829',
      },
      institution: {
        name: 'University of Oxford',
      },
      academic_records: [],
    };

    const summary = service.validateEvidence(mockContext, candidateMissingField);

    expect(summary.missing_supported_values).toBe(1);
    const missing = summary.details.find(
      (d) => d.field === 'student.name' && d.status === 'MISSING_SUPPORTED_FIELD',
    );
    expect(missing).toBeDefined();
  });

  it('should flag invalid source reference pointers (e.g. out of bound rows)', () => {
    const candidateInvalidRef = {
      schema_version: 'edmo-transcript-0.1',
      document_type: 'transcript',
      academic_records: [
        {
          course_code: 'ACCT 101',
          course_title: 'Intro to Accounting',
          credits: 3,
          evidence: {
            page: 99, // Page 99 doesn't exist
            source: 'table_p1_1',
            row: 999, // Row 999 doesn't exist
          },
        },
      ],
    };

    const summary = service.validateEvidence(mockContext, candidateInvalidRef);
    expect(summary.invalid_source_references).toBeGreaterThan(0);
  });
});
