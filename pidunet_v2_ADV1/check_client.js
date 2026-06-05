const { Pool } = require('pg');
const { getMasterPoolConfig } = require('./config/db');

const pool = new Pool(getMasterPoolConfig());

async function checkClient() {
    try {
        const res = await pool.query("SELECT * FROM clientes WHERE nombre LIKE '%Mariolkys%'");
        console.log('Clients found:', res.rows);
    } catch (err) {
        console.error(err);
    } finally {
        await pool.end();
    }
}

checkClient();
