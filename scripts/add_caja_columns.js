const { Pool } = require('pg');

// Hardcoded credentials from server.js
const pool = new Pool({
    user: 'postgres',
    host: 'localhost',
    database: 'PiduNet',
    password: 'Rodri%970',
    port: 5432,
});

async function migrate() {
    try {
        console.log('Adding missing columns to caja_sesiones...');

        await pool.query(`
            ALTER TABLE caja_sesiones 
            ADD COLUMN IF NOT EXISTS monto_ventas_sistema DECIMAL(10,2) DEFAULT 0,
            ADD COLUMN IF NOT EXISTS monto_cierre_declarado DECIMAL(10,2) DEFAULT 0,
            ADD COLUMN IF NOT EXISTS monto_teorico DECIMAL(10,2) DEFAULT 0,
            ADD COLUMN IF NOT EXISTS diferencia DECIMAL(10,2) DEFAULT 0;
        `);

        console.log('✅ Columns added successfully.');
    } catch (err) {
        console.error('❌ Migration Error:', err);
    } finally {
        pool.end();
    }
}

migrate();
