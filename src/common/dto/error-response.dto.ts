import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ApiErrorResponseDto {
  @ApiProperty({
    description: 'Machine-readable error code',
    example: 'CONTEXT_VALIDATION_FAILED',
  })
  error!: string;

  @ApiProperty({
    description: 'Human-readable error explanation message',
    example: 'Supplied LLM Context failed validation checks.',
  })
  message!: string;

  @ApiPropertyOptional({
    description: 'Array of detailed validation error descriptions or diagnostic messages',
    type: [String],
    example: ['CONTEXT_VALIDATION_FAILED: unaccounted_loss is 3 (> 0). Context quality gate failed.'],
  })
  details?: string[];
}

export class LlmUnavailableErrorResponseDto {
  @ApiProperty({
    description: 'Machine-readable error code',
    example: 'LLM_UNAVAILABLE',
  })
  error!: string;

  @ApiProperty({
    description: 'Human-readable error explanation message',
    example: 'The configured LLM inference server is not reachable.',
  })
  message!: string;

  @ApiProperty({
    description: 'Active LLM provider identifier',
    example: 'ollama',
  })
  provider!: string;

  @ApiProperty({
    description: 'Target LLM model name',
    example: 'qwen3:8b',
  })
  model!: string;
}
