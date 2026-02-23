'use strict';

const fs = require('fs');
const path = require('path');
const { ITestGeneratorPort } = require('../../domain/ports/ITestGeneratorPort');

class TddTestGeneratorAdapter extends ITestGeneratorPort {
  async generateFromSpec(specPath, moduleName, projectRoot) {
    const root = path.resolve(projectRoot);
    const resolvedSpec = path.isAbsolute(specPath) ? specPath : path.join(root, specPath);
    if (!fs.existsSync(resolvedSpec)) {
      return { testPaths: [], errors: [`Spec not found: ${resolvedSpec}`] };
    }
    const testDir = path.join(root, 'tests', 'business_modules', moduleName, 'app');
    fs.mkdirSync(testDir, { recursive: true });
    const testPath = path.join(testDir, 'specFromTdd.test.js');
    const content = [
      "'use strict';",
      "const { describe, it } = require('node:test');",
      "const assert = require('node:assert');",
      "describe('TDD red (from spec)', () => {",
      "  it('fails until green', () => { assert.strictEqual(1, 0); });",
      "});",
    ].join('\n');
    fs.writeFileSync(testPath, content, 'utf8');
    return { testPaths: [testPath], errors: [] };
  }
}

module.exports = { TddTestGeneratorAdapter };
