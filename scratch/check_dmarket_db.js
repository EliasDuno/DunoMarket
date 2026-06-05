const { Pool } = require('pg');
const { getMasterPoolConfig, getTenantPoolConfig } = require('../config/db');

async function test() {
    const masterPool = new Pool(getMasterPoolConfig());
    try {
        console.log('Connecting to master DB...');
        const tenantsRes = await masterPool.query('SELECT * FROM tenants');
        console.log('Tenants in master DB:');
        console.table(tenantsRes.rows);

        const dmarket = tenantsRes.rows.find(t => t.slug === 'dmarket');
        if (!dmarket) {
            console.log('Tenant dmarket not found in master database.');
            return;
        }

        console.log('Connecting to dmarket DB schema...');
        const tenantPool = new Pool(getTenantPoolConfig(dmarket.db_url));
        
        // Connect and set search path
        const client = await tenantPool.connect();
        try {
            console.log('Connected to tenant database.');
            await client.query('SET search_path TO "dmarket", public');
            
            // Check tables
            const tablesRes = await client.query(`
                SELECT table_name 
                FROM information_schema.tables 
                WHERE table_schema = 'dmarket'
            `);
            console.log('Tables in dmarket schema:');
            console.table(tablesRes.rows);

            // Check configuracion table contents
            const configRes = await client.query('SELECT * FROM configuracion');
            console.log('Configuration contents:');
            console.table(configRes.rows);
        } catch (err) {
            console.error('Error querying dmarket schema:', err);
        } finally {
            client.release();
            await tenantPool.end();
        }
    } catch (err) {
        console.error('Error connecting to master:', err);
    } finally {
        await masterPool.end();
    }
}

test();
