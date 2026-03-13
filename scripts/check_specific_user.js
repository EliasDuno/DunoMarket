const { Pool } = require('pg');

const pool = new Pool({
    user: 'postgres',
    host: 'localhost',
    database: 'PiduNet',
    password: 'Rodri%970',
    port: 5432,
});

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
