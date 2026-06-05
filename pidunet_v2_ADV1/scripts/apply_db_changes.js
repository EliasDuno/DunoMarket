const { Pool } = require('pg');
const { getMasterPoolConfig } = require('../config/db');
const fs = require('fs');
const path = require('path');

const pool = new Pool(getMasterPoolConfig());

async function applySchema() {
    try {
        const sqlPath = path.join(__dirname, 'setup_inventory_db.sql');
        const sql = fs.readFileSync(sqlPath, 'utf8');

        console.log('Aplicando esquema de base de datos...');
        await pool.query(sql);
        console.log('Esquema aplicado exitosamente.');

        await pool.end();
    } catch (err) {
        console.error('Error al aplicar el esquema:', err);
        process.exit(1);
    }
}

applySchema();
