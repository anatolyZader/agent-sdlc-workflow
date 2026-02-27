'use strict';

/**
 * Validates an EventStorm board against DDD invariants. Used by the coordinator (via Bash script)
 * and optionally by the adapter when loading board.json.
 * @param {object} board - Board object (glossary, commands, events, policies, aggregates, boundedContexts, etc.)
 * @returns {{ valid: boolean, errors: string[] }}
 */
function validateBoard(board) {
  const errors = [];
  if (!board || typeof board !== 'object') {
    return { valid: false, errors: ['Board is missing or not an object'] };
  }

  const commands = Array.isArray(board.commands) ? board.commands : [];
  const events = Array.isArray(board.events) ? board.events : [];
  const policies = Array.isArray(board.policies) ? board.policies : [];
  const aggregates = Array.isArray(board.aggregates) ? board.aggregates : [];
  const boundedContexts = Array.isArray(board.boundedContexts) ? board.boundedContexts : [];
  const glossary = Array.isArray(board.glossary) ? board.glossary : [];

  const commandNames = new Set();
  const eventNames = new Set();
  const glossaryTerms = new Set();

  for (const c of commands) {
    if (!c || typeof c.name !== 'string') continue;
    if (commandNames.has(c.name)) errors.push(`Duplicate command name: ${c.name}`);
    commandNames.add(c.name);
    if (!c.actor && c.actor !== 'TBD') {
      errors.push(`Command "${c.name}" has no actor (use "TBD" if unknown)`);
    }
    if (!/^[A-Z][a-z]+[A-Z][a-zA-Z]*$/.test(c.name) && c.name !== '') {
      errors.push(`Command "${c.name}" should be VerbNoun (e.g. RegisterUser)`);
    }
  }

  const pastTenseSuffixes = /ed$|d$|n$|t$/i;
  const commonPast = new Set(['was', 'were', 'had', 'did', 'sent', 'held', 'made', 'took', 'gave', 'cancelled', 'created', 'updated', 'deleted', 'approved', 'rejected']);
  for (const e of events) {
    if (!e || typeof e.name !== 'string') continue;
    if (eventNames.has(e.name)) errors.push(`Duplicate event name: ${e.name}`);
    eventNames.add(e.name);
    const name = e.name.trim();
    if (!commonPast.has(name.toLowerCase()) && !pastTenseSuffixes.test(name)) {
      errors.push(`Event "${e.name}" should be past tense (e.g. UserRegistered)`);
    }
  }

  for (const g of glossary) {
    if (!g || typeof g.term !== 'string') continue;
    const t = g.term.trim();
    if (t && glossaryTerms.has(t)) errors.push(`Duplicate glossary term: ${t}`);
    glossaryTerms.add(t);
  }

  const allEventNames = new Set(events.map((e) => e && e.name).filter(Boolean));
  const allCommandNames = new Set(commands.map((c) => c && c.name).filter(Boolean));
  const aggregateNames = new Set(aggregates.map((a) => a && a.name).filter(Boolean));
  const ownedCommands = new Set();
  const emittedEvents = new Set();
  for (const a of aggregates) {
    if (!a) continue;
    for (const cmd of a.ownsCommands || []) ownedCommands.add(cmd);
    for (const ev of a.emitsEvents || []) emittedEvents.add(ev);
  }

  for (const cmd of commands) {
    if (!cmd || !cmd.name) continue;
    const owned = ownedCommands.has(cmd.name);
    if (!owned) {
      errors.push(`Command "${cmd.name}" has no aggregate owner (add to an aggregate's ownsCommands or mark TBD)`);
    }
  }

  for (const e of events) {
    if (!e || !e.name) continue;
    const fromAgg = emittedEvents.has(e.name);
    const fromPolicy = policies.some((p) => Array.isArray(p.emits) && p.emits.includes(e.name));
    if (!fromAgg && !fromPolicy) {
      errors.push(`Event "${e.name}" is not emitted by any aggregate or policy`);
    }
  }

  for (const p of policies) {
    if (!p || !p.trigger) continue;
    if (!allEventNames.has(p.trigger) && !allCommandNames.has(p.trigger)) {
      errors.push(`Policy trigger "${p.trigger}" does not reference an existing event or command`);
    }
  }

  const bcAggregateNames = new Set();
  for (const bc of boundedContexts) {
    if (!bc || !bc.integrations) continue;
    for (const rel of bc.integrations) {
      if (typeof rel === 'string' && rel.includes('->')) bcAggregateNames.add(rel);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

module.exports = { validateBoard };
