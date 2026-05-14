const { Pool } = require('pg');
const { getMasterPoolConfig } = require('../config/db');

const pool = new Pool(getMasterPoolConfig());

async function migrateToBytea() {
    try {
        console.log('Starting migration to BYTEA...');

        // 1. Drop old column
        console.log('Dropping avatar_url...');
        await pool.query('ALTER TABLE usuarios DROP COLUMN IF EXISTS avatar_url');

        // 2. Add new columns
        console.log('Adding avatar_data and avatar_mime...');
        await pool.query('ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS avatar_data BYTEA');
        await pool.query('ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS avatar_mime VARCHAR(50)');

        console.log('Migration completed successfully.');
    } catch (err) {
        console.error('Migration Error:', err);
    } finally {
        pool.end();
    }
}

migrateToBytea();
