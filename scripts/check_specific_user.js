const { Pool } = require('pg');
const { getMasterPoolConfig } = require('../config/db');

const pool = new Pool(getMasterPoolConfig());

async function checkUserAvatar() {
    try {
        const res = await pool.query("SELECT id, nombre, (avatar_data IS NOT NULL) as has_blob FROM usuarios WHERE nombre ILIKE '%Yorky%'");
        console.log('User Check:', res.rows);
    } catch (err) {
        console.error('Error:', err);
    } finally {
        pool.end();
    }
}

checkUserAvatar();
