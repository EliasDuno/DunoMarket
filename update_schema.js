const { Pool } = require('pg');
const { getMasterPoolConfig } = require('./config/db');

const pool = new Pool(getMasterPoolConfig());

async function updateSchema() {
    try {
        console.log('--- STARTING SCHEMA UPDATE ---');

        // 1. Add 'marca' column to 'productos'
        await pool.query(`
            DO $$ 
            BEGIN 
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='productos' AND column_name='marca') THEN 
                    ALTER TABLE productos ADD COLUMN marca VARCHAR(100); 
                    RAISE NOTICE 'Column marca added to productos';
                ELSE 
                    RAISE NOTICE 'Column marca already exists';
                END IF; 
            END $$;
        `);
        console.log('Checked/Added: productos.marca');

        // 2. Create 'medios_pago' table
        await pool.query(`
            CREATE TABLE IF NOT EXISTS medios_pago (
                id SERIAL PRIMARY KEY,
                nombre VARCHAR(50) NOT NULL UNIQUE,
                activo BOOLEAN DEFAULT TRUE,
                creado_en TIMESTAMP DEFAULT NOW()
            );
        `);
        console.log('Checked/Created: medios_pago table');

        // 2.1 Seed 'medios_pago' defaults
        const defaultPayments = ['Efectivo (USD)', 'Efectivo (Bs)', 'Pago Móvil', 'Zelle', 'Punto de Venta'];
        for (const p of defaultPayments) {
            await pool.query(`INSERT INTO medios_pago (nombre) VALUES ($1) ON CONFLICT (nombre) DO NOTHING`, [p]);
        }
        console.log('Seeded: medios_pago defaults');


        // 3. Create 'presentaciones' table
        await pool.query(`
            CREATE TABLE IF NOT EXISTS presentaciones (
                id SERIAL PRIMARY KEY,
                nombre VARCHAR(50) NOT NULL UNIQUE,
                activo BOOLEAN DEFAULT TRUE
            );
        `);
        console.log('Checked/Created: presentaciones table');

        // 3.1 Seed 'presentaciones' defaults
        const defaultPresentations = ['Unidad', 'Caja', 'Bulto', 'Paquete', 'Sobre', 'Litro', 'Kilo'];
        for (const p of defaultPresentations) {
            await pool.query(`INSERT INTO presentaciones (nombre) VALUES ($1) ON CONFLICT (nombre) DO NOTHING`, [p]);
        }
        console.log('Seeded: presentaciones defaults');

        console.log('--- SCHEMA UPDATE COMPLETE ---');

    } catch (err) {
        console.error('Error updating schema:', err);
    } finally {
        await pool.end();
    }
}

updateSchema();
