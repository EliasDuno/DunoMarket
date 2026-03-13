-- Create Configuration table for global settings
CREATE TABLE IF NOT EXISTS configuracion (
    clave VARCHAR(50) PRIMARY KEY,
    valor VARCHAR(255) NOT NULL,
    actualizado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Initialize Dollar Price (Example: 45.00)
INSERT INTO configuracion (clave, valor) 
VALUES ('precio_dolar', '45.00')
ON CONFLICT (clave) DO NOTHING;

-- Create Products table
CREATE TABLE IF NOT EXISTS productos (
    id SERIAL PRIMARY KEY,
    codigo VARCHAR(50) UNIQUE NOT NULL,
    nombre VARCHAR(255) NOT NULL,
    descripcion TEXT,
    costo_usd DECIMAL(12, 2) DEFAULT 0.00,
    margen_ganancia DECIMAL(12, 2) DEFAULT 0.00, -- Percentage
    stock INTEGER DEFAULT 0,
    stock_minimo INTEGER DEFAULT 5,
    categoria VARCHAR(100),
    activo BOOLEAN DEFAULT TRUE,
    creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    actualizado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Trigger to update 'actualizado_en' timestamp
CREATE OR REPLACE FUNCTION update_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.actualizado_en = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_productos_timestamp
BEFORE UPDATE ON productos
FOR EACH ROW
EXECUTE FUNCTION update_timestamp();

CREATE TRIGGER update_configuracion_timestamp
BEFORE UPDATE ON configuracion
FOR EACH ROW
EXECUTE FUNCTION update_timestamp();
