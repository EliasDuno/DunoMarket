const { Pool } = require('pg');
const { getMasterPoolConfig } = require('../config/db');

const pool = new Pool(getMasterPoolConfig());

async function run() {
    try {
        const res = await pool.query(`
            UPDATE usuarios 
            SET rol = 'admin' 
            WHERE email = 'eliasduno@gmail.com'
        `);
        console.log(`Updated ${res.rowCount} users.`);
    } catch (err) {
        console.error(err);
    } finally {
        pool.end();
    }
}

run();
