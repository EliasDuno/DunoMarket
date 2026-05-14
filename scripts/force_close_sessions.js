const { Pool } = require('pg');
const { getMasterPoolConfig } = require('../config/db');

const pool = new Pool(getMasterPoolConfig());

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
