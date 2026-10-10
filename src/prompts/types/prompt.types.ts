import { LlmContext } from '../../context/interfaces/llm-context.interface';

export interface PromptTemplate {
  version: string;
  documentType: string;
  systemPrompt: string;
  buildUserPrompt: (context: LlmContext, schemaGuide?: string) => string;
}

export interface BuiltPrompt {
  promptVersion: string;
  documentType: string;
  systemPrompt: string;
  userPrompt: string;
  schemaJson?: Record<string, unknown>;
}
