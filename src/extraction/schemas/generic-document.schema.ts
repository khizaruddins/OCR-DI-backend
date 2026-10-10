import { z } from 'zod';
import { EvidenceRefSchema } from './transcript.schema';

export const GenericDocumentSchema = z.object({
  schema_version: z.string().default('ocr-document-0.1'),
  document_type: z.string(),
  title: z.string().nullable().default(null),
  entities: z
    .array(
      z.object({
        name: z.string(),
        value: z.union([z.string(), z.number(), z.boolean()]).nullable(),
        category: z.string().optional(),
        evidence: EvidenceRefSchema.optional().nullable(),
      }),
    )
    .default([]),
  sections: z
    .array(
      z.object({
        heading: z.string().nullable(),
        content: z.string().nullable(),
        evidence: EvidenceRefSchema.optional().nullable(),
      }),
    )
    .default([]),
  metadata: z.record(z.unknown()).default({}),
});

export type GenericDocumentData = z.infer<typeof GenericDocumentSchema>;
