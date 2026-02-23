'use strict';

const path = require('path');
const fs = require('fs');
const awilix = require('awilix');

const projectRoot = path.resolve(__dirname, '../..');

function runMigrationsOn(db) {
  const migrationsDir = path.join(projectRoot, 'src/cross-cut-modules/persistence/migrations');
  if (!fs.existsSync(migrationsDir)) return;
  const files = fs.readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort();
  for (const file of files) {
    db.exec(fs.readFileSync(path.join(migrationsDir, file), 'utf8'));
  }
}

/**
 * Create the root Awilix container (singletons).
 * Request-scoped container is created per request in server.js.
 */
function createContainer() {
  const container = awilix.createContainer({
    injectionMode: awilix.InjectionMode.PROXY,
  });

  container.register({
    config: awilix.asValue({
      port: parseInt(process.env.PORT || '8787', 10),
      host: process.env.HOST || '127.0.0.1',
      jwtSecret: process.env.JWT_SECRET || 'dev-secret-change-in-production',
      workflowToken: process.env.WORKFLOW_TOKEN,
      databasePath: process.env.DATABASE_PATH || ':memory:',
    }),
  });

  // Workflow module: SQLite when DATABASE_PATH is set, else in-memory
  const fileWorkflowRepo = require(path.join(projectRoot, 'business_modules/workflow/infrastructure/adapters/fileWorkflowRepoAdapter'));
  const workflowSqliteAdapter = require(path.join(projectRoot, 'business_modules/workflow/infrastructure/adapters/workflowSqliteAdapter'));
  const httpStepExecutor = require(path.join(projectRoot, 'business_modules/workflow/infrastructure/adapters/httpStepExecutorAdapter'));
  const memoryArtifactStore = require(path.join(projectRoot, 'business_modules/workflow/infrastructure/adapters/memoryArtifactStoreAdapter'));
  const systemClock = require(path.join(projectRoot, 'business_modules/workflow/infrastructure/adapters/systemClockAdapter'));
  const workflowServiceModule = require(path.join(projectRoot, 'business_modules/workflow/app/workflowService'));
  const workflowControllerModule = require(path.join(projectRoot, 'business_modules/workflow/app/workflowController'));

  container.register({
    workflowRepo: awilix.asFunction(({ config }) => {
      if (config.databasePath === ':memory:') {
        return new fileWorkflowRepo.FileWorkflowRepoAdapter();
      }
      const Database = require('better-sqlite3');
      const db = new Database(config.databasePath);
      runMigrationsOn(db);
      return new workflowSqliteAdapter.WorkflowSqliteAdapter({ database: db });
    }).singleton(),
    stepExecutor: awilix.asClass(httpStepExecutor.HttpStepExecutorAdapter).singleton(),
    artifactStore: awilix.asClass(memoryArtifactStore.MemoryArtifactStoreAdapter).singleton(),
    clock: awilix.asClass(systemClock.SystemClockAdapter).singleton(),
    workflowService: awilix.asClass(workflowServiceModule.WorkflowService).singleton(),
    workflowController: awilix.asClass(workflowControllerModule.WorkflowController).singleton(),
  });

  // Eventstorm module
  const claudeEventstorm = require(path.join(projectRoot, 'business_modules/eventstorm/infrastructure/adapters/claudeCodeEventstormAdapter'));
  const eventstormServiceModule = require(path.join(projectRoot, 'business_modules/eventstorm/app/eventstormService'));
  const eventstormControllerModule = require(path.join(projectRoot, 'business_modules/eventstorm/app/eventstormController'));
  container.register({
    eventstormFacilitationPort: awilix.asClass(claudeEventstorm.ClaudeCodeEventstormAdapter).singleton(),
    eventstormService: awilix.asClass(eventstormServiceModule.EventstormService).singleton(),
    eventstormController: awilix.asClass(eventstormControllerModule.EventstormController).singleton(),
  });

  return container;
}

/**
 * Create a request-scoped child container with request-specific registrations.
 * @param {awilix.AwilixContainer} root - Root container
 * @param {{ request: object, reply: object }} requestScope - Fastify request and reply
 */
function createRequestScope(root, requestScope) {
  return root.createScope().register({
    request: awilix.asValue(requestScope.request),
    reply: awilix.asValue(requestScope.reply),
    correlationId: awilix.asValue(
      requestScope.request?.headers?.['x-correlation-id'] ||
        `req-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
    ),
  });
}

module.exports = {
  createContainer,
  createRequestScope,
};
