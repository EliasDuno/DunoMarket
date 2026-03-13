const { Pool } = require('pg');

// Hardcoded credentials from server.js
const pool = new Pool({
    user: 'postgres',
    host: 'localhost',
    database: 'PiduNet',
    password: 'Rodri%970',
    port: 5432,
});

async function forceClose() {
    try {
        const res = await pool.query("UPDATE caja_sesiones SET estado = 'cerrada', fecha_cierre = NOW() WHERE estado = 'abierta'");
        console.log(`✅ FORCED CLOSE: ${res.rowCount} sessions were closed.`);
    } catch (err) {
        console.error('❌ Error:', err);
    } finally {
        pool.end();
    }
}

forceClose();
