const { Pool } = require('pg');
const { getMasterPoolConfig } = require('../config/db');

const pool = new Pool(getMasterPoolConfig());

async function initMaster() {
    console.log('Connecting to configured master database...');
    const client = await pool.connect();
    try {
        console.log('Creating tenants table...');
        await client.query(`
            CREATE TABLE IF NOT EXISTS tenants (
                id SERIAL PRIMARY KEY,
                nombre VARCHAR(255) NOT NULL,
                slug VARCHAR(50) UNIQUE NOT NULL,
                db_url TEXT NOT NULL,
                status VARCHAR(20) DEFAULT 'active',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);
        console.log('SUCCESS: Master Database Initialized.');
    } catch (e) {
        console.error('ERROR initializing master:', e);
    } finally {
        client.release();
        await pool.end();
    }
}

initMaster();
