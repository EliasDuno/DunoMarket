const { Pool } = require('pg');
const { getMasterPoolConfig } = require('../config/db');

const pool = new Pool(getMasterPoolConfig());

async function updateSchema() {
    try {
        console.log('Verificando esquema de base de datos...');

        // Update Categories
        await pool.query('ALTER TABLE categorias ADD COLUMN IF NOT EXISTS activo BOOLEAN DEFAULT true');
        console.log('Tabla categorias: columna "activo" asegurada.');

        // Update Suppliers
        await pool.query('ALTER TABLE proveedores ADD COLUMN IF NOT EXISTS activo BOOLEAN DEFAULT true');
        console.log('Tabla proveedores: columna "activo" asegurada.');

        console.log('Actualización completada.');
    } catch (err) {
        console.error('Error actualizando esquema:', err);
    } finally {
        pool.end();
    }
}

updateSchema();
