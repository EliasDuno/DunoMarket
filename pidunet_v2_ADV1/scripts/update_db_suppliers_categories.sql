-- Create Categories table
CREATE TABLE IF NOT EXISTS categorias (
    id SERIAL PRIMARY KEY,
    nombre VARCHAR(100) UNIQUE NOT NULL,
    creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create Suppliers table
CREATE TABLE IF NOT EXISTS proveedores (
    id SERIAL PRIMARY KEY,
    rif VARCHAR(50) UNIQUE NOT NULL,
    nombre VARCHAR(255) NOT NULL,
    telefono VARCHAR(50),
    creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Update Products table to include foreign keys
-- First, add columns
ALTER TABLE productos ADD COLUMN IF NOT EXISTS categoria_id INTEGER REFERENCES categorias(id) ON DELETE SET NULL;
ALTER TABLE productos ADD COLUMN IF NOT EXISTS proveedor_id INTEGER REFERENCES proveedores(id) ON DELETE SET NULL;

-- Remove the old static category column if it exists and we're ready (optional, keeping for safety for now)
-- ALTER TABLE productos DROP COLUMN IF EXISTS categoria;
