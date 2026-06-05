const { Pool } = require('pg');
const { getMasterPoolConfig } = require('../config/db');

const config = getMasterPoolConfig();
console.log('Using database configuration:', {
    user: config.user,
    host: config.host,
    database: config.database,
    port: config.port,
    ssl: !!config.ssl,
    hasConnectionString: !!config.connectionString
});

const pool = new Pool(config);

async function testConnection() {
    try {
        const res = await pool.query('SELECT NOW()');
        console.log('Connected successfully! DB Time:', res.rows[0].now);
    } catch (err) {
        console.error('Full connection error:');
        console.dir(err, { depth: null });
    } finally {
        await pool.end();
    }
}

testConnection();
