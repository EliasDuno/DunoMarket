const { Pool } = require('pg');
const { getMasterPoolConfig } = require('./config/db');

const pool = new Pool(getMasterPoolConfig());

async function checkConstraint() {
    try {
        const res = await pool.query(`
            SELECT conname, pg_get_constraintdef(c.oid)
            FROM pg_constraint c
            JOIN pg_namespace n ON n.oid = c.connamespace
            WHERE conrelid = 'productos'::regclass
            AND contype = 'u';
        `);
        console.log('Unique Constraints on productos:', res.rows);
    } catch (err) {
        console.error('Error:', err);
    } finally {
        await pool.end();
    }
}

checkConstraint();
