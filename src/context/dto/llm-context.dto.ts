import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class LlmContextDocumentDto {
  @ApiProperty({
    description: 'Document category type',
    example: 'transcript',
  })
  type!: string;

  @ApiProperty({
    description: 'Total number of pages in the source document',
    example: 1,
  })
  page_count!: number;

  @ApiPropertyOptional({
    description: 'Array of page indices present in this context slice',
    type: [Number],
    example: [1],
  })
  pages_present?: number[];

  @ApiPropertyOptional({
    description: 'ISO language code detected from document text',
    example: 'en',
  })
  language?: string;

  @ApiPropertyOptional({
    description: 'Unique document identifier',
    example: 'doc_101_boston_transcript',
  })
  id?: string;
}

export class LlmContextSectionDto {
  @ApiPropertyOptional({
    description: 'Section heading or label',
    example: 'Student Information',
  })
  title?: string;

  @ApiPropertyOptional({
    description: 'Section category classification',
    example: 'header_metadata',
  })
  type?: string;

  @ApiPropertyOptional({
    description: 'Source page index for section content',
    example: 1,
  })
  page?: number;

  @ApiPropertyOptional({
    description: 'Structured key-value pairs identified within the section',
    example: {
      student_name: 'Sophia Jones',
      student_id: 'S12345678',
      major: 'Computer Science',
    },
  })
  fields?: Record<string, string | number | null>;

  @ApiPropertyOptional({
    description: 'Paragraph text blocks within section',
    type: [String],
    example: ['Student is in good academic standing.'],
  })
  paragraphs?: string[];

  @ApiPropertyOptional({
    description: 'Raw aggregated section text',
    example: 'Student: Sophia Jones | ID: S12345678',
  })
  text?: string;
}

export class LlmContextTableDto {
  @ApiPropertyOptional({
    description: 'Identifier of the extracted table',
    example: 'table_page1_1',
  })
  table_id?: string;

  @ApiPropertyOptional({
    description: 'Semantic table classification',
    example: 'course_grades',
  })
  type?: string;

  @ApiPropertyOptional({
    description: 'Table header column names',
    type: [String],
    example: ['Course Code', 'Course Title', 'Credits', 'Grade'],
  })
  headers?: string[];

  @ApiPropertyOptional({
    description: 'Grid of table rows containing cell strings, numbers or nulls',
    example: [
      ['CS101', 'Intro to Computer Science', 3.0, 'A'],
      ['MATH201', 'Calculus II', 4.0, 'B+'],
    ],
  })
  rows?: Array<Array<string | number | null>>;

  @ApiPropertyOptional({
    description: 'Page range spanning the table',
    type: [Number],
    example: [1, 1],
  })
  page_range?: [number, number];

  @ApiPropertyOptional({
    description: 'Single page index where table appears',
    example: 1,
  })
  page?: number;
}

export class LlmContextDto {
  @ApiProperty({
    description: 'Schema version of the OCR context builder output',
    example: 'llm-context-0.1',
  })
  schema_version!: string;

  @ApiProperty({
    description: 'Document metadata',
    type: () => LlmContextDocumentDto,
  })
  document!: LlmContextDocumentDto;

  @ApiPropertyOptional({
    description: 'Academic institution metadata',
    example: { name: 'Boston University', code: 'BU' },
  })
  institution?: Record<string, unknown>;

  @ApiPropertyOptional({
    description: 'Student identification metadata',
    example: { student_name: 'Sophia Jones', student_id: 'S12345678' },
  })
  student?: Record<string, unknown>;

  @ApiPropertyOptional({
    description: 'Academic summary metadata (e.g. cumulative GPA, degree, dates)',
    example: { cumulative_gpa: 3.85, degree_name: 'Bachelor of Science' },
  })
  academic?: Record<string, unknown>;

  @ApiPropertyOptional({
    description: 'Structured text sections extracted from document',
    type: () => [LlmContextSectionDto],
  })
  sections?: LlmContextSectionDto[];

  @ApiPropertyOptional({
    description: 'Structured tables extracted from document (e.g. course lists, terms)',
    type: () => [LlmContextTableDto],
  })
  tables?: LlmContextTableDto[];

  @ApiPropertyOptional({
    description: 'OCR noise or non-semantic unclassified fragments',
    type: [Object],
  })
  unclassified_content?: unknown[];

  @ApiPropertyOptional({
    description: 'Quality warnings generated during OCR and context synthesis',
    type: [String],
    example: [],
  })
  warnings?: string[];

  @ApiPropertyOptional({
    description: 'Estimated token count of this context representation',
    example: 840,
  })
  estimated_tokens?: number;

  @ApiPropertyOptional({
    description: 'Running header text',
    example: 'Official Academic Transcript',
  })
  document_header?: string;

  @ApiPropertyOptional({
    description: 'Running footer text',
    example: 'Page 1 of 1',
  })
  document_footer?: string;
}
