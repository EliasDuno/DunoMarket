require('dotenv').config();
const { Pool } = require('pg');

async function debugUsers() {
    const masterDbUrl = process.env.DATABASE_URL;
    if (!masterDbUrl) {
        console.error('❌ Error: DATABASE_URL (Master) no está definida.');
        console.log('💡 Tip: Crea un archivo .env con DATABASE_URL=tu_url_de_supabase');
        process.exit(1);
    }

    const masterPool = new Pool({
        connectionString: masterDbUrl,
        ssl: { rejectUnauthorized: false }
    });

    try {
        console.log('🔍 Obteniendo lista de empresas (tenants)...');
        const tenantsRes = await masterPool.query('SELECT slug, nombre, db_url FROM tenants WHERE status = $1', ['active']);
        const tenants = tenantsRes.rows;

        if (tenants.length === 0) {
            console.log('⚠️ No se encontraron empresas activas en la base de datos maestra.');
            return;
        }

        console.log(`✅ Se encontraron ${tenants.length} empresas.\n`);

        for (const tenant of tenants) {
            console.log(`--- EMPRESA: ${tenant.nombre} (Código: ${tenant.slug}) ---`);
            const tenantPool = new Pool({
                connectionString: tenant.db_url,
                ssl: { rejectUnauthorized: false }
            });

            try {
                // Verificar si la tabla usuarios existe
                const tableCheck = await tenantPool.query(`
                    SELECT EXISTS (
                        SELECT FROM information_schema.tables 
                        WHERE table_name = 'usuarios'
                    );
                `);

                if (!tableCheck.rows[0].exists) {
                    console.log('  ⚠️ La tabla "usuarios" no existe en esta base de datos.');
                    continue;
                }

                const usersRes = await tenantPool.query('SELECT id, nombre, email, password_hash, rol, activo FROM usuarios');
                if (usersRes.rows.length === 0) {
                    console.log('  ⚠️ No hay usuarios registrados para esta empresa.');
                } else {
                    console.table(usersRes.rows.map(u => ({
                        ID: u.id,
                        Nombre: u.nombre,
                        Email: u.email,
                        'Password Hash': u.password_hash ? (u.password_hash.substring(0, 15) + '...') : 'VACÍO',
                        Rol: u.rol,
                        Estado: u.activo ? 'Activo' : 'Inactivo'
                    })));
                }
            } catch (err) {
                console.error(`  ❌ Error al conectar a la BD del tenant ${tenant.slug}:`, err.message);
            } finally {
                await tenantPool.end();
            }
            console.log('\n');
        }

    } catch (err) {
        console.error('❌ Error en el proceso:', err.message);
    } finally {
        await masterPool.end();
    }
}

debugUsers();
