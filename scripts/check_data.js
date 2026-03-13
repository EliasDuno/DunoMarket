const { Pool } = require('pg');

const pool = new Pool({
    user: 'postgres',
    host: 'localhost',
    database: 'PiduNet',
    password: 'Rodri%970',
    port: 5432,
});

async function checkData() {
    try {
        console.log('Querying data...');
        const res = await pool.query('SELECT * FROM usuarios LIMIT 1');
        if (res.rows.length > 0) {
            console.log('First row keys:', Object.keys(res.rows[0]).join(', '));
            console.log('First row data:', JSON.stringify(res.rows[0], null, 2));
        } else {
            console.log('Table found but empty.');
            // If empty, we can still see fields from res.fields
            console.log('Fields:', res.fields.map(f => f.name).join(', '));
        }
    } catch (err) {
        console.error('Query Error:', err);
    } finally {
        pool.end();
    }
}

checkData();
