'use strict';

function IModuleScaffoldPort() {
  if (new.target === IModuleScaffoldPort) {
    throw new Error('IModuleScaffoldPort is abstract');
  }
}

IModuleScaffoldPort.prototype.ensureScaffold = function (moduleName, projectRoot) {
  throw new Error('ensureScaffold not implemented');
};

module.exports = { IModuleScaffoldPort };
