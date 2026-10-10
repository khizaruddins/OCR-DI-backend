import { Injectable } from '@nestjs/common';
import { OcrLogger } from '../common/logger.service';
import { LlmContext } from '../context/interfaces/llm-context.interface';
import {
  EvidenceItemStatus,
  EvidenceValidationDetail,
  EvidenceValidationSummary,
} from './interfaces/validation.interfaces';

@Injectable()
export class EvidenceValidatorService {
  constructor(private readonly logger: OcrLogger) {}

  validateEvidence(
    context: LlmContext,
    candidate: Record<string, unknown>,
  ): EvidenceValidationSummary {
    const details: EvidenceValidationDetail[] = [];
    const contextCorpus = this.buildContextCorpus(context);

    // 1. Validate top-level entity fields (student, institution, program)
    this.validateEntityField(
      candidate,
      'student.name',
      contextCorpus,
      details,
      context.student?.student_name || this.findFieldInSection(context, ['name', 'student_name', 'NAME']),
    );

    this.validateEntityField(
      candidate,
      'student.student_id',
      contextCorpus,
      details,
      context.student?.student_id || this.findFieldInSection(context, ['student_id', 'STUDENT ID', 'id']),
    );

    this.validateEntityField(
      candidate,
      'institution.name',
      contextCorpus,
      details,
      context.institution?.name || this.findFieldInSection(context, ['name', 'institution_name']),
    );

    // 2. Validate academic records
    const academicRecords = Array.isArray(candidate.academic_records)
      ? candidate.academic_records
      : [];

    let totalCandidateRecords = academicRecords.length;
    let supportedRecordCount = 0;

    academicRecords.forEach((record: Record<string, unknown>, idx: number) => {
      let recordHasEvidence = true;

      // Validate course_code if present
      if (record.course_code && typeof record.course_code === 'string') {
        const supported = this.isTextSupportedInContext(record.course_code, contextCorpus);
        if (!supported) {
          details.push({
            field: `academic_records[${idx}].course_code`,
            value: record.course_code,
            status: 'UNSUPPORTED_BY_EVIDENCE',
            evidenceRef: record.evidence,
            reason: `Course code '${record.course_code}' is not present in document evidence.`,
          });
          recordHasEvidence = false;
        } else {
          details.push({
            field: `academic_records[${idx}].course_code`,
            value: record.course_code,
            status: 'SUPPORTED',
            evidenceRef: record.evidence,
          });
        }
      }

      // Validate course_title if present
      if (record.course_title && typeof record.course_title === 'string') {
        const supported = this.isTextSupportedInContext(record.course_title, contextCorpus);
        if (!supported) {
          details.push({
            field: `academic_records[${idx}].course_title`,
            value: record.course_title,
            status: 'UNSUPPORTED_BY_EVIDENCE',
            evidenceRef: record.evidence,
            reason: `Course title '${record.course_title}' is not supported by document evidence.`,
          });
          recordHasEvidence = false;
        } else {
          details.push({
            field: `academic_records[${idx}].course_title`,
            value: record.course_title,
            status: 'SUPPORTED',
            evidenceRef: record.evidence,
          });
        }
      }

      // Validate grade if present
      if (record.grade && typeof record.grade === 'string') {
        const supported = this.isTextSupportedInContext(record.grade, contextCorpus);
        if (!supported) {
          details.push({
            field: `academic_records[${idx}].grade`,
            value: record.grade,
            status: 'UNSUPPORTED_BY_EVIDENCE',
            evidenceRef: record.evidence,
            reason: `Grade '${record.grade}' is not supported by document evidence.`,
          });
          recordHasEvidence = false;
        } else {
          details.push({
            field: `academic_records[${idx}].grade`,
            value: record.grade,
            status: 'SUPPORTED',
            evidenceRef: record.evidence,
          });
        }
      }

      // Validate source reference pointer if provided
      if (record.evidence && typeof record.evidence === 'object') {
        const refValid = this.validateSourceReference(context, record.evidence as Record<string, unknown>);
        if (!refValid) {
          details.push({
            field: `academic_records[${idx}].evidence`,
            value: record.evidence,
            status: 'SOURCE_REFERENCE_INVALID',
            evidenceRef: record.evidence,
            reason: `Evidence reference points to non-existent page/table/row in context.`,
          });
        }
      }

      if (recordHasEvidence) {
        supportedRecordCount++;
      }
    });

    // 3. Count categories
    let supportedValues = 0;
    let unsupportedValues = 0;
    let missingSupportedValues = 0;
    let invalidSourceReferences = 0;

    details.forEach((d) => {
      switch (d.status) {
        case 'SUPPORTED':
          supportedValues++;
          break;
        case 'UNSUPPORTED_BY_EVIDENCE':
          unsupportedValues++;
          break;
        case 'MISSING_SUPPORTED_FIELD':
          missingSupportedValues++;
          break;
        case 'SOURCE_REFERENCE_INVALID':
          invalidSourceReferences++;
          break;
      }
    });

    return {
      supported_values: supportedValues,
      unsupported_values: unsupportedValues,
      missing_supported_values: missingSupportedValues,
      invalid_source_references: invalidSourceReferences,
      details,
    };
  }

