const { Pool } = require('pg');
const { getMasterPoolConfig } = require('../config/db');

const pool = new Pool(getMasterPoolConfig());

async function listColumns() {
    try {
        const res = await pool.query('SELECT * FROM usuarios LIMIT 1');
        if (res.rows.length === 0) {
            console.log("Table empty, checking fields...");
            res.fields.forEach(f => console.log('COLUMN: ' + f.name));
        } else {
            Object.keys(res.rows[0]).forEach(k => console.log('COLUMN: ' + k));
        }
    } catch (err) {
        console.error(err);
    } finally {
        pool.end();
    }
}

listColumns();
