const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const pool = new Pool({
    user: 'postgres',
    host: 'localhost',
    database: 'PiduNet',
    password: 'Rodri%970',
    port: 5432,
});

async function applySchema() {
    try {
        const sqlPath = path.join(__dirname, 'update_db_suppliers_categories.sql');
        const sql = fs.readFileSync(sqlPath, 'utf8');

        console.log('Aplicando actualizaciones de esquema (Proveedores/Categorías)...');
        await pool.query(sql);
        console.log('Actualizaciones aplicadas exitosamente.');

        await pool.end();
    } catch (err) {
        console.error('Error al aplicar actualizaciones:', err);
        process.exit(1);
    }
}

applySchema();
