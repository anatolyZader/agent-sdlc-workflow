#!/usr/bin/env node
'use strict';

/**
 * Run an EventStorm session with a free-text description of the application.
 * Prints sessionId, artifact dir, and sessionDialoguePath (when present).
 *
 * Usage:
 *   node scripts/run-eventstorm-session.js "Build a refund processing app with Stripe"
 *   npm run run:eventstorm:session -- "Build a refund processing app"
 */

const path = require('path');
const { createContainer } = require(path.join(__dirname, '..', 'src', 'app', 'compositionRoot'));

async function main() {
  const rawText = process.argv.slice(2).join(' ').trim() || 'Build a sample application.';
  const container = createContainer();
  const eventstormService = container.resolve('eventstormService');

  const result = await eventstormService.runSession({ rawText });

  const artifactDir = `docs/eventstorm/${result.sessionId}`;
  const output = {
    sessionId: result.sessionId,
    artifactDir,
    sessionDialoguePath: result.sessionDialoguePath || null,
  };
  console.log(JSON.stringify(output, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
