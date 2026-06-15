const { Pool } = require('pg');

const dbUrl = 'postgresql://postgres.owliayewkyxxxpxtohcm:Rodri%25970@aws-0-us-east-1.pooler.supabase.com:6543/postgres?pgbouncer=true';

const masterPool = new Pool({
    connectionString: dbUrl,
    ssl: { rejectUnauthorized: false }
});

async function run() {
    try {
        const { rows: tenants } = await masterPool.query('SELECT slug FROM tenants');
        console.log(`Found ${tenants.length} tenants`);
        for (const tenant of tenants) {
            console.log(`\n--- Checking tenant: ${tenant.slug} ---`);
            // we don't have getTenantPool here easily, let's just query the current schema if it's single DB
            // Wait, pidunet uses multiple schemas or single schema?
            // In index.js, getTenantPool probably just sets search_path.
            await masterPool.query(`SET search_path TO "${tenant.slug}", public`);
            
            const { rows: columns } = await masterPool.query("SELECT column_name FROM information_schema.columns WHERE table_name='usuarios' AND column_name='expo_push_token'");
            if (columns.length === 0) {
                console.log(`  No expo_push_token column found.`);
                continue;
            }

            const { rows: admins } = await masterPool.query("SELECT id, email, rol, expo_push_token FROM usuarios WHERE (rol = 'admin' OR rol = 'administrador' OR rol = 'superadmin')");
            console.log(`  Admins found:`, admins);

            const { rows: adminsWithToken } = await masterPool.query("SELECT expo_push_token FROM usuarios WHERE (rol = 'admin' OR rol = 'administrador' OR rol = 'superadmin') AND expo_push_token IS NOT NULL AND expo_push_token != ''");
            console.log(`  Admins WITH token: ${adminsWithToken.length}`);

            const { rows: invoices } = await masterPool.query("SELECT count(*) as count FROM compromisos_pago WHERE estado != 'PAGADO' AND fecha_vencimiento <= CURRENT_DATE + interval '3 days'");
            console.log(`  Invoices matching criteria: ${invoices[0].count}`);
        }
    } catch (e) {
        console.error(e);
    } finally {
        masterPool.end();
    }
}
run();
