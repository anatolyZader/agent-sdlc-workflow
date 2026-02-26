'use strict';

const fs = require('fs').promises;
const path = require('path');
const { ensureSpecKitReady } = require('../../../specKitCli');

/**
 * Slug for spec-kit feature folder (e.g. "001-refund-approval").
 * @param {string} featureTitle
 * @param {string} [runId] - optional, for uniqueness
 */
function featureSlug(featureTitle, runId) {
  const base = (featureTitle || 'feature').trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-_]/g, '');
  return base ? `001-${base}` : '001-feature';
}

/**
 * Ensure .specify/specs/<slug>/ exists. Returns the directory path.
 * @param {string} projectRoot
 * @param {string} slug
 */
async function ensureSpecKitSpecDir(projectRoot, slug) {
  const dir = path.join(projectRoot, '.specify', 'specs', slug);
  await fs.mkdir(dir, { recursive: true });
  return dir;
}

/**
 * Generate spec.md content from eventstorm (and optional c4) data.
 * Compatible with spec-kit layout so agent can run /speckit.plan and /speckit.tasks on it.
 */
function generateSpecMd(eventstorm, c4) {
  const events = eventstorm?.domainEvents || [];
  const commands = eventstorm?.commands || [];
  const aggregates = eventstorm?.aggregates || [];
  const contexts = eventstorm?.boundedContexts || [];
  const questions = eventstorm?.openQuestions || [];
  const lines = [
    '# Feature specification',
    '',
    '## Domain (from EventStorming)',
    '',
    '### Domain events',
    events.length ? events.map((e) => `- ${typeof e === 'string' ? e : e.name || JSON.stringify(e)}`).join('\n') : '- (none)',
    '',
    '### Commands',
    commands.length ? commands.map((c) => `- ${typeof c === 'string' ? c : c.name || JSON.stringify(c)}`).join('\n') : '- (none)',
    '',
    '### Aggregates',
    aggregates.length ? aggregates.map((a) => `- ${typeof a === 'string' ? a : a.name || JSON.stringify(a)}`).join('\n') : '- (none)',
    '',
    '### Bounded contexts',
    contexts.length ? contexts.map((b) => `- ${typeof b === 'string' ? b : b.name || JSON.stringify(b)}`).join('\n') : '- (none)',
    '',
    '### Open questions',
    questions.length ? questions.map((q) => `- ${typeof q === 'string' ? q : q}`).join('\n') : '- (none)',
    '',
  ];
  if (c4 && (c4.diagrams || c4.components)) {
    lines.push('## C4 context', '', '_(C4 artifacts available for plan/tasks.)_', '');
  }
  return lines.join('\n');
}

/**
 * Write spec.md under .specify/specs/<slug>/ and return the absolute path.
 * @param {string} projectRoot
 * @param {string} slug
 * @param {string} content
 * @returns {Promise<string>} path to spec.md
 */
async function writeSpecMd(projectRoot, slug, content) {
  const dir = await ensureSpecKitSpecDir(projectRoot, slug);
  const specPath = path.join(dir, 'spec.md');
  await fs.writeFile(specPath, content, 'utf8');
  return specPath;
}

/**
 * Read spec-kit's spec template from .specify/templates/spec-template.md if present.
 * @param {string} projectRoot
 * @returns {Promise<string|null>}
 */
async function getSpecTemplate(projectRoot) {
  const templatePath = path.join(projectRoot, '.specify', 'templates', 'spec-template.md');
  try {
    return await fs.readFile(templatePath, 'utf8');
  } catch {
    return null;
  }
}

/**
 * Fill spec-kit template placeholders and append Domain (from EventStorming) section.
 * Template uses [FEATURE NAME], [###-feature-name], [DATE], $ARGUMENTS.
 */
function buildSpecFromTemplate(template, featureTitle, slug, eventstormData, c4Data) {
  const date = new Date().toISOString().slice(0, 10);
  const args = eventstormData?.problemStatement || featureTitle || 'Feature';
  let content = template
    .replace(/\[FEATURE NAME\]/g, featureTitle || 'Feature')
    .replace(/\[###-feature-name\]/g, slug)
    .replace(/\[DATE\]/g, date)
    .replace(/\$ARGUMENTS/g, args);
  const domainSection = generateSpecMd(eventstormData || {}, c4Data || {});
  content += '\n\n---\n\n' + domainSection;
  return content;
}

/**
 * Produce spec using the spec-kit package: run specify check (and optional init), use .specify template when present, write spec.md.
 * @param {string} projectRoot
 * @param {string} featureTitle
 * @param {object} eventstormData
 * @param {object} [c4Data]
 * @param {string} [workflowRunId]
 * @param {{ useSpecKitPackage?: boolean, autoInit?: boolean }} [options] - useSpecKitPackage: invoke specify CLI and use its template; autoInit: run specify init if .specify missing
 * @returns {Promise<{ specPath: string, slug: string }>}
 */
async function produceSpecWithSpecKit(projectRoot, featureTitle, eventstormData, c4Data, workflowRunId, options = {}) {
  const { useSpecKitPackage = false, autoInit = false } = options;
  const slug = featureSlug(featureTitle, workflowRunId);

  await ensureSpecKitReady(projectRoot, { useSpecKitPackage, autoInit });

  const template = useSpecKitPackage ? await getSpecTemplate(projectRoot) : null;
  const content = template
    ? buildSpecFromTemplate(template, featureTitle, slug, eventstormData, c4Data)
    : generateSpecMd(eventstormData || {}, c4Data || {});

  const specPath = await writeSpecMd(projectRoot, slug, content);
  return { specPath, slug };
}

module.exports = {
  featureSlug,
  ensureSpecKitSpecDir,
  generateSpecMd,
  writeSpecMd,
  getSpecTemplate,
  buildSpecFromTemplate,
  produceSpecWithSpecKit,
};
