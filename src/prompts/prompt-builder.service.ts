import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OcrLogger } from '../common/logger.service';
import { LlmContext } from '../context/interfaces/llm-context.interface';
import { BuiltPrompt, PromptTemplate } from './types/prompt.types';
import { TranscriptV1Prompt } from './versions/transcript.v1';

@Injectable()
export class PromptBuilderService {
  private readonly promptRegistry: Map<string, PromptTemplate> = new Map();
  private readonly defaultVersion: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly logger: OcrLogger,
  ) {
    this.defaultVersion = this.configService.get<string>(
      'prompts.defaultVersion',
      'transcript.v1',
    );
    this.registerPrompt(TranscriptV1Prompt);
  }

  registerPrompt(template: PromptTemplate) {
    const key = `${template.documentType}:${template.version}`;
    this.promptRegistry.set(key, template);
    this.promptRegistry.set(template.version, template); // direct version lookup
  }

  build(
    context: LlmContext,
    documentType = 'transcript',
    version?: string,
    schemaGuide?: string,
    schemaJson?: Record<string, unknown>,
  ): BuiltPrompt {
    const targetVersion = version || this.defaultVersion;
    const lookupKey = `${documentType}:${targetVersion}`;
    const template =
      this.promptRegistry.get(lookupKey) ||
      this.promptRegistry.get(targetVersion) ||
      TranscriptV1Prompt;

    this.logger.debug(
      `Building prompt for docType: ${documentType}, version: ${template.version}`,
    );

    const userPrompt = template.buildUserPrompt(context, schemaGuide);

    return {
      promptVersion: template.version,
      documentType: template.documentType,
      systemPrompt: template.systemPrompt,
      userPrompt,
      schemaJson,
    };
  }
}
