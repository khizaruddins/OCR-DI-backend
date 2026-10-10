import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class LlmModelDetailsDto {
  @ApiProperty({
    description: 'Model tag identifier',
    example: 'qwen3:8b',
  })
  name!: string;

  @ApiProperty({
    description: 'Hosting inference provider',
    example: 'ollama',
  })
  provider!: string;

  @ApiPropertyOptional({
    description: 'Model file size in bytes',
    example: 4920739840,
  })
  size?: number;

  @ApiPropertyOptional({
    description: 'Model architecture family',
    example: 'qwen2',
  })
  family?: string;

  @ApiPropertyOptional({
    description: 'Parameter size designation',
    example: '8.2B',
  })
  parameterSize?: string;

  @ApiPropertyOptional({
    description: 'Quantization level (e.g. Q4_K_M)',
    example: 'Q4_K_M',
  })
  quantizationLevel?: string;
}

export class LlmModelInfoResponseDto {
  @ApiProperty({
    description: 'Active provider identifier',
    example: 'ollama',
  })
  provider!: string;

  @ApiProperty({
    description: 'List of models available on the provider instance',
    type: () => [LlmModelDetailsDto],
  })
  models!: LlmModelDetailsDto[];
}
