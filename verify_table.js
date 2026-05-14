const { Pool } = require('pg');
const { getMasterPoolConfig } = require('./config/db');

const pool = new Pool(getMasterPoolConfig());

async function verifyTable() {
    try {
        const res = await pool.query(`
            SELECT column_name, data_type 
            FROM information_schema.columns 
            WHERE table_name = 'proveedores';
        `);
        console.log('Columns in proveedores table:', res.rows);
    } catch (err) {
        console.error('Error verifying table:', err);
    } finally {
        pool.end();
    }
}

verifyTable();
