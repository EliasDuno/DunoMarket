const { Pool } = require('pg');

const pool = new Pool({
    user: 'postgres',
    host: 'localhost',
    database: 'PiduNet',
    password: 'Rodri%970',
    port: 5432,
});

async function addAvatarColumn() {
    try {
        console.log('Adding avatar_url column...');
        await pool.query('ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS avatar_url VARCHAR(255)');
        console.log('Column avatar_url added successfully.');
    } catch (err) {
        console.error('Error adding column:', err);
    } finally {
        pool.end();
    }
}

addAvatarColumn();
