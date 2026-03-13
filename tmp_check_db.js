const { Pool } = require('pg');

const pool = new Pool({
    user: 'postgres',
    host: 'localhost',
    database: 'PiduNet',
    password: 'Rodri%970',
    port: 5432,
});

async function run() {
    try {
        const res = await pool.query(`SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'detalle_ventas'`);
        res.rows.forEach(r => console.log(r.column_name, r.data_type));
    } catch (e) { console.error(e); }
    pool.end();
}
run();