  private validateEntityField(
    candidate: Record<string, unknown>,
    fieldPath: string,
    contextCorpus: Set<string>,
    details: EvidenceValidationDetail[],
    expectedEvidenceValue?: unknown,
  ) {
    const value = this.getNestedValue(candidate, fieldPath);

    if (value !== null && value !== undefined && typeof value === 'string' && value.trim() !== '') {
      const supported = this.isTextSupportedInContext(value, contextCorpus);
      if (!supported) {
        details.push({
          field: fieldPath,
          value,
          status: 'UNSUPPORTED_BY_EVIDENCE',
          reason: `Value '${value}' for '${fieldPath}' is not supported by context evidence.`,
        });
      } else {
        details.push({
          field: fieldPath,
          value,
          status: 'SUPPORTED',
        });
      }
    } else {
      // Value is null or missing in candidate. Check if context had supported evidence.
      if (
        expectedEvidenceValue &&
        typeof expectedEvidenceValue === 'string' &&
        expectedEvidenceValue.trim().length > 0
      ) {
        details.push({
          field: fieldPath,
          value: null,
          status: 'MISSING_SUPPORTED_FIELD',
          reason: `Context contains supported evidence '${expectedEvidenceValue}' but candidate produced null.`,
        });
      }
    }
  }

  private buildContextCorpus(context: LlmContext): Set<string> {
    const corpus = new Set<string>();

    const addString = (str?: string | number | null) => {
      if (str === null || str === undefined) return;
      const clean = String(str).trim();
      if (clean.length > 0) {
        corpus.add(clean.toLowerCase());
        // Also add individual alphanumeric tokens if > 2 chars
        clean.split(/\s+/).forEach((tok) => {
          if (tok.length > 1) corpus.add(tok.toLowerCase());
        });
      }
    };

    // Index student
    if (context.student) {
      Object.values(context.student).forEach(addString);
    }
    // Index institution
    if (context.institution) {
      Object.values(context.institution).forEach(addString);
    }
    // Index academic
    if (context.academic) {
      Object.values(context.academic).forEach(addString);
    }
    // Index sections
    if (Array.isArray(context.sections)) {
      context.sections.forEach((sec) => {
        addString(sec.title);
        addString(sec.text);
        if (sec.fields) {
          Object.entries(sec.fields).forEach(([k, v]) => {
            addString(k);
            addString(v);
          });
        }
        if (Array.isArray(sec.paragraphs)) {
          sec.paragraphs.forEach(addString);
        }
      });
    }
    // Index tables
    if (Array.isArray(context.tables)) {
      context.tables.forEach((tbl) => {
        if (Array.isArray(tbl.headers)) {
          tbl.headers.forEach(addString);
        }
        if (Array.isArray(tbl.rows)) {
          tbl.rows.forEach((row) => {
            if (Array.isArray(row)) {
              row.forEach(addString);
            }
          });
        }
      });
    }

    return corpus;
  }

  private isTextSupportedInContext(text: string, corpus: Set<string>): boolean {
    const normalized = text.toLowerCase().trim();
    if (corpus.has(normalized)) {
      return true;
    }

    // Check if tokens of the candidate value exist in corpus
    const tokens = normalized.split(/\s+/).filter((t) => t.length > 1);
    if (tokens.length === 0) return true;

    // If at least 75% of meaningful tokens are found in corpus
    const matched = tokens.filter((t) => corpus.has(t)).length;
    return matched / tokens.length >= 0.75;
  }

  private validateSourceReference(
    context: LlmContext,
    evidence: Record<string, unknown>,
  ): boolean {
    const page = evidence.page as number | undefined;
    const source = evidence.source as string | undefined;
    const row = evidence.row as number | undefined;

    // Check page
    if (page !== undefined && page !== null) {
      const pageCount = context.document?.page_count || 1;
      if (page < 1 || page > pageCount + 5) {
        return false;
      }
    }

    // Check table if source is table_id
    if (source && Array.isArray(context.tables)) {
      const table = context.tables.find(
        (t) => t.table_id === source || (t.type && t.type === source),
      );
      if (table && row !== undefined && row !== null && Array.isArray(table.rows)) {
        if (row < 0 || row >= table.rows.length) {
          return false;
        }
      }
    }

    return true;
  }

  private findFieldInSection(
    context: LlmContext,
    fieldNames: string[],
  ): string | undefined {
    if (!Array.isArray(context.sections)) return undefined;

    for (const sec of context.sections) {
      if (sec.fields) {
        for (const name of fieldNames) {
          if (sec.fields[name]) {
            return String(sec.fields[name]);
          }
        }
      }
    }
    return undefined;
  }

  private getNestedValue(obj: Record<string, unknown>, path: string): unknown {
    const parts = path.split('.');
    let current: unknown = obj;
    for (const part of parts) {
      if (current === null || current === undefined || typeof current !== 'object') {
        return undefined;
      }
      current = (current as Record<string, unknown>)[part];
    }
    return current;
  }
}
