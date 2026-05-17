const { Pool } = require('pg');
const { getMasterPoolConfig, getTenantPoolConfig } = require('../config/db');

async function migrateAllTenants() {
    console.log('=== STARTING ACCOUNTS PAYABLE TENANTS MIGRATION ===');
    const masterPool = new Pool(getMasterPoolConfig());
    
    try {
        // 1. Fetch active tenants
        const res = await masterPool.query("SELECT slug, db_url FROM tenants WHERE status = 'active'");
        const tenants = res.rows;
        console.log(`Found ${tenants.length} active tenant(s) to migrate.`);

        for (const tenant of tenants) {
            console.log(`\nMigrating tenant [${tenant.slug}]...`);
            const tenantPool = new Pool(getTenantPoolConfig(tenant.db_url));
            const client = await tenantPool.connect();

            try {
                await client.query('BEGIN');

                // A. Create/Update compromisos_pago table
                console.log(`  - Verifying/Creating 'compromisos_pago' table...`);
                await client.query(`
                    CREATE TABLE IF NOT EXISTS compromisos_pago (
                        id SERIAL PRIMARY KEY,
                        proveedor_id INTEGER REFERENCES proveedores(id) ON DELETE SET NULL,
                        descripcion TEXT NOT NULL,
                        monto_total_usd DECIMAL(10, 2) NOT NULL,
                        monto_pagado_usd DECIMAL(10, 2) DEFAULT 0.00,
                        fecha_vencimiento DATE NOT NULL,
                        estado VARCHAR(20) DEFAULT 'PENDIENTE',
                        creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                    );
                `);

                // Add missing columns if they don't exist
                await client.query(`ALTER TABLE compromisos_pago ADD COLUMN IF NOT EXISTS fecha_emision DATE;`);
                await client.query(`ALTER TABLE compromisos_pago ADD COLUMN IF NOT EXISTS numero_factura VARCHAR(100);`);
                await client.query(`ALTER TABLE compromisos_pago ADD COLUMN IF NOT EXISTS last_alert_sent_at TIMESTAMP;`);

                // B. Create/Update historial_pagos_compromisos table
                console.log(`  - Verifying/Creating 'historial_pagos_compromisos' table...`);
                await client.query(`
                    CREATE TABLE IF NOT EXISTS historial_pagos_compromisos (
                        id SERIAL PRIMARY KEY,
                        compromiso_id INTEGER REFERENCES compromisos_pago(id) ON DELETE CASCADE,
                        monto_usd DECIMAL(10, 2) NOT NULL,
                        referencia VARCHAR(100),
                        fecha_pago TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                    );
                `);

                await client.query('COMMIT');
                console.log(`  ✔ Migration for tenant [${tenant.slug}] completed successfully.`);
            } catch (err) {
                await client.query('ROLLBACK');
                console.error(`  ❌ Migration failed for tenant [${tenant.slug}]:`, err.message);
            } finally {
                client.release();
                await tenantPool.end();
            }
        }
        console.log('\n=== MIGRATION RUN FINISHED ===');
    } catch (err) {
        console.error('CRITICAL: Failed to run master migration process:', err);
    } finally {
        await masterPool.end();
    }
}

migrateAllTenants();
