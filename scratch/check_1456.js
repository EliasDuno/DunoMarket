const { Pool } = require('pg');
const { getMasterPoolConfig } = require('../config/db');

async function checkProduct() {
    const pool = new Pool(getMasterPoolConfig());
    try {
        console.log('--- MOVIMIENTOS RECIENTES (CÓDIGO 1456) ---');
        const resMov = await pool.query(`
            SELECT h.fecha, h.origen, h.destino, h.cantidad, h.es_merma, h.observacion 
            FROM historial_movimientos h 
            JOIN productos p ON h.producto_id = p.id 
            WHERE p.codigo = '1456' 
            ORDER BY h.fecha DESC LIMIT 5
        `);
        console.table(resMov.rows);

        console.log('\n--- ESTADO ACTUAL COLUMNAS STOCK (CÓDIGO 1456) ---');
        const resStock = await pool.query(`
            SELECT stock, stock_principal, stock_secundaria, stock_merma_venta, stock_merma_principal, stock_merma_secundaria 
            FROM productos 
            WHERE codigo = '1456'
        `);
        console.table(resStock.rows);

    } catch (e) {
        console.error(e);
    } finally {
        await pool.end();
    }
}

checkProduct();
