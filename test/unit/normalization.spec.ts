import { NormalizationService } from '../../src/validation/normalization.service';

describe('NormalizationService', () => {
  let service: NormalizationService;

  beforeEach(() => {
    service = new NormalizationService();
  });

  it('should trim whitespace from fields and parse numeric credits/GPA strings', () => {
    const raw = {
      student: {
        name: '   Sophia Jones   ',
        student_id: ' 2291829 ',
      },
      academic_records: [
        {
          course_code: '  ACCT 101 ',
          course_title: ' Intro to Accounting  ',
          credits: '3.0',
        },
      ],
      academic_summary: {
        cumulative_gpa: ' 3.437 ',
        total_credits_earned: ' 121 ',
      },
    };

    const normalized = service.normalizeTranscript(raw);

    expect(normalized.student.name).toBe('Sophia Jones');
    expect(normalized.student.student_id).toBe('2291829');
    expect(normalized.academic_records[0].course_code).toBe('ACCT 101');
    expect(normalized.academic_records[0].course_title).toBe('Intro to Accounting');
    expect(normalized.academic_records[0].credits).toBe(3.0);
    expect(normalized.academic_summary.cumulative_gpa).toBe(3.437);
    expect(normalized.academic_summary.total_credits_earned).toBe(121);
  });
});
