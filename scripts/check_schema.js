const { Pool } = require('pg');
const { getMasterPoolConfig } = require('../config/db');

const pool = new Pool(getMasterPoolConfig());

async function checkSchema() {
    try {
        console.log('Connecting to database...');
        const res = await pool.query(`
            SELECT column_name, data_type 
            FROM information_schema.columns 
            WHERE table_name = 'usuarios';
        `);
        console.log('Columns in usuarios table:');
        console.table(res.rows);
    } catch (err) {
        console.error('Error querying schema:', err);
    } finally {
        pool.end();
    }
}

checkSchema();
