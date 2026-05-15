require('dotenv').config();
const { Pool } = require('pg');

async function debugTenants() {
    const dbUrl = process.env.DATABASE_URL;
    if (!dbUrl) {
        console.error('❌ Error: DATABASE_URL no está definida en el entorno.');
        process.exit(1);
    }

    console.log('🔍 Conectando a la base de datos maestra...');
    const pool = new Pool({
        connectionString: dbUrl,
        ssl: { rejectUnauthorized: false }
    });

    try {
        const res = await pool.query('SELECT slug, nombre, status, created_at FROM tenants');
        console.log('✅ Conexión exitosa.');
        console.log('\n--- LISTADO DE TENANTS (EMPRESAS) ---');
        console.table(res.rows);
        
        if (res.rows.length === 0) {
            console.log('⚠️ La tabla "tenants" está vacía.');
        } else {
            console.log('\n💡 Verifica que el código que ingresas en el login coincida con la columna "slug".');
        }

    } catch (err) {
        console.error('❌ Error al consultar la base de datos:', err.message);
        if (err.message.includes('relation "tenants" does not exist')) {
            console.log('⚠️ La tabla "tenants" no existe aún en esta base de datos.');
        }
    } finally {
        await pool.end();
    }
}

debugTenants();
