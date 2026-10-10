import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';
import * as path from 'path';
import { EdmoLogger } from '../common/logger.service';

export interface ArtifactInfo {
  name: string;
  category: 'ocr' | 'edr' | 'evidence' | 'llm';
  filename: string;
  sizeBytes: number;
  available: boolean;
  path?: string;
}

export interface DocumentArtifactSummary {
  documentId: string;
  workspaceDir: string;
  available: boolean;
  artifacts: ArtifactInfo[];
}

@Injectable()
export class ArtifactService {
  private readonly baseWorkDir: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly logger: EdmoLogger,
  ) {
    this.baseWorkDir =
      this.configService.get<string>('orchestrator.workDir') || '/tmp/edmo';
  }

  async getDocumentArtifacts(documentId: string): Promise<DocumentArtifactSummary> {
    // Sanitize documentId to prevent directory traversal
    const sanitizedId = documentId.replace(/[^a-zA-Z0-9_-]/g, '');
    const workspaceDir = path.join(this.baseWorkDir, sanitizedId);

    if (!fs.existsSync(workspaceDir)) {
      return {
        documentId: sanitizedId,
        workspaceDir,
        available: false,
        artifacts: [],
      };
    }

    const ocrDir = path.join(workspaceDir, 'ocr');
    const evidenceDir = path.join(workspaceDir, 'evidence');

    const artifacts: ArtifactInfo[] = [];

    // Check OCR / EDR artifacts inside subdirectories
    if (fs.existsSync(ocrDir)) {
      const subdirs = await fs.promises.readdir(ocrDir);
      for (const sub of subdirs) {
        const subPath = path.join(ocrDir, sub);
        const stat = await fs.promises.stat(subPath);
        if (stat.isDirectory()) {
          const rawOcr = path.join(subPath, 'raw_ocr.json');
          if (fs.existsSync(rawOcr)) {
            artifacts.push({
              name: 'raw_ocr',
              category: 'ocr',
              filename: 'raw_ocr.json',
              sizeBytes: (await fs.promises.stat(rawOcr)).size,
              available: true,
              path: rawOcr,
            });
          }

          const edrFull = path.join(subPath, 'edr_full.json');
          if (fs.existsSync(edrFull)) {
            artifacts.push({
              name: 'edr_full',
              category: 'edr',
              filename: 'edr_full.json',
              sizeBytes: (await fs.promises.stat(edrFull)).size,
              available: true,
              path: edrFull,
            });
          }

          const preflight = path.join(subPath, 'preflight.json');
          if (fs.existsSync(preflight)) {
            artifacts.push({
              name: 'preflight',
              category: 'ocr',
              filename: 'preflight.json',
              sizeBytes: (await fs.promises.stat(preflight)).size,
              available: true,
              path: preflight,
            });
          }
        }
      }
    }

    // Check Evidence artifacts
    if (fs.existsSync(evidenceDir)) {
      const evidenceFull = path.join(evidenceDir, 'evidence-full.json');
      if (fs.existsSync(evidenceFull)) {
        artifacts.push({
          name: 'evidence_full',
          category: 'evidence',
          filename: 'evidence-full.json',
          sizeBytes: (await fs.promises.stat(evidenceFull)).size,
          available: true,
          path: evidenceFull,
        });
      }

      const evidenceLlm = path.join(evidenceDir, 'evidence-llm.json');
      if (fs.existsSync(evidenceLlm)) {
        artifacts.push({
          name: 'evidence_llm',
          category: 'llm',
          filename: 'evidence-llm.json',
          sizeBytes: (await fs.promises.stat(evidenceLlm)).size,
          available: true,
          path: evidenceLlm,
        });
      }

      const evidenceReport = path.join(evidenceDir, 'evidence-report.json');
      if (fs.existsSync(evidenceReport)) {
        artifacts.push({
          name: 'evidence_report',
          category: 'evidence',
          filename: 'evidence-report.json',
          sizeBytes: (await fs.promises.stat(evidenceReport)).size,
          available: true,
          path: evidenceReport,
        });
      }
    }

    return {
      documentId: sanitizedId,
      workspaceDir,
      available: true,
      artifacts,
    };
  }

  async readArtifactContent(documentId: string, artifactName: string): Promise<Record<string, unknown> | null> {
    const summary = await this.getDocumentArtifacts(documentId);
    const target = summary.artifacts.find((a) => a.name === artifactName);
    if (!target || !target.path || !fs.existsSync(target.path)) {
      return null;
    }
    const content = await fs.promises.readFile(target.path, 'utf8');
    return JSON.parse(content);
  }
}
