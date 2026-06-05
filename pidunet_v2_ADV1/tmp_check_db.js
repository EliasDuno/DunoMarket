const { Pool } = require('pg');
const { getMasterPoolConfig } = require('./config/db');

const pool = new Pool(getMasterPoolConfig());

async function run() {
    try {
        const res = await pool.query(`SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'detalle_ventas'`);
        res.rows.forEach(r => console.log(r.column_name, r.data_type));
    } catch (e) { console.error(e); }
    pool.end();
}
run();
