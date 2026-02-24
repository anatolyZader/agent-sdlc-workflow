'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs').promises;
const os = require('os');
const {
  getSpecTemplate,
  buildSpecFromTemplate,
  produceSpecWithSpecKit,
  featureSlug,
} = require(path.join(__dirname, '../../../../business_modules/spec/infrastructure/specKitHelper'));

describe('specKitHelper', () => {
  describe('featureSlug', () => {
    it('produces 001-feature-name from feature title', () => {
      assert.strictEqual(featureSlug('Refund Approval'), '001-refund-approval');
      assert.strictEqual(featureSlug('  my feature  '), '001-my-feature');
    });
  });

  describe('getSpecTemplate and buildSpecFromTemplate', () => {
    it('uses spec-kit template when .specify/templates/spec-template.md exists', async () => {
      const projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'spec-helper-'));
      const templatesDir = path.join(projectRoot, '.specify', 'templates');
      await fs.mkdir(templatesDir, { recursive: true });
      const templateContent = '# Feature Specification: [FEATURE NAME]\n**Feature Branch**: `[###-feature-name]`\n**Created**: [DATE]\n**Input**: $ARGUMENTS\n';
      await fs.writeFile(path.join(templatesDir, 'spec-template.md'), templateContent, 'utf8');

      const template = await getSpecTemplate(projectRoot);
      assert.ok(template);
      assert.ok(template.includes('[FEATURE NAME]'));

      const eventstorm = { domainEvents: ['OrderPlaced'], commands: [] };
      const content = buildSpecFromTemplate(template, 'Refund Flow', '001-refund-flow', eventstorm, {});
      assert.ok(content.includes('Refund Flow'));
      assert.ok(content.includes('001-refund-flow'));
      assert.ok(content.includes('Domain (from EventStorming)'));
      assert.ok(content.includes('OrderPlaced'));

      await fs.rm(projectRoot, { recursive: true, force: true });
    });
  });

  describe('produceSpecWithSpecKit with useSpecKitPackage false', () => {
    it('does not invoke CLI and writes spec in spec-kit layout', async () => {
      const projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'spec-helper-2-'));
      const { specPath, slug } = await produceSpecWithSpecKit(
        projectRoot,
        'my feature',
        { domainEvents: ['E1'] },
        {},
        'wf-1',
        { useSpecKitPackage: false }
      );
      assert.ok(specPath.endsWith('spec.md'));
      assert.strictEqual(slug, '001-my-feature');
      const content = await fs.readFile(specPath, 'utf8');
      assert.ok(content.includes('Domain (from EventStorming)'));
      assert.ok(content.includes('E1'));
      await fs.rm(projectRoot, { recursive: true, force: true });
    });
  });
});
