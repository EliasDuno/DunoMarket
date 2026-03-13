const { Pool } = require('pg');

const pool = new Pool({
    user: 'postgres',
    host: 'localhost',
    database: 'PiduNet',
    password: 'Rodri%970',
    port: 5432,
});

async function migrateSales() {
    try {
        console.log('Creando tablas de ventas...');

        // Table: ventas
        await pool.query(`
            CREATE TABLE IF NOT EXISTS ventas (
                id SERIAL PRIMARY KEY,
                fecha TIMESTAMP DEFAULT NOW(),
                metodo_pago VARCHAR(50) NOT NULL,
                total_usd NUMERIC(10, 2) NOT NULL,
                tasa_bcv NUMERIC(10, 2),
                total_bs NUMERIC(12, 2)
            );
        `);
        console.log('Tabla "ventas" verificada.');

        // Table: detalle_ventas
        await pool.query(`
            CREATE TABLE IF NOT EXISTS detalle_ventas (
                id SERIAL PRIMARY KEY,
                venta_id INTEGER REFERENCES ventas(id) ON DELETE CASCADE,
                producto_id INTEGER REFERENCES productos(id),
                cantidad INTEGER NOT NULL,
                precio_unitario_usd NUMERIC(10, 2) NOT NULL,
                subtotal_usd NUMERIC(10, 2) NOT NULL
            );
        `);
        console.log('Tabla "detalle_ventas" verificada.');

        console.log('Migración de ventas completada.');
    } catch (err) {
        console.error('Error en migración:', err);
    } finally {
        pool.end();
    }
}

migrateSales();
