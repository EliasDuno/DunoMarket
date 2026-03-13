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
        console.log('--- PRODUCTOS COLUMNS ---');
        const resProd = await pool.query(`
            SELECT column_name, data_type 
            FROM information_schema.columns 
            WHERE table_name = 'productos';
        `);
        console.table(resProd.rows);

        console.log('--- TABLES LIST ---');
        const resTables = await pool.query(`
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public';
        `);
        console.table(resTables.rows);

    } catch (err) {
        console.error('Error:', err);
    } finally {
        await pool.end();
    }
}

checkSchema();
