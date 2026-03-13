const { Pool } = require('pg');

const pool = new Pool({
    user: 'postgres',
    host: 'localhost',
    database: 'PiduNet',
    password: 'Rodri%970',
    port: 5432,
});

async function checkClient() {
    try {
        const res = await pool.query("SELECT * FROM clientes WHERE nombre LIKE '%Mariolkys%'");
        console.log('Clients found:', res.rows);
    } catch (err) {
        console.error(err);
    } finally {
        await pool.end();
    }
}

checkClient();
