const { Pool } = require('pg');

const dbUrl = 'postgresql://postgres.owliayewkyxxxpxtohcm:Rodri%25970@aws-0-us-east-1.pooler.supabase.com:6543/postgres?pgbouncer=true';

const pool = new Pool({
    connectionString: dbUrl,
    ssl: { rejectUnauthorized: false }
});

async function run() {
    try {
        console.log("Adding expo_push_token to usuarios...");
        await pool.query(`
            ALTER TABLE usuarios 
            ADD COLUMN IF NOT EXISTS expo_push_token text;
        `);
        console.log("Column added successfully!");
    } catch (err) {
        console.error("Failed:", err.message);
    } finally {
        await pool.end();
    }
}

run();
