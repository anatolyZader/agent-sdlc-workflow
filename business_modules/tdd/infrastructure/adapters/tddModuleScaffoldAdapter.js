'use strict';

const fs = require('fs');
const path = require('path');
const { IModuleScaffoldPort } = require('../../domain/ports/IModuleScaffoldPort');

class TddModuleScaffoldAdapter extends IModuleScaffoldPort {
  ensureScaffold(moduleName, projectRoot) {
    const root = path.resolve(projectRoot);
    const modulePath = path.join(root, 'business_modules', moduleName);
    const dirs = [
      path.join(modulePath, 'app'),
      path.join(modulePath, 'domain', 'ports'),
      path.join(modulePath, 'infrastructure', 'adapters'),
      path.join(modulePath, 'input'),
      path.join(root, 'tests', 'business_modules', moduleName, 'app'),
      path.join(root, 'tests', 'business_modules', moduleName, 'infrastructure', 'adapters'),
    ];
    for (const d of dirs) {
      fs.mkdirSync(d, { recursive: true });
    }
    return Promise.resolve({ modulePath, testPath: path.join(root, 'tests', 'business_modules', moduleName) });
  }
}

module.exports = { TddModuleScaffoldAdapter };
