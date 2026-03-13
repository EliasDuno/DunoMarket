const { Pool } = require('pg');

const pool = new Pool({
    user: 'postgres',
    host: 'localhost',
    database: 'PiduNet',
    password: 'Rodri%970',
    port: 5432,
});

const createTables = async () => {
    try {
        // Table: compromisos_pago
        await pool.query(`
            CREATE TABLE IF NOT EXISTS compromisos_pago (
                id SERIAL PRIMARY KEY,
                proveedor_id INTEGER REFERENCES proveedores(id) ON DELETE CASCADE,
                descripcion VARCHAR(255) NOT NULL,
                monto_total_usd DECIMAL(10, 2) NOT NULL,
                monto_pagado_usd DECIMAL(10, 2) DEFAULT 0.00,
                fecha_vencimiento DATE NOT NULL,
                fecha_creacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                estado VARCHAR(20) DEFAULT 'PENDIENTE' -- PENDIENTE, PARCIAL, PAGADO
            );
        `);
        console.log('Tabla compromisos_pago verificada/creada.');

        // Table: historial_pagos_compromisos
        await pool.query(`
            CREATE TABLE IF NOT EXISTS historial_pagos_compromisos (
                id SERIAL PRIMARY KEY,
                compromiso_id INTEGER REFERENCES compromisos_pago(id) ON DELETE CASCADE,
                monto_usd DECIMAL(10, 2) NOT NULL,
                referencia VARCHAR(100),
                fecha_pago TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);
        console.log('Tabla historial_pagos_compromisos verificada/creada.');

    } catch (err) {
        console.error('Error creando tablas:', err);
    } finally {
        pool.end();
    }
};

createTables();
