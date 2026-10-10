import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { EdmoLogger } from '../common/logger.service';

export interface DocumentWorkspace {
  documentId: string;
  requestId: string;
  workspaceDir: string;
  inputDir: string;
  inputFilePath: string;
  sanitizedFilename: string;
  originalFilename: string;
  mimeType: string;
  fileSizeBytes: number;
  ocrDir: string;
  evidenceDir: string;
  logsDir: string;
}

@Injectable()
export class DocumentWorkspaceService {
  private readonly baseWorkDir: string;
  private readonly keepArtifacts: boolean;

  constructor(
    private readonly configService: ConfigService,
    private readonly logger: EdmoLogger,
  ) {
    this.baseWorkDir =
      this.configService.get<string>('orchestrator.workDir') || '/tmp/edmo';
    this.keepArtifacts =
      this.configService.get<boolean>('orchestrator.keepArtifacts') || false;

    // Ensure base working directory exists
    try {
      if (!fs.existsSync(this.baseWorkDir)) {
        fs.mkdirSync(this.baseWorkDir, { recursive: true });
      }
    } catch (err) {
      this.logger.error(
        'Failed to initialize base working directory',
        err instanceof Error ? err.stack : undefined,
        { error: err instanceof Error ? err.message : String(err) },
      );
    }
  }

  generateDocumentId(): string {
    const timestamp = Date.now();
    const randomHex = crypto.randomBytes(4).toString('hex');
    return `doc_${timestamp}_${randomHex}`;
  }

  sanitizeFilename(filename: string): string {
    const basename = path.basename(filename);
    const sanitized = basename.replace(/[^a-zA-Z0-9._-]/g, '_');
    return sanitized || 'document.bin';
  }

  async createWorkspace(
    fileBuffer: Buffer,
    originalFilename: string,
    mimeType: string,
    requestId?: string,
  ): Promise<DocumentWorkspace> {
    const documentId = this.generateDocumentId();
    const reqId = requestId || `req_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
    const sanitizedFilename = this.sanitizeFilename(originalFilename);

    const workspaceDir = path.join(this.baseWorkDir, documentId);
    const inputDir = path.join(workspaceDir, 'input');
    const ocrDir = path.join(workspaceDir, 'ocr');
    const evidenceDir = path.join(workspaceDir, 'evidence');
    const logsDir = path.join(workspaceDir, 'logs');

    await fs.promises.mkdir(inputDir, { recursive: true });
    await fs.promises.mkdir(ocrDir, { recursive: true });
    await fs.promises.mkdir(evidenceDir, { recursive: true });
    await fs.promises.mkdir(logsDir, { recursive: true });

    const inputFilePath = path.join(inputDir, sanitizedFilename);
    await fs.promises.writeFile(inputFilePath, fileBuffer);

    this.logger.debug(
      'Temporary workspace created',
      { documentId, requestId: reqId, workspaceDir, inputFilePath },
    );

    return {
      documentId,
      requestId: reqId,
      workspaceDir,
      inputDir,
      inputFilePath,
      sanitizedFilename,
      originalFilename,
      mimeType,
      fileSizeBytes: fileBuffer.length,
      ocrDir,
      evidenceDir,
      logsDir,
    };
  }

  async cleanupWorkspace(workspace: DocumentWorkspace, force = false): Promise<void> {
    if (this.keepArtifacts && !force) {
      this.logger.debug(
        'Preserving workspace artifacts per configuration (EDMO_KEEP_ARTIFACTS=true)',
        { documentId: workspace.documentId, workspaceDir: workspace.workspaceDir },
      );
      return;
    }

    try {
      if (fs.existsSync(workspace.workspaceDir)) {
        await fs.promises.rm(workspace.workspaceDir, { recursive: true, force: true });
        this.logger.debug(
          'Workspace successfully cleaned',
          { documentId: workspace.documentId, workspaceDir: workspace.workspaceDir },
        );
      }
    } catch (err) {
      this.logger.warn(
        'Failed to clean workspace directory',
        {
          documentId: workspace.documentId,
          error: err instanceof Error ? err.message : String(err),
        },
      );
    }
  }
}
