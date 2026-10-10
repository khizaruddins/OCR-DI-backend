import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { EdmoLogger } from '../common/logger.service';
import { GenericDocumentSchema } from './schemas/generic-document.schema';
import {
  TRANSCRIPT_JSON_SCHEMA,
  TranscriptExtractionSchema,
} from './schemas/transcript.schema';

export interface DocumentRoutingStrategy {
  documentType: string;
  defaultPromptVersion: string;
  schema: z.ZodTypeAny;
  jsonSchema?: Record<string, unknown>;
  schemaGuide?: string;
}

@Injectable()
export class DocumentRouterService {
  private readonly routes: Map<string, DocumentRoutingStrategy> = new Map();

  constructor(private readonly logger: EdmoLogger) {
    this.registerDefaultRoutes();
  }

  private registerDefaultRoutes() {
    this.routes.set('transcript', {
      documentType: 'transcript',
      defaultPromptVersion: 'transcript.v1',
      schema: TranscriptExtractionSchema,
      jsonSchema: TRANSCRIPT_JSON_SCHEMA,
      schemaGuide: `Output JSON matching edmo-transcript-0.1:
{
  "schema_version": "edmo-transcript-0.1",
  "document_type": "transcript",
  "student": { "name": null, "student_id": null, "birthdate": null },
  "institution": { "name": null },
  "program": { "degree": null, "major": null, "minor": null, "school": null },
  "academic_records": [
    {
      "course_code": "...",
      "course_title": "...",
      "credits": 3,
      "grade": "A",
      "term": null,
      "year": null,
      "evidence": { "page": 1, "source": "table_p1_1", "row": 0, "column": 0 }
    }
  ],
  "academic_summary": { "cumulative_gpa": null, "term_gpa": null, "total_credits_earned": null },
  "degree_information": { "degree_conferred": null, "conferral_date": null }
}`,
    });

    this.routes.set('generic', {
      documentType: 'generic',
      defaultPromptVersion: 'generic.v1',
      schema: GenericDocumentSchema,
      jsonSchema: undefined,
      schemaGuide: undefined,
    });
  }

  route(documentType?: string): DocumentRoutingStrategy {
    const normalizedType = (documentType || 'transcript').toLowerCase().trim();
    const strategy = this.routes.get(normalizedType);

    if (strategy) {
      return strategy;
    }

    this.logger.warn(
      `No specialized route for document type '${documentType}', falling back to generic`,
    );
    return this.routes.get('generic')!;
  }
}
