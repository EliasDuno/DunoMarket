const { Pool } = require('pg');
const dns = require('dns').promises;

const regions = [
    'us-east-1',
    'us-east-2',
    'us-west-1',
    'us-west-2',
    'sa-east-1',
    'eu-west-1',
    'eu-west-2',
    'eu-west-3',
    'eu-central-1',
    'ap-southeast-1',
    'ap-southeast-2',
    'ap-northeast-1',
    'ap-northeast-2',
    'ca-central-1'
];

async function checkRegion(region) {
    const host = `aws-0-${region}.pooler.supabase.com`;
    try {
        await dns.resolve4(host);
        console.log(`Region ${region} resolves to IPv4.`);
        
        // Try connecting
        const dbUrl = `postgresql://postgres.owliayewkyxxxpxtohcm:Rodri%25970@${host}:6543/postgres?pgbouncer=true`;
        const pool = new Pool({
            connectionString: dbUrl,
            ssl: { rejectUnauthorized: false },
            connectionTimeoutMillis: 3000
        });
        
        try {
            const res = await pool.query('SELECT NOW()');
            console.log(`🎉 SUCCESS connecting to region ${region}! DB Time:`, res.rows[0].now);
            return true;
        } catch (connErr) {
            console.log(`❌ Failed connecting to region ${region}:`, connErr.message);
        } finally {
            await pool.end();
        }
    } catch (dnsErr) {
        // Doesn't resolve or query failed
    }
    return false;
}

async function run() {
    console.log("Starting region search...");
    for (const region of regions) {
        const success = await checkRegion(region);
        if (success) {
            console.log(`Correct region found: ${region}`);
            break;
        }
    }
    console.log("Region search complete.");
}

run();
