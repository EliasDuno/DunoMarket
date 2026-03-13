const { Pool } = require('pg');

// Hardcoded credentials for quick access
const pool = new Pool({
    user: 'postgres',
    host: 'localhost',
    database: 'PiduNet',
    password: 'Rodri%970',
    port: 5432,
});

async function updateRole() {
    const email = 'eliasduno@gmail.com';
    const newRole = 'administrador';

    try {
        const res = await pool.query(
            "UPDATE usuarios SET rol = $1 WHERE email = $2 RETURNING *",
            [newRole, email]
        );

        if (res.rowCount > 0) {
            console.log(`✅ Success: User ${email} is now ${newRole}.`);
            console.log('User details:', res.rows[0]);
        } else {
            console.log(`⚠️ Warning: User ${email} not found.`);
        }

    } catch (err) {
        console.error('❌ Error updating role:', err);
    } finally {
        pool.end();
    }
}

updateRole();
