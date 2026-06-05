const { Pool } = require('pg');
const { getMasterPoolConfig, getTenantPoolConfig } = require('../config/db');

async function migrateSalesTaxFields() {
    console.log('=== STARTING EXPLICIT SALES DETAIL TAX FIELDS MIGRATION ===');
    
    const masterConfig = getMasterPoolConfig();
    console.log(`Connecting to Master Database at: ${masterConfig.host || 'DATABASE_URL'}`);
    const masterPool = new Pool(masterConfig);
    
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

                console.log(`  - Adding tax columns to 'ventas' for [${tenant.slug}]...`);
                await client.query(`
                    ALTER TABLE ventas 
                    ADD COLUMN IF NOT EXISTS total_base_usd DECIMAL(12, 2) DEFAULT 0.00,
                    ADD COLUMN IF NOT EXISTS total_iva_usd DECIMAL(12, 2) DEFAULT 0.00;
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

migrateSalesTaxFields();
