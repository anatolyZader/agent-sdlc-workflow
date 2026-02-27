#!/usr/bin/env node
'use strict';

const path = require('path');
const fs = require('fs');

const boardPath = process.argv[2];
if (!boardPath) {
  console.error(JSON.stringify({ valid: false, errors: ['Usage: node validate-eventstorm-board.js <path-to-board.json>'] }));
  process.exit(2);
}

const projectRoot = process.cwd();
const resolvedPath = path.isAbsolute(boardPath) ? boardPath : path.join(projectRoot, boardPath);

let board;
try {
  board = JSON.parse(fs.readFileSync(resolvedPath, 'utf8'));
} catch (e) {
  console.error(JSON.stringify({ valid: false, errors: [`Failed to read or parse board: ${e.message}`] }));
  process.exit(1);
}

const { validateBoard } = require(path.join(__dirname, '..', 'business_modules/eventstorm/app/boardValidator.js'));
const result = validateBoard(board);
console.log(JSON.stringify(result));
process.exit(result.valid ? 0 : 1);
