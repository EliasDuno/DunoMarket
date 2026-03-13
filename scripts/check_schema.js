const { Pool } = require('pg');

const pool = new Pool({
    user: 'postgres',
    host: 'localhost',
    database: 'PiduNet',
    password: 'Rodri%970',
    port: 5432,
});

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
