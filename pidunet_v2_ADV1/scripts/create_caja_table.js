const { Pool } = require('pg');
const { getMasterPoolConfig } = require('../config/db');

const pool = new Pool(getMasterPoolConfig());

async function createCajaSchema() {
    try {
        const client = await pool.connect();

        console.log('--- Creando Tabla de Sesiones de Caja ---');

        // 1. Create Table (Updated for Details)
        await client.query(`
            CREATE TABLE IF NOT EXISTS caja_sesiones (
                id SERIAL PRIMARY KEY,
                usuario_id INTEGER REFERENCES usuarios(id),
                fecha_apertura TIMESTAMP DEFAULT NOW(),
                fecha_cierre TIMESTAMP,
                monto_apertura DECIMAL(10, 2) NOT NULL DEFAULT 0,
                monto_cierre_declarado DECIMAL(10, 2),
                monto_teorico DECIMAL(10, 2),
                diferencia DECIMAL(10, 2),
                detalles_cierre JSONB, -- Stores breakdown { efectivo: { sistema: 100, declarado: 90 }, ... }
                observaciones TEXT,  -- For explanations of deficits
                estado VARCHAR(20) DEFAULT 'abierta' CHECK (estado IN ('abierta', 'cerrada'))
            );
        `);
        console.log('Tabla caja_sesiones: Creada/Verificada');

        // Check/Add new columns if table existed
        await client.query(`
            DO $$ 
            BEGIN 
                BEGIN
                    ALTER TABLE caja_sesiones ADD COLUMN detalles_cierre JSONB;
                EXCEPTION WHEN duplicate_column THEN NULL; END;
                
                BEGIN
                    ALTER TABLE caja_sesiones ADD COLUMN observaciones TEXT;
                EXCEPTION WHEN duplicate_column THEN NULL; END;
                
                BEGIN
                    ALTER TABLE caja_sesiones ADD COLUMN monto_ventas_sistema DECIMAL(12, 2) DEFAULT 0;
                EXCEPTION WHEN duplicate_column THEN NULL; END;

                BEGIN
                    ALTER TABLE caja_sesiones ADD COLUMN monto_teorico DECIMAL(12, 2) DEFAULT 0;
                EXCEPTION WHEN duplicate_column THEN NULL; END;

                BEGIN
                    ALTER TABLE caja_sesiones ADD COLUMN diferencia DECIMAL(12, 2) DEFAULT 0;
                EXCEPTION WHEN duplicate_column THEN NULL; END;
            END $$;
        `);
        

        // 2. Add caja_id to Ventas
        // Check if column exists
        const checkCol = await client.query(`
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name='ventas' AND column_name='caja_id'
        `);

        if (checkCol.rows.length === 0) {
            await client.query(`
                ALTER TABLE ventas 
                ADD COLUMN caja_id INTEGER REFERENCES caja_sesiones(id);
            `);
            console.log('Columna caja_id agregada a tabla ventas.');
        } else {
            console.log('Columna caja_id ya existe en ventas.');
        }

        console.log('--- Esquema de Caja Actualizado ---');
        client.release();
    } catch (err) {
        console.error('Error al actualizar esquema:', err);
    } finally {
        pool.end();
    }
}

createCajaSchema();
