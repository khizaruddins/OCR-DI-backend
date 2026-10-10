import { Injectable } from '@nestjs/common';
import { LlmRequest, StructuredLlmRequest } from '../dto/llm-request.dto';
import {
  LlmHealthStatus,
  LlmModelInfo,
  LlmResponse,
  LlmStructuredResponse,
} from '../dto/llm-response.dto';
import { LlmProvider } from '../interfaces/llm-provider.interface';

@Injectable()
export class MockLlmProvider implements LlmProvider {
  public readonly providerName = 'mock';
  private mockResponses: Map<string, string> = new Map();
  private defaultStructuredResponse: Record<string, unknown> | null = null;
  private isHealthy = true;

  setMockResponse(key: string, responseJson: string) {
    this.mockResponses.set(key, responseJson);
  }

  setDefaultStructuredResponse(response: Record<string, unknown>) {
    this.defaultStructuredResponse = response;
  }

  setHealth(healthy: boolean) {
    this.isHealthy = healthy;
  }

  async generate(request: LlmRequest): Promise<LlmResponse> {
    const rawText = JSON.stringify(this.defaultStructuredResponse || { status: 'mocked' });
    return {
      rawText,
      model: request.options?.model || 'mock-model',
      provider: this.providerName,
      latencyMs: 10,
      usage: {
        promptTokens: 100,
        completionTokens: 50,
        totalTokens: 150,
      },
    };
  }

  async generateStructured<T>(
    request: StructuredLlmRequest,
  ): Promise<LlmStructuredResponse<T>> {
    let data: T;
    let rawText: string;

    if (this.defaultStructuredResponse) {
      data = this.defaultStructuredResponse as unknown as T;
      rawText = JSON.stringify(this.defaultStructuredResponse);
    } else {
      // Create a default valid transcript mock
      const defaultMock: Record<string, unknown> = {
        schema_version: 'edmo-transcript-0.1',
        document_type: 'transcript',
        student: {
          name: 'Sophia Jones',
          student_id: '2291829',
          birthdate: 'Jun 26 1997',
        },
        institution: {
          name: 'University of Oxford',
        },
        program: {
          degree: 'BACHELORS IN ACCOUNTING & FINANCE',
          department: 'Accounting',
          major: 'Accounting & Finance',
          minor: null,
          school: 'Department of Accounting',
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
              column: 0,
            },
          },
          {
            course_code: 'ACCT 102',
            course_title: 'Introduction to Accounting II',
            credits: 3,
            grade: 'A',
            term: null,
            year: null,
            evidence: {
              page: 1,
              source: 'table_p1_1',
              row: 3,
              column: 0,
            },
          },
          {
            course_code: 'BUSI 499',
            course_title: 'Personal and Professional Development',
            credits: 3,
            grade: 'B',
            term: null,
            year: null,
            evidence: {
              page: 1,
              source: 'table_p1_1',
              row: 12,
              column: 0,
            },
          },
        ],
        academic_summary: {
          cumulative_gpa: null,
          term_gpa: null,
          total_credits_earned: 6,
        },
        grading_scale: [],
        degree_information: {
          degree_conferred: 'BACHELORS IN ACCOUNTING & FINANCE',
          conferral_date: '01/28/2019',
        },
        additional_information: [],
      };
      data = defaultMock as unknown as T;
      rawText = JSON.stringify(defaultMock);
    }

    return {
      data,
      rawText,
      model: request.options?.model || 'mock-model',
      provider: this.providerName,
      latencyMs: 15,
      usage: {
        promptTokens: 250,
        completionTokens: 120,
        totalTokens: 370,
      },
    };
  }

  async healthCheck(): Promise<LlmHealthStatus> {
    if (!this.isHealthy) {
      return {
        provider: this.providerName,
        model: 'mock-model',
        status: 'degraded',
        available: false,
        reason: 'MOCK_UNAVAILABLE: Mock provider forced unhealthy',
      };
    }
    return {
      provider: this.providerName,
      model: 'mock-model',
      status: 'healthy',
      available: true,
      details: { availableModels: ['mock-model', 'qwen3:8b'] },
    };
  }

  async getModelInfo(): Promise<LlmModelInfo> {
    return {
      provider: this.providerName,
      models: [
        {
          name: 'mock-model',
          provider: this.providerName,
          family: 'mock',
          parameterSize: '8B',
        },
      ],
    };
  }
}
