import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { pool } from './db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function run() {
  const schema = fs.readFileSync(path.join(__dirname, '../db/schema.sql'), 'utf8');
  const seed = fs.readFileSync(path.join(__dirname, '../db/seed.sql'), 'utf8');
  console.log('Aplicando schema...');
  await pool.query(schema);
  console.log('Aplicando seed...');
  await pool.query(seed);
  console.log('Base de datos inicializada.');
  await pool.end();
}
run().catch(e => { console.error(e); process.exit(1); });
