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
      projectRoot,
      stepTimeoutMs: parseInt(process.env.STEP_TIMEOUT_MS || '300000', 10),
      maxStepRetries: parseInt(process.env.MAX_STEP_RETRIES || '2', 10),
      artifactStorePath: process.env.ARTIFACT_STORE_PATH,
      useSpecKitPackage: process.env.USE_SPEC_KIT_PACKAGE === '1' || process.env.USE_SPEC_KIT_PACKAGE === 'true',
      specifyAutoInit: process.env.SPECIFY_AUTO_INIT === '1' || process.env.SPECIFY_AUTO_INIT === 'true',
    }),
  });

  // Workflow module: SQLite when DATABASE_PATH is set, else in-memory
  const fileWorkflowRepo = require(path.join(projectRoot, 'business_modules/workflow/infrastructure/adapters/fileWorkflowRepoAdapter'));
  const workflowSqliteAdapter = require(path.join(projectRoot, 'business_modules/workflow/infrastructure/adapters/workflowSqliteAdapter'));
  const memoryArtifactStore = require(path.join(projectRoot, 'business_modules/workflow/infrastructure/adapters/memoryArtifactStoreAdapter'));
  const fsArtifactStore = require(path.join(projectRoot, 'business_modules/workflow/infrastructure/adapters/fsArtifactStoreAdapter'));
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
    artifactStore: awilix.asFunction(({ config }) => {
      if (config.artifactStorePath) {
        return new fsArtifactStore.FsArtifactStoreAdapter({ basePath: config.artifactStorePath });
      }
      return new memoryArtifactStore.MemoryArtifactStoreAdapter();
    }).singleton(),
    clock: awilix.asClass(systemClock.SystemClockAdapter).singleton(),
    workflowService: awilix.asFunction(
      ({ workflowRepo, stepExecutor, artifactStore, clock, config }) =>
        new workflowServiceModule.WorkflowService({ workflowRepo, stepExecutor, artifactStore, clock, config })
    ).singleton(),
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

  // C4 module
  const c4DiagramAdapter = require(path.join(projectRoot, 'business_modules/c4/infrastructure/adapters/c4DiagramAdapter'));
  const c4ServiceModule = require(path.join(projectRoot, 'business_modules/c4/app/c4Service'));
  const c4ControllerModule = require(path.join(projectRoot, 'business_modules/c4/app/c4Controller'));
  container.register({
    c4DiagramPort: awilix.asClass(c4DiagramAdapter.C4DiagramAdapter).singleton(),
    c4Service: awilix.asClass(c4ServiceModule.C4Service).singleton(),
    c4Controller: awilix.asClass(c4ControllerModule.C4Controller).singleton(),
  });

  // Spec module
  const specGeneratorAdapter = require(path.join(projectRoot, 'business_modules/spec/infrastructure/adapters/specGeneratorAdapter'));
  const specServiceModule = require(path.join(projectRoot, 'business_modules/spec/app/specService'));
  const specControllerModule = require(path.join(projectRoot, 'business_modules/spec/app/specController'));
  container.register({
    specGenerationPort: awilix.asClass(specGeneratorAdapter.SpecGeneratorAdapter).singleton(),
    specService: awilix.asClass(specServiceModule.SpecService).singleton(),
    specController: awilix.asClass(specControllerModule.SpecController).singleton(),
  });

  // Lint module
  const lintRunnerAdapter = require(path.join(projectRoot, 'business_modules/lint/infrastructure/adapters/lintRunnerAdapter'));
  const lintServiceModule = require(path.join(projectRoot, 'business_modules/lint/app/lintService'));
  const lintControllerModule = require(path.join(projectRoot, 'business_modules/lint/app/lintController'));
  container.register({
    lintRunPort: awilix.asClass(lintRunnerAdapter.LintRunnerAdapter).singleton(),
    lintService: awilix.asClass(lintServiceModule.LintService).singleton(),
    lintController: awilix.asClass(lintControllerModule.LintController).singleton(),
  });

  // Secure module
  const secureRunnerAdapter = require(path.join(projectRoot, 'business_modules/secure/infrastructure/adapters/secureRunnerAdapter'));
  const secureServiceModule = require(path.join(projectRoot, 'business_modules/secure/app/secureService'));
  const secureControllerModule = require(path.join(projectRoot, 'business_modules/secure/app/secureController'));
  container.register({
    secureRunPort: awilix.asClass(secureRunnerAdapter.SecureRunnerAdapter).singleton(),
    secureService: awilix.asClass(secureServiceModule.SecureService).singleton(),
    secureController: awilix.asClass(secureControllerModule.SecureController).singleton(),
  });

  // Doc module
  const docGeneratorAdapter = require(path.join(projectRoot, 'business_modules/doc/infrastructure/adapters/docGeneratorAdapter'));
  const docServiceModule = require(path.join(projectRoot, 'business_modules/doc/app/docService'));
  const docControllerModule = require(path.join(projectRoot, 'business_modules/doc/app/docController'));
  container.register({
    docGenerationPort: awilix.asClass(docGeneratorAdapter.DocGeneratorAdapter).singleton(),
    docService: awilix.asClass(docServiceModule.DocService).singleton(),
    docController: awilix.asClass(docControllerModule.DocController).singleton(),
  });

  // TDD module
  const tddRunAdapter = require(path.join(projectRoot, 'business_modules/tdd/infrastructure/adapters/tddRunAdapter'));
  const tddServiceModule = require(path.join(projectRoot, 'business_modules/tdd/app/tddService'));
  const tddControllerModule = require(path.join(projectRoot, 'business_modules/tdd/app/tddController'));
  container.register({
    tddRunPort: awilix.asClass(tddRunAdapter.TddRunAdapter).singleton(),
    tddService: awilix.asClass(tddServiceModule.TddService).singleton(),
    tddController: awilix.asClass(tddControllerModule.TddController).singleton(),
  });

  // Budget module
  const budgetPlanAdapter = require(path.join(projectRoot, 'business_modules/budget/infrastructure/adapters/budgetPlanAdapter'));
  const budgetServiceModule = require(path.join(projectRoot, 'business_modules/budget/app/budgetService'));
  const budgetControllerModule = require(path.join(projectRoot, 'business_modules/budget/app/budgetController'));
  container.register({
    budgetPlanPort: awilix.asClass(budgetPlanAdapter.BudgetPlanAdapter).singleton(),
    budgetService: awilix.asClass(budgetServiceModule.BudgetService).singleton(),
    budgetController: awilix.asClass(budgetControllerModule.BudgetController).singleton(),
  });

  // Step executor: run workflow steps in-process (after all step controllers are registered)
  const inProcessStepExecutor = require(path.join(projectRoot, 'business_modules/workflow/infrastructure/adapters/inProcessStepExecutorAdapter'));
  container.register({
    stepExecutor: awilix.asClass(inProcessStepExecutor.InProcessStepExecutorAdapter).singleton(),
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
