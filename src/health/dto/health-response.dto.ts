import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class LlmHealthInfoDto {
  @ApiProperty({
    description: 'LLM provider name',
    example: 'lmstudio',
  })
  provider!: string;

  @ApiProperty({
    description: 'Configured LLM model name',
    example: 'qwen3-8b-mlx',
  })
  model!: string;

  @ApiProperty({
    description: 'LLM provider connectivity status',
    enum: ['healthy', 'degraded', 'unhealthy'],
    example: 'healthy',
  })
  status!: 'healthy' | 'degraded' | 'unhealthy';

  @ApiProperty({
    description: 'Whether the LLM inference provider is active and ready to accept prompts',
    example: true,
  })
  available!: boolean;

  @ApiPropertyOptional({
    description: 'Reason or diagnostic message when provider is degraded or unavailable',
    example: 'Connected to LM Studio on http://192.168.0.104:1234/v1',
  })
  reason?: string;
}

export class OllamaHealthInfoDto extends LlmHealthInfoDto {}

export class HealthResponseDto {
  @ApiProperty({
    description: 'Service identifier',
    example: 'edmo-di-llm-backend',
  })
  service!: string;

  @ApiProperty({
    description: 'Engine release version',
    example: '0.1.0',
  })
  version!: string;

  @ApiProperty({
    description: 'Overall system service health status',
    enum: ['healthy', 'degraded'],
    example: 'healthy',
  })
  status!: 'healthy' | 'degraded';

  @ApiProperty({
    description: 'Underlying LLM runtime health details',
    type: () => LlmHealthInfoDto,
  })
  llm?: LlmHealthInfoDto;

  @ApiPropertyOptional({
    description: 'Legacy alias for LLM health details',
    type: () => OllamaHealthInfoDto,
  })
  ollama!: OllamaHealthInfoDto;
}

export class LlmHealthResponseDto {
  @ApiProperty({
    description: 'Active LLM provider',
    example: 'ollama',
  })
  provider!: string;

  @ApiProperty({
    description: 'Target inference model',
    example: 'qwen3:8b',
  })
  model!: string;

  @ApiProperty({
    description: 'Health state',
    enum: ['healthy', 'degraded', 'unhealthy'],
    example: 'healthy',
  })
  status!: 'healthy' | 'degraded' | 'unhealthy';

  @ApiProperty({
    description: 'Availability flag',
    example: true,
  })
  available!: boolean;

  @ApiPropertyOptional({
    description: 'Diagnostic or error reason string',
    example: undefined,
  })
  reason?: string;

  @ApiPropertyOptional({
    description: 'Additional runtime metadata (e.g. latency, model list)',
    example: { pingMs: 12 },
  })
  details?: Record<string, unknown>;
}
