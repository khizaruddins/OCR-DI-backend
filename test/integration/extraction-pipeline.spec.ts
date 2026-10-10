import { ConfigModule } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import * as fs from 'fs';
import * as path from 'path';
import { LLM_PROVIDER_TOKEN } from '../../src/common/constants';
import { OcrLogger } from '../../src/common/logger.service';
import configuration from '../../src/config/configuration';
import { ContextModule } from '../../src/context/context.module';
import { DocumentsModule } from '../../src/documents/documents.module';
import { DocumentsService } from '../../src/documents/documents.service';
import { ExtractionModule } from '../../src/extraction/extraction.module';
import { LlmModule } from '../../src/llm/llm.module';
import { MockLlmProvider } from '../../src/llm/providers/mock.provider';
import { PromptModule } from '../../src/prompts/prompt.module';
import { ValidationModule } from '../../src/validation/validation.module';

describe('End-to-End Extraction Pipeline (Integration)', () => {
  let documentsService: DocumentsService;
  const testOutputDir = path.resolve(__dirname, '../../results/test_sophia_pipeline');

  beforeAll(async () => {
    process.env.LLM_PROVIDER = 'mock';

    const module: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          load: [
            () => ({
              ...configuration(),
              llm: {
                ...configuration().llm,
                provider: 'mock',
              },
            }),
          ],
        }),
        LlmModule,
        ContextModule,
        PromptModule,
        ExtractionModule,
        ValidationModule,
        DocumentsModule,
      ],
      providers: [OcrLogger],
    }).compile();

    documentsService = module.get<DocumentsService>(DocumentsService);
  });

  afterAll(() => {
    delete process.env.LLM_PROVIDER;
    if (fs.existsSync(testOutputDir)) {
      fs.rmSync(testOutputDir, { recursive: true, force: true });
    }
  });

  it('should run full extraction pipeline and produce auditable JSON artifacts', async () => {
    const contextPath = path.resolve(
      __dirname,
      '../../examples/transcript/sophia_jones_transcript/llm_context.json',
    );

    const response = await documentsService.processFileExtraction({
      context_file_path: contextPath,
      options: {
        output_dir: testOutputDir,
      },
    });

    expect(response.schema_version).toBe('ocr-intelligence-response-0.1');
    expect(response.model.provider).toBe('mock');
    expect(response.model.name).toBe('qwen3:8b');
    expect(response.validation.schema_valid).toBe(true);
    expect(response.validation.status).toBe('PASS');
    expect(response.candidate).toBeDefined();
    expect(response.validated).toBeDefined();

    // Verify all 5 JSON artifacts were written to output dir
    expect(fs.existsSync(path.join(testOutputDir, 'llm_request.json'))).toBe(true);
    expect(fs.existsSync(path.join(testOutputDir, 'llm_response.json'))).toBe(true);
    expect(fs.existsSync(path.join(testOutputDir, 'candidate_document.json'))).toBe(true);
    expect(fs.existsSync(path.join(testOutputDir, 'validation_report.json'))).toBe(true);
    expect(fs.existsSync(path.join(testOutputDir, 'validated_document.json'))).toBe(true);

    // Verify content of validated document
    const validatedDoc = JSON.parse(
      fs.readFileSync(path.join(testOutputDir, 'validated_document.json'), 'utf8'),
    );
    expect(validatedDoc.schema_version).toBe('edmo-transcript-0.1');
    expect(validatedDoc.student.name).toBe('Sophia Jones');
    expect(validatedDoc.academic_records.length).toBeGreaterThan(0);
  });
});
