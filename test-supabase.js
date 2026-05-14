const { Pool } = require('pg');
const { getMasterPoolConfig } = require('./config/db');

const pool = new Pool(getMasterPoolConfig());

async function testConnection() {
    try {
        console.log('Testing connection to configured PostgreSQL database...');
        const res = await pool.query('SELECT NOW()');
        console.log('Connected successfully! Current time in DB:', res.rows[0].now);

        const tablesResult = await pool.query(`
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public'
            ORDER BY table_name;
        `);
        
        console.log('\nTables found in public schema:');
        if (tablesResult.rows.length === 0) {
            console.log('No tables found.');
        } else {
            tablesResult.rows.forEach(row => console.log(`- ${row.table_name}`));
        }

    } catch (err) {
        console.error('Error connecting to the configured database:', err.message);
    } finally {
        await pool.end();
    }
}

testConnection();
