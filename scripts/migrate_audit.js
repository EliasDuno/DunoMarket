const { Pool } = require('pg');

const pool = new Pool({
    user: 'postgres',
    host: 'localhost',
    database: 'PiduNet',
    password: 'Rodri%970',
    port: 5432,
});

async function migrate() {
    try {
        console.log('Iniciando migración de auditoría...');

        await pool.query(`
            CREATE TABLE IF NOT EXISTS auditoria (
                id SERIAL PRIMARY KEY,
                usuario_id INTEGER,
                accion VARCHAR(100) NOT NULL,
                tabla VARCHAR(50),
                registro_id INTEGER,
                detalle JSONB,
                ip VARCHAR(45),
                fecha TIMESTAMP DEFAULT NOW()
            );
        `);
        console.log('Tabla auditoria creada.');

        console.log('Migración completada exitosamente.');
    } catch (err) {
        console.error('Error en migración:', err);
    } finally {
        pool.end();
    }
}

migrate();
