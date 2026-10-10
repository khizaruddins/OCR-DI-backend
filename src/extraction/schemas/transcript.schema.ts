import { z } from 'zod';

export const EvidenceRefSchema = z.object({
  page: z.number().int().min(1).optional().nullable(),
  source: z.string().optional().nullable(),
  row: z.number().int().min(0).optional().nullable(),
  column: z.number().int().min(0).optional().nullable(),
  section: z.string().optional().nullable(),
  source_id: z.string().optional().nullable(),
});

export type EvidenceRef = z.infer<typeof EvidenceRefSchema>;

export const AcademicRecordSchema = z.object({
  course_code: z.string().nullable().default(null),
  course_title: z.string().nullable().default(null),
  credits: z.union([z.number(), z.string()]).nullable().default(null),
  grade: z.string().nullable().default(null),
  term: z.string().nullable().default(null),
  year: z.union([z.number(), z.string()]).nullable().default(null),
  evidence: EvidenceRefSchema.optional().nullable(),
});

export type AcademicRecord = z.infer<typeof AcademicRecordSchema>;

export const StudentInfoSchema = z.object({
  name: z.string().nullable().default(null),
  student_id: z.string().nullable().default(null),
  birthdate: z.string().nullable().default(null),
  address: z.string().nullable().default(null),
  ssn_last4: z.string().nullable().default(null),
  evidence: EvidenceRefSchema.optional().nullable(),
});

export type StudentInfo = z.infer<typeof StudentInfoSchema>;

export const InstitutionInfoSchema = z.object({
  name: z.string().nullable().default(null),
  code: z.string().nullable().default(null),
  address: z.string().nullable().default(null),
  registrar: z.string().nullable().default(null),
  evidence: EvidenceRefSchema.optional().nullable(),
});

export type InstitutionInfo = z.infer<typeof InstitutionInfoSchema>;

export const ProgramInfoSchema = z.object({
  degree: z.string().nullable().default(null),
  major: z.string().nullable().default(null),
  minor: z.string().nullable().default(null),
  school: z.string().nullable().default(null),
  department: z.string().nullable().default(null),
  evidence: EvidenceRefSchema.optional().nullable(),
});

export type ProgramInfo = z.infer<typeof ProgramInfoSchema>;

export const AcademicSummarySchema = z.object({
  cumulative_gpa: z.union([z.number(), z.string()]).nullable().default(null),
  term_gpa: z.union([z.number(), z.string()]).nullable().default(null),
  total_credits_attempted: z.union([z.number(), z.string()]).nullable().default(null),
  total_credits_earned: z.union([z.number(), z.string()]).nullable().default(null),
  standing: z.string().nullable().default(null),
  evidence: EvidenceRefSchema.optional().nullable(),
});

export type AcademicSummary = z.infer<typeof AcademicSummarySchema>;

export const GradingScaleItemSchema = z.object({
  grade: z.string(),
  grade_point: z.union([z.number(), z.string()]).nullable().default(null),
  description: z.string().nullable().default(null),
});

export const DegreeInformationSchema = z.object({
  degree_conferred: z.string().nullable().default(null),
  conferral_date: z.string().nullable().default(null),
  honors: z.string().nullable().default(null),
  evidence: EvidenceRefSchema.optional().nullable(),
});

export const TranscriptExtractionSchema = z.object({
  schema_version: z.literal('edmo-transcript-0.1').default('edmo-transcript-0.1'),
  document_type: z.literal('transcript').default('transcript'),
  student: StudentInfoSchema.default({
    name: null,
    student_id: null,
    birthdate: null,
    address: null,
    ssn_last4: null,
  }),
  institution: InstitutionInfoSchema.default({
    name: null,
    code: null,
    address: null,
    registrar: null,
  }),
  program: ProgramInfoSchema.default({
    degree: null,
    major: null,
    minor: null,
    school: null,
    department: null,
  }),
  academic_records: z.array(AcademicRecordSchema).default([]),
  academic_summary: AcademicSummarySchema.default({
    cumulative_gpa: null,
    term_gpa: null,
    total_credits_attempted: null,
    total_credits_earned: null,
    standing: null,
  }),
  grading_scale: z.array(GradingScaleItemSchema).default([]),
  degree_information: DegreeInformationSchema.default({
    degree_conferred: null,
    conferral_date: null,
    honors: null,
  }),
  additional_information: z.array(z.record(z.unknown())).default([]),
});

export type TranscriptExtractionData = z.infer<typeof TranscriptExtractionSchema>;

export const TRANSCRIPT_JSON_SCHEMA: Record<string, unknown> = {
  type: 'object',
  properties: {
    schema_version: { type: 'string', enum: ['edmo-transcript-0.1'] },
    document_type: { type: 'string', enum: ['transcript'] },
    student: {
      type: 'object',
      properties: {
        name: { type: ['string', 'null'] },
        student_id: { type: ['string', 'null'] },
        birthdate: { type: ['string', 'null'] },
      },
    },
    institution: {
      type: 'object',
      properties: {
        name: { type: ['string', 'null'] },
      },
    },
    program: {
      type: 'object',
      properties: {
        degree: { type: ['string', 'null'] },
        major: { type: ['string', 'null'] },
        minor: { type: ['string', 'null'] },
        school: { type: ['string', 'null'] },
      },
    },
    academic_records: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          course_code: { type: ['string', 'null'] },
          course_title: { type: ['string', 'null'] },
          credits: { type: ['number', 'string', 'null'] },
          grade: { type: ['string', 'null'] },
          term: { type: ['string', 'null'] },
          year: { type: ['string', 'number', 'null'] },
          evidence: {
            type: 'object',
            properties: {
              page: { type: 'number' },
              source: { type: 'string' },
              row: { type: 'number' },
              column: { type: 'number' },
            },
          },
        },
      },
    },
    academic_summary: {
      type: 'object',
      properties: {
        cumulative_gpa: { type: ['number', 'string', 'null'] },
        term_gpa: { type: ['number', 'string', 'null'] },
        total_credits_earned: { type: ['number', 'string', 'null'] },
      },
    },
    degree_information: {
      type: 'object',
      properties: {
        degree_conferred: { type: ['string', 'null'] },
        conferral_date: { type: ['string', 'null'] },
      },
    },
  },
  required: ['schema_version', 'document_type', 'academic_records'],
};
