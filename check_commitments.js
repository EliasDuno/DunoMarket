const { Pool } = require('pg');
const { getMasterPoolConfig } = require('./config/db');

const pool = new Pool(getMasterPoolConfig());

async function verifyTable() {
    try {
        const res = await pool.query(`
            SELECT column_name, data_type 
            FROM information_schema.columns 
            WHERE table_name = 'compromisos_pago';
        `);
        console.log('--- Columns in compromisos_pago ---');
        console.table(res.rows);

        if (res.rows.length === 0) {
            console.error('CRITICAL: Table compromisos_pago DOES NOT EXIST');
        } else {
            console.log('Table exists. Checking dependencies...');

            // Check Proveedor relation
            const prov = await pool.query("SELECT * FROM proveedores LIMIT 1");
            console.log(`Proveedores count: ${prov.rowCount}`);
            if (prov.rowCount > 0) console.log('Sample Supplier:', prov.rows[0]);
        }
    } catch (err) {
        console.error(err);
    } finally {
        pool.end();
    }
}

verifyTable();
