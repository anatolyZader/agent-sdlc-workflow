'use strict';

const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const databasePath = process.env.DATABASE_PATH || path.join(process.cwd(), 'data', 'workflow.db');
const migrationsDir = path.join(__dirname, 'migrations');

function run() {
  const db = new Database(databasePath);
  const files = fs.readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort();
  for (const file of files) {
    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
    db.exec(sql);
  }
  db.close();
}

run();
