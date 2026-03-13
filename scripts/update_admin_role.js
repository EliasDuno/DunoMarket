const { Pool } = require('pg');

const pool = new Pool({
    user: 'postgres',
    host: 'localhost',
    database: 'PiduNet',
    password: 'Rodri%970',
    port: 5432,
});

async function run() {
    try {
        const res = await pool.query(`
            UPDATE usuarios 
            SET rol = 'admin' 
            WHERE email = 'eliasduno@gmail.com'
        `);
        console.log(`Updated ${res.rowCount} users.`);
    } catch (err) {
        console.error(err);
    } finally {
        pool.end();
    }
}

run();
