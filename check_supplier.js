const { Pool } = require('pg');

const pool = new Pool({
    user: 'postgres',
    host: 'localhost',
    database: 'PiduNet',
    password: 'Rodri%970',
    port: 5432,
});

async function checkSupplier() {
    try {
        const res = await pool.query("SELECT * FROM proveedores WHERE nombre ILIKE '%Los Andes%'");
        if (res.rows.length > 0) {
            console.log('Supplier found:', res.rows[0]);
        } else {
            console.log('No supplier found with name like "Los Andes"');
        }
    } catch (err) {
        console.error('Error executing query', err.stack);
    } finally {
        await pool.end();
    }
}

checkSupplier();
