const { Pool } = require('pg');
const { getMasterPoolConfig } = require('../config/db');

const pool = new Pool(getMasterPoolConfig());

async function checkSchema() {
    try {
        console.log('Connecting...');
        const res = await pool.query(`
            SELECT column_name, data_type 
            FROM information_schema.columns 
            WHERE table_name = 'usuarios';
        `);
        console.log('COLUMNS_FOUND:', JSON.stringify(res.rows, null, 2));
    } catch (err) {
        console.error('DB_ERROR:', err);
    } finally {
        pool.end();
    }
}

checkSchema();
