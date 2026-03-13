const { Pool } = require('pg');

const pool = new Pool({
    user: 'postgres',
    host: 'localhost',
    database: 'PiduNet',
    password: 'Rodri%970',
    port: 5432,
});

async function verifyTable() {
    try {
        const res = await pool.query(`
            SELECT column_name, data_type 
            FROM information_schema.columns 
            WHERE table_name = 'proveedores';
        `);
        console.log('Columns in proveedores table:', res.rows);
    } catch (err) {
        console.error('Error verifying table:', err);
    } finally {
        pool.end();
    }
}

verifyTable();
