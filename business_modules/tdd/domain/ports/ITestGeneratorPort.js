'use strict';

function ITestGeneratorPort() {
  if (new.target === ITestGeneratorPort) {
    throw new Error('ITestGeneratorPort is abstract');
  }
}

ITestGeneratorPort.prototype.generateFromSpec = function (specPath, moduleName, projectRoot) {
  throw new Error('generateFromSpec not implemented');
};

module.exports = { ITestGeneratorPort };
