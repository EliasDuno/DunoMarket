const { Pool } = require('pg');

// Supabase Connection Pooler string with IPv4 support
const dbUrl = 'postgresql://postgres.owliayewkyxxxpxtohcm:Rodri%25970@aws-0-us-east-1.pooler.supabase.com:6543/postgres?pgbouncer=true';

const pool = new Pool({
    connectionString: dbUrl,
    ssl: { rejectUnauthorized: false }
});

async function run() {
    try {
        console.log("Connecting to Supabase PostgreSQL via IPv4 Pooler...");
        const res = await pool.query('SELECT NOW()');
        console.log("SUCCESS! Connected. Time in DB:", res.rows[0].now);
        
        // List tables
        const tables = await pool.query(`
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public'
            ORDER BY table_name;
        `);
        console.log("Tables in public schema:");
        tables.rows.forEach(r => console.log("- " + r.table_name));
    } catch (err) {
        console.error("Connection failed:", err.message);
    } finally {
        await pool.end();
    }
}

run();
