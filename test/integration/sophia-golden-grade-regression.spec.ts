import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import * as fs from 'fs';
import * as request from 'supertest';
import { AppModule } from '../../src/app.module';

describe('Sophia Jones Golden Transcript Grade Regression Suite', () => {
  let app: INestApplication;
  const sophiaPdfPath = '/home/khizaruddin/Downloads/Sophia Jones Transcript.pdf';

  const expectedCourses: { code: string; titleSubstring: string; credits: number; grade: string }[] = [
    { code: 'ACCT 101', titleSubstring: 'Intro to Accounting', credits: 3.0, grade: 'A' },
    { code: 'ACCT 102', titleSubstring: 'Introduction to Accounting II', credits: 3.0, grade: 'A' },
    { code: 'FINC 201', titleSubstring: 'Raising Individual Financial Awareness', credits: 3.0, grade: 'A' },
    { code: 'BUSI 203', titleSubstring: 'Essential Information Skills', credits: 3.0, grade: 'A' },
    { code: 'BUSI 101', titleSubstring: 'Foundations of Business', credits: 3.0, grade: 'A' },
    { code: 'ACCT 301', titleSubstring: 'Business Accounting Systems', credits: 3.0, grade: 'B' },
    { code: 'ACCT 401', titleSubstring: 'Financial Accounting and Reporting', credits: 3.0, grade: 'C' },
    { code: 'ACCT 402', titleSubstring: 'Management Accounting', credits: 3.0, grade: 'A' },
    { code: 'FINC 301', titleSubstring: 'Corporate Finance', credits: 3.0, grade: 'B' },
    { code: 'ACCT 601', titleSubstring: 'Research in Accounting', credits: 3.0, grade: 'B' },
    { code: 'BUSI 499', titleSubstring: 'Personal and Professional Development', credits: 3.0, grade: 'B' },
    { code: 'AUDT 301', titleSubstring: 'Introduction to Auditing Theory and Practice', credits: 3.0, grade: 'B' },
    { code: 'MIS 301', titleSubstring: 'Management Information Systems', credits: 3.0, grade: 'A' },
    { code: 'LAW 301', titleSubstring: 'Corporate and Business Law', credits: 2.0, grade: 'C' },
    { code: 'TAX 301', titleSubstring: 'Personal Taxation', credits: 3.0, grade: 'C' },
  ];

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('End-to-End Pipeline on Sophia Jones Transcript', () => {
    it(
      'should process with default DPI (omitted) and validate result.courses, identity, zero loss, and LLM gate',
      async () => {
        expect(fs.existsSync(sophiaPdfPath)).toBe(true);
        const fileBuffer = await fs.promises.readFile(sophiaPdfPath);

        const res = await request(app.getHttpServer())
          .post('/v1/documents/process')
          .attach('file', fileBuffer, 'Sophia_Jones_Transcript.pdf')
          .field('documentType', 'transcript')
          .field('runLlm', 'false')
          .field('debug', 'true')
          .expect(200);

        expect(res.body.success).toBe(true);
        expect(res.body.pipeline.status).toBe('FINAL_DOCUMENT_READY');
        expect(res.body.document_readiness).toBe('READY');
        expect(res.body.next_action).toBe('NONE');

        // 1. Verify actual rasterization resolution defaults to 300 DPI (2550 x 3300)
        expect(res.body.enhanced_edr).toBeDefined();
        expect(res.body.enhanced_edr.pages).toBeInstanceOf(Array);
        expect(res.body.enhanced_edr.pages[0].width).toBe(2550);
        expect(res.body.enhanced_edr.pages[0].height).toBe(3300);

        // 2. Validate final result.courses array contains all 15 expected courses
        expect(res.body.result).toBeDefined();
        const resultCourses = res.body.result.courses;
        expect(resultCourses).toBeInstanceOf(Array);
        expect(resultCourses.length).toBe(15);

        const coursesByCode = new Map<string, any>();
        for (const c of resultCourses) {
          coursesByCode.set(c.course_code, c);
        }

        for (const exp of expectedCourses) {
          const actual = coursesByCode.get(exp.code);
          expect(actual).toBeDefined();
          expect(actual.course_code).toBe(exp.code);
          expect(actual.course_title).toContain(exp.titleSubstring);
          expect(Number(actual.credits)).toBe(exp.credits);
          expect(actual.grade).toBe(exp.grade);
          expect(actual.grade).not.toBeNull();
          expect(actual.status).toBe('COMPLETED');
        }

        // 3. Regression coverage for multi-line wrapped course title (AUDT 301 line wrap "Practice")
        const audt301 = coursesByCode.get('AUDT 301');
        expect(audt301.course_title).toBe('Introduction to Auditing Theory and Practice');
        expect(audt301.grade).toBe('B');

        // 4. Regression coverage for noisy single-char grade normalization (Cc -> C)
        const acct401 = coursesByCode.get('ACCT 401');
        expect(acct401.grade).toBe('C');
        const law301 = coursesByCode.get('LAW 301');
        expect(law301.grade).toBe('C');
        const tax301 = coursesByCode.get('TAX 301');
        expect(tax301.grade).toBe('C');

        // 5. Assert no spurious pseudo-course rows are created
        expect(coursesByCode.has('Practice')).toBe(false);
        expect(coursesByCode.has('GRADE')).toBe(false);
        expect(coursesByCode.has('A')).toBe(false);

        // 6. Assert student identity
        const student = res.body.result.student;
        expect(student).toBeDefined();
        expect(student.name).toBe('Sophia Jones');
        expect(student.student_id).toBe('2291829');
        expect(student.birthdate).toBe('Jun 26 1997');

        // 7. Assert academic program
        const program = res.body.result.program;
        expect(program).toBeDefined();
        expect(program.department).toBe('Accounting');
        expect(program.major).toBe('Accounting & Finance');

        // 8. Assert institution
        expect(res.body.result.institution).toBeDefined();
        expect(res.body.result.institution.name).toBe('University of Oxford');

        // 9. Assert LLM gate is preserved (skipped when all required fields are resolved)
        expect(res.body.llm.required).toBe(false);
        expect(res.body.llm.called).toBe(false);
        expect(res.body.llm.task_count).toBe(0);
        const llmStage = res.body.pipeline.stages.find((s: any) => s.stage === 'LLM_INFERENCE');
        expect(llmStage).toBeDefined();
        expect(llmStage.status).toBe('SKIPPED');
        expect(llmStage.reason).toBe('NO_UNRESOLVED_FIELDS');

        // 10. Assert Zero-Loss audit metrics
        expect(res.body.evidence.available).toBe(true);
        expect(res.body.evidence.zero_loss_verified).toBe(true);
        expect(res.body.evidence.unaccounted_loss).toBe(0);
        expect(res.body.enhanced_edr.audit.zero_loss).toBe(true);
        expect(res.body.enhanced_edr.audit.unaccounted_loss).toBe(0);

        // 11. Assert finalization report missing fields analysis
        expect(res.body.finalization_report).toBeDefined();
        expect(res.body.finalization_report.status).toBe('COMPLETED');
        expect(res.body.finalization_report.fields_missing).toBe(3);
        expect(res.body.finalization_report.fields_projected).toBeGreaterThanOrEqual(50);
        expect(res.body.result.program.degree).toBeNull();
        expect(res.body.result.summary.gpa).toBeNull();
        expect(res.body.result.summary.total_credits_earned).toBeNull();
      },
      30000,
    );

    it(
      'should process with explicit 200 DPI and propagate rasterization resolution (1700x2200) with all 15 grades',
      async () => {
        expect(fs.existsSync(sophiaPdfPath)).toBe(true);
        const fileBuffer = await fs.promises.readFile(sophiaPdfPath);

        const res = await request(app.getHttpServer())
          .post('/v1/documents/process')
          .attach('file', fileBuffer, 'Sophia_Jones_Transcript.pdf')
          .field('documentType', 'transcript')
          .field('dpi', '200')
          .field('runLlm', 'false')
          .expect(200);

        expect(res.body.success).toBe(true);
        expect(res.body.pipeline.status).toBe('FINAL_DOCUMENT_READY');

        // Verify rasterization resolution matches 200 DPI (1700 x 2200)
        expect(res.body.enhanced_edr.pages[0].width).toBe(1700);
        expect(res.body.enhanced_edr.pages[0].height).toBe(2200);

        // Verify all 15 course grades are non-null
        const courses = res.body.result.courses;
        expect(courses.length).toBe(15);
        for (const c of courses) {
          expect(c.grade).toBeTruthy();
          expect(typeof c.grade).toBe('string');
        }
      },
      30000,
    );

    it(
      'should process with explicit 300 DPI and propagate rasterization resolution (2550x3300) with all 15 grades',
      async () => {
        expect(fs.existsSync(sophiaPdfPath)).toBe(true);
        const fileBuffer = await fs.promises.readFile(sophiaPdfPath);

        const res = await request(app.getHttpServer())
          .post('/v1/documents/process')
          .attach('file', fileBuffer, 'Sophia_Jones_Transcript.pdf')
          .field('documentType', 'transcript')
          .field('dpi', '300')
          .field('runLlm', 'false')
          .expect(200);

        expect(res.body.success).toBe(true);
        expect(res.body.pipeline.status).toBe('FINAL_DOCUMENT_READY');

        // Verify rasterization resolution matches 300 DPI (2550 x 3300)
        expect(res.body.enhanced_edr.pages[0].width).toBe(2550);
        expect(res.body.enhanced_edr.pages[0].height).toBe(3300);

        // Verify all 15 course grades are non-null
        const courses = res.body.result.courses;
        expect(courses.length).toBe(15);
        for (const c of courses) {
          expect(c.grade).toBeTruthy();
          expect(typeof c.grade).toBe('string');
        }
      },
      30000,
    );
  });
});
