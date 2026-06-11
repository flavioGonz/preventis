import pg from 'pg';
const { Pool } = pg;

export const pool = new Pool({
  host: process.env.PGHOST || 'localhost',
  port: process.env.PGPORT || 5432,
  user: process.env.PGUSER || 'preventis',
  password: process.env.PGPASSWORD || 'preventis',
  database: process.env.PGDATABASE || 'preventis',
});

export const q = (text, params) => pool.query(text, params);
