const { Pool } = require('pg');

const masterPool = new Pool({
  user: 'postgres.owliayewkyxxxpxtohcm',
  password: decodeURIComponent('Rodri%25970'),
  host: 'aws-0-us-east-1.pooler.supabase.com',
  port: 6543,
  database: 'postgres',
  ssl: { rejectUnauthorized: false }
});

async function run() {
    try {
        const { rows: tenants } = await masterPool.query('SELECT slug FROM tenants');
        for (const tenant of tenants) {
            console.log(`\nTenant: ${tenant.slug}`);
            await masterPool.query(`SET search_path TO "${tenant.slug}", public`);
            
            const { rows: columns } = await masterPool.query("SELECT column_name FROM information_schema.columns WHERE table_name='usuarios' AND column_name='expo_push_token'");
            if (columns.length === 0) {
                console.log(`  [WARNING] Column expo_push_token DOES NOT EXIST in this tenant!`);
            } else {
                console.log(`  Column expo_push_token exists.`);
                const { rows: admins } = await masterPool.query("SELECT id, email, rol, expo_push_token FROM usuarios WHERE (rol = 'admin' OR rol = 'administrador' OR rol = 'superadmin')");
                const withToken = admins.filter(a => a.expo_push_token);
                console.log(`  Admins: ${admins.length}, Admins with token: ${withToken.length}`);
                if (withToken.length > 0) {
                    console.log(`  Tokens:`, withToken.map(t => t.expo_push_token));
                }
            }

            const { rows: invoices } = await masterPool.query("SELECT count(*) as count FROM compromisos_pago WHERE estado != 'PAGADO' AND fecha_vencimiento <= CURRENT_DATE + interval '3 days'");
            console.log(`  Invoices to notify: ${invoices[0].count}`);
        }
    } catch (e) {
        console.error(e);
    } finally {
        masterPool.end();
    }
}
run();
