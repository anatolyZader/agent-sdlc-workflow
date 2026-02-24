'use strict';

const fs = require('fs').promises;
const path = require('path');
const { IWorkflowArtifactStorePort } = require('../../domain/ports/IWorkflowArtifactStorePort');

/**
 * Filesystem artifact store. Implements IWorkflowArtifactStorePort.
 * Persists artifacts under basePath (e.g. projectRoot/artifacts or ARTIFACT_STORE_PATH).
 */
class FsArtifactStoreAdapter extends IWorkflowArtifactStorePort {
  /**
   * @param {{ basePath: string }} options - base directory for artifact files
   */
  constructor({ basePath }) {
    super();
    this.basePath = basePath || path.join(process.cwd(), 'artifacts');
  }

  async store(artifact) {
    const runId = artifact.meta?.runId || artifact.runId || 'unknown';
    const type = artifact.type || 'artifact';
    const safeRunId = runId.replace(/[^a-zA-Z0-9-_]/g, '_');
    const dir = path.join(this.basePath, safeRunId);
    await fs.mkdir(dir, { recursive: true });
    const ext = type === 'eventstorm' ? '.json' : '.txt';
    const filename = `${type}${ext}`;
    const ref = path.join(safeRunId, filename);

    if (artifact.path) {
      const dest = path.join(this.basePath, ref);
      await fs.copyFile(artifact.path, dest);
      return ref;
    }
    const content = typeof artifact.content === 'string' ? artifact.content : JSON.stringify(artifact.content ?? {});
    const dest = path.join(this.basePath, ref);
    await fs.writeFile(dest, content, 'utf8');
    return ref;
  }

  async get(ref) {
    const full = path.join(this.basePath, ref);
    try {
      const content = await fs.readFile(full, 'utf8');
      const ext = path.extname(ref);
      return {
        type: path.basename(ref, ext),
        content: ext === '.json' ? JSON.parse(content) : content,
        path: full,
      };
    } catch (e) {
      if (e.code === 'ENOENT') return null;
      throw e;
    }
  }
}

module.exports = { FsArtifactStoreAdapter };
