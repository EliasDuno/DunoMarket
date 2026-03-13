const { Pool } = require('pg');

const pool = new Pool({
    user: 'postgres',
    host: 'localhost',
    database: 'PiduNet',
    password: 'Rodri%970',
    port: 5432,
});

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
