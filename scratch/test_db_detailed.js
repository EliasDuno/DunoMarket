const { Pool } = require('pg');
const { getMasterPoolConfig } = require('../config/db');
const util = require('util');

const config = getMasterPoolConfig();
console.log("Using pool config:", { ...config, password: config.password ? '***' : '(empty)' });

const pool = new Pool(config);

async function test() {
    try {
        console.log("Connecting...");
        const res = await pool.query('SELECT NOW()');
        console.log("SUCCESS!", res.rows[0]);
    } catch (err) {
        console.error("FAILED TO CONNECT:");
        console.error(util.inspect(err, { depth: null }));
    } finally {
        await pool.end();
    }
}

test();
