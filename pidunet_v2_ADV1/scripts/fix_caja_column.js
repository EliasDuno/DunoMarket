const { Pool } = require('pg');
const { getMasterPoolConfig, getTenantPoolConfig } = require('../config/db');

async function migrateAll() {
    const masterPool = new Pool(getMasterPoolConfig());
    
    try {
        console.log('--- Iniciando Migración de Caja (Todas las Empresas) ---');
        
        // 1. Obtener todos los tenants
        const tenantsRes = await masterPool.query('SELECT slug, db_url FROM tenants WHERE status = $1', ['active']);
        console.log(`Se encontraron ${tenantsRes.rows.length} empresas activas.`);

        for (const tenant of tenantsRes.rows) {
            console.log(`\nMigrando empresa: ${tenant.slug}...`);
            const tenantPool = new Pool(getTenantPoolConfig(tenant.db_url));
            
            try {
                const client = await tenantPool.connect();
                try {
                    await client.query('BEGIN');
                    
                    console.log('  Agregando columnas a caja_sesiones...');
                    await client.query(`
                        ALTER TABLE caja_sesiones 
                        ADD COLUMN IF NOT EXISTS detalles_cierre JSONB,
                        ADD COLUMN IF NOT EXISTS observaciones TEXT,
                        ADD COLUMN IF NOT EXISTS monto_ventas_sistema DECIMAL(12, 2) DEFAULT 0,
                        ADD COLUMN IF NOT EXISTS monto_teorico DECIMAL(12, 2) DEFAULT 0,
                        ADD COLUMN IF NOT EXISTS diferencia DECIMAL(12, 2) DEFAULT 0;
                    `);
                    
                    console.log('  Verificando columna caja_id en ventas...');
                    const checkVentas = await client.query(`
                        SELECT column_name 
                        FROM information_schema.columns 
                        WHERE table_name='ventas' AND column_name='caja_id'
                    `);
                    if (checkVentas.rows.length === 0) {
                        await client.query('ALTER TABLE ventas ADD COLUMN caja_id INTEGER REFERENCES caja_sesiones(id);');
                        console.log('  Columna caja_id agregada a ventas.');
                    }

                    await client.query('COMMIT');
                    console.log(`✅ Empresa ${tenant.slug} actualizada correctamente.`);
                } catch (err) {
                    await client.query('ROLLBACK');
                    console.error(`❌ Error en empresa ${tenant.slug}:`, err.message);
                } finally {
                    client.release();
                }
            } catch (err) {
                console.error(`❌ No se pudo conectar a la base de datos de ${tenant.slug}:`, err.message);
            } finally {
                await tenantPool.end();
            }
        }

        console.log('\n--- Migración Finalizada ---');
    } catch (err) {
        console.error('❌ Error Crítico:', err);
    } finally {
        await masterPool.end();
    }
}

migrateAll();
