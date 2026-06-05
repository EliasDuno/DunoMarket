const { Pool } = require('pg');
const { getMasterPoolConfig } = require('../config/db');
const bcrypt = require('bcrypt');

const pool = new Pool(getMasterPoolConfig());

async function migrate() {
    try {
        console.log('Starting migration...');

        // 1. Hash the default password
        const defaultPass = '402200';
        const saltRounds = 10;
        const hash = await bcrypt.hash(defaultPass, saltRounds);
        console.log(`Hash generated for '${defaultPass}'`);

        // 2. Update all users
        const query = 'UPDATE usuarios SET password_hash = $1';
        const result = await pool.query(query, [hash]);

        console.log(`Success! Updated ${result.rowCount} users.`);
        console.log('All passwords have been reset to: 402200');

    } catch (err) {
        console.error('Migration Error:', err);
    } finally {
        pool.end();
    }
}

migrate();
