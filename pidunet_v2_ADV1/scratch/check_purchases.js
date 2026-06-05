const { Pool } = require('pg');
const { getMasterPoolConfig } = require('../config/db');

async function checkSuppliersAndPurchases() {
    const pool = new Pool(getMasterPoolConfig());
    try {
        console.log('--- PROVEEDORES ---');
        const resSupp = await pool.query('SELECT id, nombre FROM proveedores');
        console.table(resSupp.rows);

        console.log('\n--- COMPRAS RECIENTES (historial_compras) ---');
        const resPurch = await pool.query(`
            SELECT h.fecha, p.nombre as producto, s.nombre as proveedor, h.cantidad 
            FROM historial_compras h
            LEFT JOIN productos p ON h.producto_id = p.id
            LEFT JOIN proveedores s ON h.proveedor_id = s.id
            ORDER BY h.fecha DESC LIMIT 10
        `);
        console.table(resPurch.rows);

    } catch (e) {
        // console.error(e);
        console.log('Error de conexión (probablemente local vs remoto)');
    } finally {
        await pool.end();
    }
}

checkSuppliersAndPurchases();
