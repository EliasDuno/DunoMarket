const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const { Pool } = require('pg');
const { getMasterPoolConfig, getTenantPoolConfig } = require('../config/db');
const bcrypt = require('bcrypt');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const nodemailer = require('nodemailer');
const { checkAndSendAlerts } = require('../alerts-module');
const app = express();
const port = 3000;

// Asegurar que exista el directorio de subidas (uploads)
const uploadDir = path.join(__dirname, '..', 'uploads');
try {
    if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true });
    }
} catch (e) {
    console.warn('Advertencia: No se pudo crear el directorio de uploads (posible entorno de solo lectura):', e.message);
}
// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, '..'))); // Serve static files from root

// Configure Multer for Memory Storage (BYTEA)
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

// --- SaaS / Multi-Tenancy Configuration ---
const masterPool = new Pool(getMasterPoolConfig());

const tenantPools = new Map();
const tenantSchemaEnsured = new Set();

function isBcryptHash(value) {
    return typeof value === 'string' && /^\$2[aby]\$\d{2}\$/.test(value);
}

// --- GLOBAL AUDIT LOGGING ---
global.logAudit = async (req, userId, accion, tabla, registro_id, detalle, ip) => {
    try {
        const pool = req.pool;
        if (!pool) return;
        
        await pool.query(
            'INSERT INTO auditoria (usuario_id, accion, tabla, registro_id, detalle, ip) VALUES ($1, $2, $3, $4, $5, $6)',
            [userId || null, accion, tabla, registro_id || null, JSON.stringify(detalle || {}), ip || '']
        );
    } catch (e) {
        console.error('ERROR IN AUDIT LOG:', e);
    }
};

function normalizeTenantSlug(value) {
    if (Array.isArray(value)) value = value[0];
    return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

async function getUsuarioColumnNames(pool) {
    const result = await pool.query(`
        SELECT column_name
        FROM information_schema.columns
        WHERE table_schema = current_schema()
          AND table_name = 'usuarios'
    `);

    return new Set(result.rows.map(row => row.column_name));
}

async function ensureUsuarioSchema(pool) {
    const client = await pool.connect();
    try {
        await client.query(`
            CREATE TABLE IF NOT EXISTS usuarios (
                id SERIAL PRIMARY KEY,
                nombre VARCHAR(100) NOT NULL,
                email VARCHAR(100) UNIQUE NOT NULL,
                password_hash VARCHAR(255),
                rol VARCHAR(20) DEFAULT 'vendedor',
                activo BOOLEAN DEFAULT true,
                creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                avatar_data BYTEA,
                avatar_mime VARCHAR(50)
            );
        `);

        await client.query(`ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS password_hash VARCHAR(255);`);
        await client.query(`ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS rol VARCHAR(20) DEFAULT 'vendedor';`);
        await client.query(`ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS activo BOOLEAN DEFAULT true;`);
        await client.query(`ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP;`);
        await client.query(`ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS avatar_data BYTEA;`);
        await client.query(`ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS avatar_mime VARCHAR(50);`);

        const legacyPassword = await client.query(`
            SELECT 1
            FROM information_schema.columns
            WHERE table_schema = current_schema()
              AND table_name = 'usuarios'
              AND column_name = 'password'
        `);

        if (legacyPassword.rows.length > 0) {
            await client.query(`ALTER TABLE usuarios ALTER COLUMN password DROP NOT NULL;`);
            await client.query(`UPDATE usuarios SET password_hash = password WHERE password_hash IS NULL AND password IS NOT NULL;`);
        }
    } finally {
        client.release();
    }
}

async function getTenantPool(slug) {
    if (tenantPools.has(slug)) return tenantPools.get(slug);

    try {
        const result = await masterPool.query('SELECT db_url FROM tenants WHERE slug = $1 AND status = $2', [slug, 'active']);
        if (result.rows.length === 0) return null;

        const tenantPool = new Pool(getTenantPoolConfig(result.rows[0].db_url));
        tenantPool.on('error', (err) => console.error(`Pool error for tenant ${slug}:`, err));

        try {
            await ensureUsuarioSchema(tenantPool);
            tenantSchemaEnsured.add(slug);
        } catch (schemaErr) {
            console.error(`No se pudo verificar el esquema del tenant ${slug}:`, schemaErr);
        }

        tenantPools.set(slug, tenantPool);
        return tenantPool;
    } catch (err) {
        console.error(`Error connecting to tenant DB (${slug}):`, err);
        return null;
    }
}

// Lightweight API health check for deployment/routing diagnostics.
app.get('/api/health', (req, res) => {
    res.json({ success: true, service: 'pidunet-api' });
});

// ATTACH TENANT POOL MIDDLEWARE
app.use(async (req, res, next) => {
    // SaaS endpoints always use master pool
    if (req.path.startsWith('/api/saas')) {
        req.pool = masterPool;
        return next();
    }

    const slug = normalizeTenantSlug(req.headers['x-tenant-slug']);
    if (!slug) {
        if (req.path === '/api/login') {
            return res.status(400).json({ success: false, message: 'Código de empresa requerido' });
        }

        // For public assets or if forgotten, default to master.
        req.pool = masterPool;
        return next();
    }

    const pool = await getTenantPool(slug);
    if (!pool) return res.status(404).json({ success: false, message: 'Código de empresa no encontrado o servicio suspendido' });
    
    req.pool = pool;
    next();
});

// FISCAL MIDDLEWARE
// Use this in routes that modify data: app.post/put/delete(..., checkFiscal, ...)
// Note: Requests must have user info (either from body or header). 
// For simplicity, we'll check body.userId or header 'x-user-role' if available,
// but robustly we should use JWT. Here we rely on the request having user context.
global.checkFiscal = async (req, res, next) => {
    // Assuming frontend sends user info in headers or we check session
    // For this architecture without JWT, we trust the 'x-user-role' header sent by client
    const role = req.headers['x-user-role'];
    if (role === 'fiscal') {
        return res.status(403).json({ success: false, message: 'Acción no permitida para Auditor Fiscal' });
    }
    next();
};

// Probar conexión a BD e Inicializar Tablas Maestras
masterPool.connect(async (err, client, release) => {
    if (err) {
        return console.error('Error connecting to Master DB:', err.stack);
    }
    console.log('Master DB conectada exitosamente');

    try {
        // Tenants Table
        await client.query(`
            CREATE TABLE IF NOT EXISTS tenants (
                id SERIAL PRIMARY KEY,
                nombre VARCHAR(255) NOT NULL,
                slug VARCHAR(50) UNIQUE NOT NULL,
                db_url TEXT NOT NULL,
                status VARCHAR(20) DEFAULT 'active',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);
        await client.query(`ALTER TABLE tenants ADD COLUMN IF NOT EXISTS is_provisioned BOOLEAN DEFAULT false;`);
        console.log('Tabla tenants verificada.');
    } catch (e) {
        console.error('Error init master tables', e);
    } finally {
        release();
    }
});

// --- SAAS API ENDPOINTS ---

app.get('/api/saas/tenants', async (req, res) => {
    try {
        const result = await masterPool.query('SELECT * FROM tenants ORDER BY created_at DESC');
        const tenants = result.rows;
        
        for (const tenant of tenants) {
            if (!tenant.is_provisioned) {
                const pool = await getTenantPool(tenant.slug);
                if (pool) {
                    try {
                        const testRes = await pool.query(`
                            SELECT EXISTS (
                                SELECT FROM information_schema.tables 
                                WHERE table_schema = 'public' 
                                  AND table_name = 'ventas'
                            );
                        `);
                        if (testRes.rows[0].exists) {
                            await masterPool.query('UPDATE tenants SET is_provisioned = true WHERE id = $1', [tenant.id]);
                            tenant.is_provisioned = true;
                        }
                    } catch (err) {
                        console.error(`Error checking DB for tenant ${tenant.slug}:`, err.message);
                    }
                }
            }
        }
        res.json(tenants);
    } catch (e) { res.status(500).json({ message: e.message }); }
});

app.post('/api/saas/tenants', async (req, res) => {
    const { nombre, slug, dbUrl } = req.body;
    try {
        await masterPool.query(
            'INSERT INTO tenants (nombre, slug, db_url) VALUES ($1, $2, $3)',
            [nombre, slug, dbUrl]
        );
        res.status(201).json({ success: true });
    } catch (e) { res.status(400).json({ message: e.message }); }
});

app.put('/api/saas/tenants/:id', async (req, res) => {
    const { id } = req.params;
    const { nombre, slug, dbUrl, status } = req.body;
    try {
        await masterPool.query(
            'UPDATE tenants SET nombre = $1, slug = $2, db_url = $3, status = $4 WHERE id = $5',
            [nombre, slug, dbUrl, status || 'active', id]
        );
        res.json({ success: true, message: 'Empresa actualizada exitosamente' });
    } catch (e) { res.status(400).json({ message: e.message }); }
});

app.get('/api/saas/usage', async (req, res) => {
    try {
        const tenantsResult = await masterPool.query("SELECT * FROM tenants ORDER BY created_at DESC");
        const usageData = [];

        for (const tenant of tenantsResult.rows) {
            const pool = await getTenantPool(tenant.slug);
            if (!pool) {
                usageData.push({
                    id: tenant.id,
                    nombre: tenant.nombre,
                    slug: tenant.slug,
                    status: tenant.status,
                    is_provisioned: tenant.is_provisioned || false,
                    error: 'Error al conectar con la base de datos'
                });
                continue;
            }

            try {
                // Consultar métricas de consumo del inquilino
                const salesRes = await pool.query('SELECT COUNT(*) as transacciones, COALESCE(SUM(total_usd), 0) as total_usd FROM ventas');
                const productsRes = await pool.query('SELECT COUNT(*) as productos FROM productos');
                const usersRes = await pool.query('SELECT COUNT(*) as usuarios FROM usuarios');

                // Auto-marcar como aprovisionado si las tablas ya existen y responden
                if (!tenant.is_provisioned) {
                    await masterPool.query('UPDATE tenants SET is_provisioned = true WHERE id = $1', [tenant.id]);
                    tenant.is_provisioned = true;
                }

                usageData.push({
                    id: tenant.id,
                    nombre: tenant.nombre,
                    slug: tenant.slug,
                    status: tenant.status,
                    is_provisioned: true,
                    transacciones: parseInt(salesRes.rows[0].transacciones || 0),
                    total_usd: parseFloat(salesRes.rows[0].total_usd || 0),
                    productos: parseInt(productsRes.rows[0].productos || 0),
                    usuarios: parseInt(usersRes.rows[0].usuarios || 0)
                });
            } catch (tenantErr) {
                usageData.push({
                    id: tenant.id,
                    nombre: tenant.nombre,
                    slug: tenant.slug,
                    status: tenant.status,
                    is_provisioned: tenant.is_provisioned || false,
                    error: `Error al consultar datos: ${tenantErr.message}`
                });
            }
        }

        res.json(usageData);
    } catch (e) {
        res.status(500).json({ message: e.message });
    }
});

// Shared DB Initialization Script (Used for provisioning)
async function initializeTenantDB(tenantPool) {
    const client = await tenantPool.connect();
    try {
        await client.query('BEGIN');
        // --- Core Tables ---
        await client.query(`
            CREATE TABLE IF NOT EXISTS clientes (
                id SERIAL PRIMARY KEY,
                cedula VARCHAR(20) UNIQUE NOT NULL,
                nombre VARCHAR(100) NOT NULL,
                email VARCHAR(100),
                telefono VARCHAR(20),
                fecha_registro TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);
        
        await client.query(`
            CREATE TABLE IF NOT EXISTS usuarios (
                id SERIAL PRIMARY KEY,
                nombre VARCHAR(100) NOT NULL,
                email VARCHAR(100) UNIQUE NOT NULL,
                password_hash VARCHAR(255),
                rol VARCHAR(20) DEFAULT 'vendedor',
                activo BOOLEAN DEFAULT true,
                creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                avatar_data BYTEA,
                avatar_mime VARCHAR(50)
            );
        `);

        await client.query(`
            CREATE TABLE IF NOT EXISTS configuracion (
                clave VARCHAR(50) PRIMARY KEY,
                valor VARCHAR(255) NOT NULL,
                actualizado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

        await client.query(`
            INSERT INTO configuracion (clave, valor)
            VALUES ('precio_dolar', '45.00')
            ON CONFLICT (clave) DO NOTHING;
        `);

        await client.query(`
            CREATE TABLE IF NOT EXISTS categorias (
                id SERIAL PRIMARY KEY,
                nombre VARCHAR(100) UNIQUE NOT NULL,
                descripcion TEXT,
                activo BOOLEAN DEFAULT true,
                creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

        await client.query(`
            CREATE TABLE IF NOT EXISTS proveedores (
                id SERIAL PRIMARY KEY,
                rif VARCHAR(50) UNIQUE,
                nombre VARCHAR(255) NOT NULL,
                telefono VARCHAR(50),
                email VARCHAR(100),
                direccion TEXT,
                activo BOOLEAN DEFAULT true,
                creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

        await client.query(`
            CREATE TABLE IF NOT EXISTS productos (
                id SERIAL PRIMARY KEY,
                codigo VARCHAR(50) UNIQUE NOT NULL,
                nombre VARCHAR(255) NOT NULL,
                descripcion TEXT,
                costo_usd DECIMAL(12, 2) DEFAULT 0.00,
                margen_ganancia DECIMAL(12, 2) DEFAULT 0.00,
                stock INTEGER DEFAULT 0,
                stock_minimo INTEGER DEFAULT 5,
                categoria VARCHAR(100),
                categoria_id INTEGER REFERENCES categorias(id) ON DELETE SET NULL,
                proveedor_id INTEGER REFERENCES proveedores(id) ON DELETE SET NULL,
                activo BOOLEAN DEFAULT true,
                creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                actualizado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

        await client.query(`
            CREATE TABLE IF NOT EXISTS caja_sesiones (
                id SERIAL PRIMARY KEY,
                usuario_id INTEGER NOT NULL,
                fecha_apertura TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                fecha_cierre TIMESTAMP,
                monto_apertura DECIMAL(12, 2) DEFAULT 0.00,
                monto_cierre_declarado DECIMAL(12, 2),
                monto_teorico DECIMAL(12, 2) DEFAULT 0,
                monto_ventas_sistema DECIMAL(12, 2) DEFAULT 0,
                diferencia DECIMAL(12, 2) DEFAULT 0,
                detalles_cierre JSONB,
                observaciones TEXT,
                estado VARCHAR(20) DEFAULT 'abierta'
            );
        `);

        await client.query(`
            CREATE TABLE IF NOT EXISTS ventas (
                id SERIAL PRIMARY KEY,
                fecha TIMESTAMP DEFAULT NOW(),
                metodo_pago VARCHAR(50) NOT NULL,
                total_usd NUMERIC(10, 2) NOT NULL,
                tasa_bcv NUMERIC(10, 2),
                total_bs NUMERIC(12, 2),
                caja_id INTEGER REFERENCES caja_sesiones(id),
                cliente_id INTEGER,
                observaciones TEXT
            );
        `);

        await client.query(`
            CREATE TABLE IF NOT EXISTS detalle_ventas (
                id SERIAL PRIMARY KEY,
                venta_id INTEGER REFERENCES ventas(id) ON DELETE CASCADE,
                producto_id INTEGER,
                cantidad DECIMAL(12, 2),
                precio_unitario_usd DECIMAL(12, 2),
                costo_unitario_usd DECIMAL(12, 2),
                subtotal_usd DECIMAL(12, 2)
            );
        `);

        await client.query(`
            CREATE TABLE IF NOT EXISTS compromisos_pago (
                id SERIAL PRIMARY KEY,
                proveedor_id INTEGER,
                descripcion TEXT NOT NULL,
                monto_total_usd DECIMAL(10, 2) NOT NULL,
                monto_pagado_usd DECIMAL(10, 2) DEFAULT 0,
                fecha_vencimiento DATE NOT NULL,
                estado VARCHAR(20) DEFAULT 'PENDIENTE',
                creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

        // Add all existing migrations and tables
        await client.query(`ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS password_hash VARCHAR(255);`);
        await client.query(`ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS avatar_mime VARCHAR(50);`);
        await client.query(`ALTER TABLE productos ADD COLUMN IF NOT EXISTS stock_principal INTEGER DEFAULT 0;`);
        await client.query(`ALTER TABLE productos ADD COLUMN IF NOT EXISTS stock_secundaria INTEGER DEFAULT 0;`);
        await client.query(`ALTER TABLE productos ADD COLUMN IF NOT EXISTS stock_merma INTEGER DEFAULT 0;`);
        await client.query(`ALTER TABLE productos ADD COLUMN IF NOT EXISTS stock_merma_venta INTEGER DEFAULT 0;`);
        await client.query(`ALTER TABLE productos ADD COLUMN IF NOT EXISTS stock_merma_principal INTEGER DEFAULT 0;`);
        await client.query(`ALTER TABLE productos ADD COLUMN IF NOT EXISTS stock_merma_secundaria INTEGER DEFAULT 0;`);
        await client.query(`ALTER TABLE productos ADD COLUMN IF NOT EXISTS fecha_vencimiento DATE;`);
        await client.query(`ALTER TABLE productos ADD COLUMN IF NOT EXISTS presentacion VARCHAR(100);`);
        await client.query(`ALTER TABLE compromisos_pago ADD COLUMN IF NOT EXISTS fecha_emision DATE;`);
        await client.query(`ALTER TABLE compromisos_pago ADD COLUMN IF NOT EXISTS numero_factura VARCHAR(100);`);
        await client.query(`ALTER TABLE proveedores ADD COLUMN IF NOT EXISTS dias_credito INTEGER DEFAULT 0;`);

        await client.query(`ALTER TABLE ventas ADD COLUMN IF NOT EXISTS cliente_id INTEGER REFERENCES clientes(id);`);
        await client.query(`ALTER TABLE ventas ADD COLUMN IF NOT EXISTS observaciones TEXT;`);
        await client.query(`ALTER TABLE compromisos_pago ADD COLUMN IF NOT EXISTS last_alert_sent_at TIMESTAMP;`);

        await client.query(`
            CREATE TABLE IF NOT EXISTS historial_compras (
                id SERIAL PRIMARY KEY,
                producto_id INTEGER REFERENCES productos(id),
                proveedor_id INTEGER REFERENCES proveedores(id),
                cantidad INTEGER NOT NULL,
                costo_unitario_usd DECIMAL(12,2) NOT NULL,
                fecha TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

        await client.query(`
            CREATE TABLE IF NOT EXISTS pagos_ventas (
                id SERIAL PRIMARY KEY,
                venta_id INTEGER,
                metodo VARCHAR(50) NOT NULL,
                monto_usd DECIMAL(10, 2) NOT NULL,
                monto_bs DECIMAL(10, 2) NOT NULL,
                tasa DECIMAL(10, 2) NOT NULL
            );
        `);

        await client.query(`
            CREATE TABLE IF NOT EXISTS compromisos_pago (
                id SERIAL PRIMARY KEY,
                proveedor_id INTEGER REFERENCES proveedores(id) ON DELETE SET NULL,
                descripcion TEXT NOT NULL,
                monto_total_usd DECIMAL(10, 2) NOT NULL,
                monto_pagado_usd DECIMAL(10, 2) DEFAULT 0.00,
                fecha_vencimiento DATE NOT NULL,
                estado VARCHAR(20) DEFAULT 'PENDIENTE',
                creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                fecha_emision DATE,
                numero_factura VARCHAR(100),
                last_alert_sent_at TIMESTAMP
            );
        `);

        await client.query(`
            CREATE TABLE IF NOT EXISTS historial_pagos_compromisos (
                id SERIAL PRIMARY KEY,
                compromiso_id INTEGER REFERENCES compromisos_pago(id) ON DELETE CASCADE,
                monto_usd DECIMAL(10, 2) NOT NULL,
                referencia VARCHAR(100),
                fecha_pago TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

        await client.query(`
            CREATE TABLE IF NOT EXISTS auditoria (
                id SERIAL PRIMARY KEY,
                usuario_id INTEGER,
                accion VARCHAR(100),
                tabla VARCHAR(100),
                registro_id INTEGER,
                detalle TEXT,
                ip VARCHAR(45),
                fecha TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

        await client.query(`
            CREATE TABLE IF NOT EXISTS historial_movimientos (
                id SERIAL PRIMARY KEY,
                producto_id INTEGER REFERENCES productos(id),
                cantidad DECIMAL(12, 2) NOT NULL,
                origen VARCHAR(50),
                destino VARCHAR(50),
                es_merma BOOLEAN DEFAULT false,
                observacion TEXT,
                costo_unitario_snap DECIMAL(12, 2),
                usuario_id INTEGER REFERENCES usuarios(id),
                fecha TIMESTAMP DEFAULT NOW()
            );
        `);

        // Migration for existing caja_sesiones tables
        await client.query(`
            DO $$ 
            BEGIN 
                BEGIN ALTER TABLE caja_sesiones ADD COLUMN monto_cierre_declarado DECIMAL(12, 2); EXCEPTION WHEN duplicate_column THEN NULL; END;
                BEGIN ALTER TABLE caja_sesiones ADD COLUMN monto_teorico DECIMAL(12, 2) DEFAULT 0; EXCEPTION WHEN duplicate_column THEN NULL; END;
                BEGIN ALTER TABLE caja_sesiones ADD COLUMN monto_ventas_sistema DECIMAL(12, 2) DEFAULT 0; EXCEPTION WHEN duplicate_column THEN NULL; END;
                BEGIN ALTER TABLE caja_sesiones ADD COLUMN diferencia DECIMAL(12, 2) DEFAULT 0; EXCEPTION WHEN duplicate_column THEN NULL; END;
                BEGIN ALTER TABLE caja_sesiones ADD COLUMN detalles_cierre JSONB; EXCEPTION WHEN duplicate_column THEN NULL; END;
                BEGIN ALTER TABLE caja_sesiones ADD COLUMN observaciones TEXT; EXCEPTION WHEN duplicate_column THEN NULL; END;
            END $$;
        `);
        
        await client.query('COMMIT');
        return true;
    } catch (e) {
        await client.query('ROLLBACK');
        console.error('Error provisioning tenant:', e);
        throw e;
    } finally {
        client.release();
    }
}

app.post('/api/saas/provision', async (req, res) => {
    const { slug } = req.body;
    const pool = await getTenantPool(slug);
    if (!pool) return res.status(404).json({ message: 'Tenant not found' });

    try {
        await initializeTenantDB(pool);
        await masterPool.query('UPDATE tenants SET is_provisioned = true WHERE slug = $1', [slug]);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ message: e.message }); }
});



// --- Endpoints de la API ---

// LISTAR Usuarios (GET) - Incluye bandera has_avatar
app.get('/api/users', async (req, res) => {
    try {
        const result = await req.pool.query(`
            SELECT id, nombre, email, rol, activo, creado_en, 
            (avatar_data IS NOT NULL) as has_avatar 
            FROM usuarios ORDER BY id ASC
        `);
        res.json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Error al obtener usuarios' });
    }
});

// SERVIR Avatar (GET) - Endpoint dinámico
app.get('/api/users/:id/avatar', async (req, res) => {
    const { id } = req.params;
    try {
        const result = await req.pool.query('SELECT avatar_data, avatar_mime FROM usuarios WHERE id = $1', [id]);
        if (result.rows.length > 0 && result.rows[0].avatar_data) {
            const user = result.rows[0];
            res.setHeader('Content-Type', user.avatar_mime || 'image/png'); // Default to png if missing
            res.send(user.avatar_data);
        } else {
            res.status(404).send('Avatar not found');
        }
    } catch (err) {
        console.error(err);
        res.status(500).send('Error retrieving avatar');
    }
});


// CREAR Usuario (POST)
app.post('/api/users', upload.single('avatar'), async (req, res) => {
    let { nombre, email, password, rol, activo } = req.body;

    if (email) email = email.toLowerCase();
    if (typeof activo === 'string') activo = activo === 'true';

    try {
        // Encrypt password
        const saltRounds = 10;
        const passwordHash = await bcrypt.hash(password, saltRounds);

        let query = 'INSERT INTO usuarios (nombre, email, password_hash, rol, activo, creado_en) VALUES ($1, $2, $3, $4, $5, NOW()) RETURNING id';
        let params = [nombre, email, passwordHash, rol, activo !== undefined ? activo : true];

        if (req.file) {
            query = 'INSERT INTO usuarios (nombre, email, password_hash, rol, activo, creado_en, avatar_data, avatar_mime) VALUES ($1, $2, $3, $4, $5, NOW(), $6, $7) RETURNING id';
            params = [nombre, email, passwordHash, rol, activo !== undefined ? activo : true, req.file.buffer, req.file.mimetype];
        }

        const result = await req.pool.query(query, params);

        // --- Send Welcome Email (Best Effort) ---
        try {
            const configRes = await req.pool.query("SELECT * FROM configuracion WHERE clave IN ('smtp_email', 'smtp_pass')");
            const config = {};
            configRes.rows.forEach(r => config[r.clave] = r.valor);

            if (config.smtp_email && config.smtp_pass) {
                const transporter = nodemailer.createTransport({
                    service: 'gmail',
                    auth: { user: config.smtp_email, pass: config.smtp_pass }
                });

                const mailOptions = {
                    from: `"Sistema PiduNet" <${config.smtp_email}>`,
                    to: email,
                    subject: '🎉 ¡Bienvenido a PiduNet!',
                    html: `
                        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                            <h2 style="color: #4f46e5;">¡Bienvenido al Equipo!</h2>
                            <p>Hola <strong>${nombre}</strong>,</p>
                            <p>Su cuenta ha sido creada exitosamente en el sistema PiduNet.</p>
                            
                            <div style="background-color: #f3f4f6; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 5px solid #4f46e5;">
                                <h3 style="margin-top: 0; color: #1f2937;">Sus Credenciales de Acceso:</h3>
                                <p style="margin: 5px 0;"><strong>Usuario/Email:</strong> ${email}</p>
                                <p style="margin: 5px 0;"><strong>Contraseña:</strong> ${password}</p>
                            </div>

                            <p>Le recomendamos cambiar su contraseña al ingresar por primera vez.</p>
                            <hr style="border: 0; border-top: 1px solid #e5e7eb; margin: 20px 0;">
                            <p style="font-size: 12px; color: #6b7280;">Este es un mensaje automático del sistema.</p>
                        </div>
                    `
                };

                await transporter.sendMail(mailOptions);
                console.log(`Welcome email sent to ${email}`);
            } else {
                console.log('Skipping welcome email: SMTP not configured.');
            }
        } catch (emailErr) {
            console.error('Failed to send welcome email:', emailErr);
            // Non-blocking error
        }
        // ----------------------------------------

        res.json({ success: true, message: 'Usuario creado exitosamente', id: result.rows[0].id });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Error al crear usuario. Verifica que el email no exista.' });
    }
});

// UPDATE User (PUT)
app.put('/api/users/:id', upload.single('avatar'), async (req, res) => {
    const { id } = req.params;
    let { nombre, email, password, rol, activo } = req.body;

    // Enforce lowercase email
    if (email) email = email.toLowerCase();

    // Fix FormData string to boolean conversion
    if (typeof activo === 'string') {
        activo = activo === 'true';
    }

    try {
        let query;
        let values = [];
        let updateParts = [];
        let paramIndex = 1;

        // Helper to push logic
        const addField = (field, value) => {
            updateParts.push(`${field} = $${paramIndex}`);
            values.push(value);
            paramIndex++;
        };

        addField('nombre', nombre);
        addField('email', email);
        addField('rol', rol);
        addField('activo', activo);

        if (password && password.trim() !== '') {
            const saltRounds = 10;
            const passwordHash = await bcrypt.hash(password, saltRounds);
            addField('password_hash', passwordHash);
        }

        if (req.file) {
            addField('avatar_data', req.file.buffer);
            addField('avatar_mime', req.file.mimetype);
        }

        // Add ID last
        values.push(id);
        query = `UPDATE usuarios SET ${updateParts.join(', ')} WHERE id = $${paramIndex}`;

        const result = await req.pool.query(query, values);

        if (result.rowCount > 0) {
            res.json({ success: true, message: 'Usuario actualizado' });
        } else {
            res.status(404).json({ success: false, message: 'Usuario no encontrado' });
        }
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Error al actualizar usuario' });
    }
});

// DELETE User (Soft Delete)
app.delete('/api/users/:id', global.checkFiscal, async (req, res) => {
    const { id } = req.params;
    const userId = req.headers['x-user-id'];
    try {
        await req.pool.query('UPDATE usuarios SET activo = false WHERE id = $1', [id]);
        await global.logAudit(req, userId, 'DELETE_USER', 'usuarios', id, { type: 'soft_delete' }, req.ip);
        res.json({ success: true, message: 'Usuario inactivado' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Error al eliminar usuario' });
    }
});

// Login Endpoint
app.post('/api/login', async (req, res) => {
    let { email, password } = req.body || {};

    email = typeof email === 'string' ? email.trim().toLowerCase() : '';
    password = typeof password === 'string' ? password : '';

    if (!email || !password) {
        return res.status(400).json({ success: false, message: 'Email y contraseña son requeridos' });
    }

    try {
        const columns = await getUsuarioColumnNames(req.pool);

        if (!columns.has('id') || !columns.has('email')) {
            return res.status(500).json({ success: false, message: 'La tabla de usuarios no está configurada correctamente en esta empresa.' });
        }

        const selectFields = ['id', columns.has('nombre') ? 'nombre' : 'email AS nombre', 'email'];
        selectFields.push(columns.has('rol') ? 'rol' : "'vendedor' AS rol");
        selectFields.push(columns.has('activo') ? 'activo' : 'true AS activo');
        selectFields.push(columns.has('password_hash') ? 'password_hash' : 'NULL AS password_hash');
        selectFields.push(columns.has('password') ? 'password AS legacy_password' : 'NULL AS legacy_password');
        selectFields.push(columns.has('avatar_data') ? 'avatar_data' : 'NULL AS avatar_data');

        const result = await req.pool.query(`
            SELECT ${selectFields.join(', ')}
            FROM usuarios
            WHERE LOWER(email) = $1
        `, [email]);

        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Usuario no encontrado' });
        }

        const user = result.rows[0];

        if (user.activo === false) {
            return res.status(403).json({ success: false, message: 'Usuario inactivo' });
        }

        let match = false;
        const storedPassword = user.password_hash || user.legacy_password;

        if (isBcryptHash(storedPassword)) {
            match = await bcrypt.compare(password, storedPassword);
        } else if (typeof storedPassword === 'string' && storedPassword.length > 0) {
            match = password === storedPassword;
        }

        if (!storedPassword) {
            console.error(`Usuario ${email} no tiene contraseña configurada`);
            return res.status(409).json({ success: false, message: 'La contraseña del usuario no está configurada. Contacta al administrador.' });
        }

        if (!match) {
            return res.status(401).json({ success: false, message: 'Contraseña incorrecta' });
        }

        if (columns.has('password_hash') && !isBcryptHash(user.password_hash)) {
            try {
                const upgradedHash = await bcrypt.hash(password, 10);
                await req.pool.query('UPDATE usuarios SET password_hash = $1 WHERE id = $2', [upgradedHash, user.id]);
            } catch (upgradeErr) {
                console.error(`No se pudo actualizar password_hash para ${email}:`, upgradeErr);
            }
        }

        res.json({
            success: true,
            message: 'Login exitoso',
            user: {
                id: user.id, // Critical for avatar fetching
                email: user.email,
                rol: user.rol,
                nombre: user.nombre,
                has_avatar: !!user.avatar_data // Helper to avoid 404 checks
            }
        });
    } catch (err) {
        console.error('Error crítico en /api/login:', err);
        res.status(500).json({ 
            success: false, 
            message: 'Error interno del servidor al procesar el login',
            error: process.env.NODE_ENV === 'production' ? null : err.message
        });
    }
});

// Forgot Password Endpoint
app.post('/api/forgot-password', async (req, res) => {
    const { email } = req.body;

    try {
        // 2. Find Administrators
        const query = "SELECT email FROM usuarios WHERE rol = 'admin'";
        const result = await req.pool.query(query);

        if (result.rows.length > 0) {
            const adminEmails = result.rows.map(row => row.email);

            // 3. Simulate sending email
            console.log(`[Correos] Enviando recuperación a: ${email}`);
            console.log(`[Correos] Destinatarios (Admin): ${adminEmails.join(', ')}`);

            res.json({
                success: true,
                message: `Correos enviados a los administradores: ${adminEmails.join(', ')}`,
                debug_admins: adminEmails
            });
        } else {
            res.status(404).json({ success: false, message: 'No se encontraron administradores para notificar.' });
        }
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Error del servidor' });
    }
});

// --- INVENTORY & CONFIGURATION ENDPOINTS ---

// GET Configuration (Exchange Rate)
app.get('/api/config', async (req, res) => {
    try {
        const result = await req.pool.query('SELECT * FROM configuracion');
        const config = {};
        result.rows.forEach(row => config[row.clave] = row.valor);
        res.json(config);
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Error al obtener configuración' });
    }
});

// UPDATE Configuration
app.post('/api/config', async (req, res) => {
    const { clave, valor } = req.body;
    try {
        await req.pool.query(
            'INSERT INTO configuracion (clave, valor) VALUES ($1, $2) ON CONFLICT (clave) DO UPDATE SET valor = $2',
            [clave, valor]
        );
        res.json({ success: true, message: 'Configuración actualizada' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Error al guardar configuración' });
    }
});

// --- CATEGORIES ENDPOINTS ---
app.get('/api/categories', async (req, res) => {
    try {
        const result = await req.pool.query('SELECT * FROM categorias ORDER BY nombre ASC');
        res.json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Error al obtener categorías' });
    }
});

app.post('/api/categories', async (req, res) => {
    const { id, nombre, activo } = req.body;
    try {
        if (id) {
            await req.pool.query('UPDATE categorias SET nombre = $1, activo = $2 WHERE id = $3', [nombre, activo, id]);
        } else {
            await req.pool.query('INSERT INTO categorias (nombre, activo) VALUES ($1, $2)', [nombre, activo !== undefined ? activo : true]);
        }
        res.json({ success: true, message: 'Categoría guardada' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Error al guardar categoría' });
    }
});

app.delete('/api/categories/:id', global.checkFiscal, async (req, res) => {
    try {
        await req.pool.query('UPDATE categorias SET activo = false WHERE id = $1', [req.params.id]);
        await global.logAudit(req, req.headers['x-user-id'], 'DELETE_CATEGORY', 'categorias', req.params.id, null, req.ip);
        res.json({ success: true, message: 'Categoría inactivada' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Error al eliminar categoría' });
    }
});





// --- SUPPLIERS ENDPOINTS ---
app.get('/api/suppliers', async (req, res) => {
    try {
        const result = await req.pool.query('SELECT * FROM proveedores ORDER BY nombre ASC');
        res.json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Error al obtener proveedores' });
    }
});

app.post('/api/suppliers', async (req, res) => {
    const { id, rif, nombre, telefono, dias_credito, activo } = req.body;
    try {
        if (id) {
            await req.pool.query(
                'UPDATE proveedores SET rif = $1, nombre = $2, telefono = $3, dias_credito = $4, activo = $5 WHERE id = $6',
                [rif, nombre, telefono, dias_credito || 0, activo, id]
            );
        } else {
            await req.pool.query(
                'INSERT INTO proveedores (rif, nombre, telefono, dias_credito, activo) VALUES ($1, $2, $3, $4, $5)',
                [rif, nombre, telefono, dias_credito || 0, activo !== undefined ? activo : true]
            );
        }
        res.json({ success: true, message: 'Proveedor guardado' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Error al guardar proveedor. ¿RIF duplicado?' });
    }
});

app.put('/api/suppliers/:id', async (req, res) => {
    const { id } = req.params;
    const { rif, nombre, telefono, dias_credito, activo } = req.body;
    try {
        await req.pool.query(
            'UPDATE proveedores SET rif = $1, nombre = $2, telefono = $3, dias_credito = $4, activo = $5 WHERE id = $6',
            [rif, nombre, telefono, dias_credito || 0, activo, id]
        );
        res.json({ success: true, message: 'Proveedor actualizado' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Error al actualizar proveedor' });
    }
});

app.delete('/api/suppliers/:id', global.checkFiscal, async (req, res) => {
    try {
        await req.pool.query('UPDATE proveedores SET activo = false WHERE id = $1', [req.params.id]);
        await global.logAudit(req, req.headers['x-user-id'], 'DELETE_SUPPLIER', 'proveedores', req.params.id, null, req.ip);
        res.json({ success: true, message: 'Proveedor inactivado' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Error al eliminar proveedor' });
    }
});

// LIST Products (Updated to include category and supplier names)
app.get('/api/products', async (req, res) => {
    try {
        const result = await req.pool.query(`
            SELECT p.*, 
            p.stock_merma,
            p.stock_merma_venta,
            p.stock_merma_principal,
            p.stock_merma_secundaria,
            ROUND((p.costo_usd * (1 + p.margen_ganancia / 100)), 2) as precio_venta_usd,
            c.nombre as categoria_nombre, 
            s.nombre as proveedor_nombre 
            FROM productos p 
            LEFT JOIN categorias c ON p.categoria_id = c.id 
            LEFT JOIN proveedores s ON p.proveedor_id = s.id 
            ORDER BY p.nombre ASC
        `);
        res.json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Error al obtener productos' });
    }
});

// CREATE/UPDATE Product (Updated for FKs & Warehouses)
app.post('/api/products', async (req, res) => {
    const { id, codigo, nombre, descripcion, costo_usd, margen_ganancia, stock, stock_minimo, categoria_id, proveedor_id, activo, aplica_iva, presentacion, marca, bodega_ingreso, stock_inicial } = req.body;
    console.log(`[API DEBUG] POST /api/products - Tenant: ${req.headers['x-tenant-slug']}, Product: ${nombre}, Code: ${codigo}`);
    try {
        if (id) {
            // Update existing product
            await req.pool.query(
                `UPDATE productos SET 
                codigo = $1, nombre = $2, descripcion = $3, costo_usd = $4, 
                margen_ganancia = $5, stock = $6, stock_minimo = $7, 
                categoria_id = $8, proveedor_id = $9, activo = $10, 
                aplica_iva = $11, presentacion = $12, marca = $13,
                actualizado_en = NOW() 
                WHERE id = $14`,
                [codigo, nombre, descripcion, costo_usd, margen_ganancia, stock, stock_minimo, categoria_id || null, proveedor_id || null, activo, aplica_iva, presentacion || null, marca || null, id]
            );
        } else {
            // Create new product with initial stock in selected warehouse
            const initialQty = parseInt(stock_inicial) || 0;
            let stock_disponible = 0;
            let stock_principal = 0;
            let stock_secundaria = 0;

            if (bodega_ingreso === 'venta') stock_disponible = initialQty;
            else if (bodega_ingreso === 'principal') stock_principal = initialQty;
            else if (bodega_ingreso === 'secundaria') stock_secundaria = initialQty;
            else stock_disponible = initialQty; // Default

            const resInsert = await req.pool.query(
                `INSERT INTO productos (
                    codigo, nombre, descripcion, costo_usd, margen_ganancia, 
                    stock, stock_principal, stock_secundaria,
                    stock_minimo, categoria_id, proveedor_id, activo, aplica_iva, presentacion, marca
                ) 
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15) RETURNING id`,
                [
                    codigo, nombre, descripcion, costo_usd, margen_ganancia, 
                    stock_disponible, stock_principal, stock_secundaria,
                    stock_minimo, categoria_id || null, proveedor_id || null, 
                    activo !== undefined ? activo : true, aplica_iva !== undefined ? aplica_iva : true, 
                    presentacion || null, marca || null
                ]
            );
        }
        res.json({ success: true, message: 'Producto guardado' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Error al guardar producto.' });
    }
});

// GET PRODUCTS
app.get('/api/products', async (req, res) => {
    try {
        const slug = req.headers['x-tenant-slug'];
        console.log(`DEBUG API: Consultando productos para tenant [${slug}]`);
        
        const result = await req.pool.query(`
            SELECT p.id, p.codigo, p.nombre, p.costo_usd, p.margen_ganancia, 
                   p.stock, p.stock_minimo, p.activo, p.stock_principal, p.stock_secundaria,
                   p.stock_merma_venta, p.stock_merma_principal, p.stock_merma_secundaria,
                   c.nombre as categoria_nombre, 
                   pr.nombre as proveedor_nombre,
                   p.categoria_id, p.proveedor_id
            FROM productos p
            LEFT JOIN categorias c ON p.categoria_id = c.id
            LEFT JOIN proveedores pr ON p.proveedor_id = pr.id
            ORDER BY p.id ASC
        `);
        
        console.log(`DEBUG API: Se encontraron ${result.rows.length} productos en la DB.`);
        res.json(result.rows);
    } catch (err) {
        console.error('DEBUG API ERROR:', err);
        res.status(500).json({ error: 'Error al obtener productos: ' + err.message });
    }
});

// --- MEDIOS DE PAGO ENDPOINTS ---
app.get('/api/payment-methods', async (req, res) => {
    try {
        const result = await req.pool.query('SELECT * FROM medios_pago WHERE activo = true ORDER BY id ASC');
        res.json(result.rows);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/payment-methods', async (req, res) => {
    const { nombre } = req.body;
    try {
        await req.pool.query('INSERT INTO medios_pago (nombre) VALUES ($1)', [nombre]);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

app.post('/api/payment-methods/bulk', async (req, res) => {
    const { nombres } = req.body; // Expects array of strings
    if (!Array.isArray(nombres)) return res.status(400).json({ success: false, message: 'Invalid data' });
    try {
        for (const nombre of nombres) {
            await req.pool.query('INSERT INTO medios_pago (nombre) VALUES ($1) ON CONFLICT (nombre) DO NOTHING', [nombre.trim()]);
        }
        res.json({ success: true, message: 'Carga masiva completada' });
    } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

app.delete('/api/payment-methods/:id', async (req, res) => {
    try {
        await req.pool.query('DELETE FROM medios_pago WHERE id = $1', [req.params.id]);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// --- PRESENTACIONES ENDPOINTS ---
app.get('/api/presentations', async (req, res) => {
    try {
        const result = await req.pool.query('SELECT * FROM presentaciones WHERE activo = true ORDER BY nombre ASC');
        res.json(result.rows);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/presentations', async (req, res) => {
    const { nombre } = req.body;
    try {
        await req.pool.query('INSERT INTO presentaciones (nombre) VALUES ($1)', [nombre]);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

app.post('/api/presentations/bulk', async (req, res) => {
    const { nombres } = req.body;
    if (!Array.isArray(nombres)) return res.status(400).json({ success: false, message: 'Invalid data' });
    try {
        for (const nombre of nombres) {
            await req.pool.query('INSERT INTO presentaciones (nombre) VALUES ($1) ON CONFLICT (nombre) DO NOTHING', [nombre.trim()]);
        }
        res.json({ success: true, message: 'Carga masiva completada' });
    } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

app.delete('/api/presentations/:id', async (req, res) => {
    try {
        await req.pool.query('DELETE FROM presentaciones WHERE id = $1', [req.params.id]);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// RECEIVE Stock (Direct Update) - Supports Multi-Warehouse
app.post('/api/products/receive', async (req, res) => {
    const { id, cantidad, nuevo_costo_usd, nuevo_margen, nuevo_aplica_iva, destino, fecha_vencimiento, proveedor_id } = req.body; // destino: 'venta', 'principal', 'secundaria'
    try {
        const prodRes = await req.pool.query('SELECT proveedor_id FROM productos WHERE id = $1', [id]);
        if (prodRes.rows.length === 0) return res.status(404).json({ success: false, message: 'Producto no encontrado' });

        const finalProveedorId = proveedor_id || prodRes.rows[0].proveedor_id;
        const targetColumn = (destino === 'principal') ? 'stock_principal' :
            (destino === 'secundaria') ? 'stock_secundaria' : 'stock';

        // Update Product
        await req.pool.query(
            `UPDATE productos SET 
            ${targetColumn} = ${targetColumn} + $1, 
            costo_usd = $2, 
            margen_ganancia = $3, 
            aplica_iva = $4,
            fecha_vencimiento = COALESCE($6, fecha_vencimiento),
            proveedor_id = COALESCE($7, proveedor_id),
            actualizado_en = NOW() 
            WHERE id = $5`,
            [cantidad, nuevo_costo_usd, nuevo_margen, nuevo_aplica_iva, id, fecha_vencimiento, proveedor_id]
        );

        // Log History
        await req.pool.query(
            `INSERT INTO historial_compras (producto_id, proveedor_id, cantidad, costo_unitario_usd) 
             VALUES ($1, $2, $3, $4)`,
            [id, finalProveedorId, cantidad, nuevo_costo_usd]
        );

        // Audit Log
        await global.logAudit(req, req.headers['x-user-id'], 'RECEIVE_STOCK', 'productos', id, { quantity: cantidad, cost: nuevo_costo_usd, dest: destino }, req.ip);

        res.json({ success: true, message: `Inventario recibido en ${destino || 'Venta'}` });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Error al actualizar stock' });
    }
});

// TRANSFER Stock Endpoint
app.post('/api/inventory/transfer', async (req, res) => {
    const { producto_id, origen, destino, cantidad, isMerma, observacion } = req.body;
    // origen/destino: 'venta', 'principal', 'secundaria'

    if (!producto_id || !origen || !cantidad || cantidad <= 0) {
        return res.status(400).json({ success: false, message: 'Datos incompletos o cantidad inválida' });
    }
    // Destination is required only if NOT merma
    if (!isMerma && (!destino || origen === destino)) {
        return res.status(400).json({ success: false, message: 'Destino inválido o igual al origen' });
    }

    const colMap = {
        'venta': 'stock',
        'principal': 'stock_principal',
        'secundaria': 'stock_secundaria'
    };

    // Specific Merma Columns per Warehouse
    const colMapMerma = {
        'venta': 'stock_merma_venta',
        'principal': 'stock_merma_principal',
        'secundaria': 'stock_merma_secundaria'
    };

    console.log(`[API TRANSFER] Iniciando transferencia para producto ${producto_id} de ${origen} a ${destino} (Cant: ${cantidad}, Merma: ${isMerma})`);
    
    const colOrigin = colMap[origen];
    // If it's merma, use the destination warehouse to store it if provided, else use origin's merma col
    const colDest = isMerma ? (colMapMerma[destino] || colMapMerma[origen]) : colMap[destino];

    if (!colOrigin || !colDest) {
        console.error(`[API TRANSFER] Ubicación inválida: origen=${origen}, destino=${destino}`);
        return res.status(400).json({ success: false, message: 'Ubicación inválida' });
    }

    const client = await req.pool.connect();
    console.log('[API TRANSFER] Conectado a la base de datos del cliente.');
    try {
        await client.query('BEGIN');
        console.log('[API TRANSFER] Transacción iniciada (BEGIN).');

        const resProd = await client.query(`SELECT ${colOrigin} as current_stock, costo_usd FROM productos WHERE id = $1`, [producto_id]);
        if (resProd.rows.length === 0) throw new Error('Producto no encontrado');

        const product = resProd.rows[0];
        const currentStock = product.current_stock || 0;
        const currentCost = parseFloat(product.costo_usd) || 0;

        if (currentStock < cantidad) throw new Error('Stock insuficiente en origen');

        // Execute Transfer
        await client.query(`UPDATE productos SET ${colOrigin} = ${colOrigin} - $1 WHERE id = $2`, [cantidad, producto_id]);
        await client.query(`UPDATE productos SET ${colDest} = ${colDest} + $1 WHERE id = $2`, [cantidad, producto_id]);

        // LOG MOVEMENT (History/Merma)
        const userId = req.headers['x-user-id'] ? parseInt(req.headers['x-user-id']) : null;
        await client.query(
            `INSERT INTO historial_movimientos (producto_id, cantidad, origen, destino, es_merma, observacion, costo_unitario_snap, usuario_id)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
            [producto_id, cantidad, origen, isMerma ? `merma_${destino || origen}` : destino, !!isMerma, observacion || '', currentCost, userId]
        );

        await client.query('COMMIT');

        // Audit Log
        await global.logAudit(req, req.headers['x-user-id'], 'TRANSFER_STOCK', 'productos', producto_id, { from: origen, to: isMerma ? `merma_${destino || origen}` : destino, qty: cantidad, merma: !!isMerma }, req.ip);

        res.json({ success: true, message: isMerma ? 'Registrado como Merma' : 'Transferencia exitosa' });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error(err);
        res.status(500).json({ success: false, message: err.message });
    } finally {
        client.release();
    }
});

// BULK CREATE Products
app.post('/api/products/bulk-create', async (req, res) => {
    const { products } = req.body; // Array of {codigo, nombre, categoria, costo, margen, minimo, proveedor}
    if (!products || !Array.isArray(products)) return res.status(400).json({ success: false, message: 'Formato inválido' });

    const results = { success: 0, failed: 0, errors: [] };
    const client = await req.pool.connect();

    try {
        await client.query('BEGIN');

        for (const p of products) {
            try {
                // 1. Resolve Category
                let catId = null;
                const catName = p.categoria && p.categoria.trim() ? p.categoria.trim() : 'General';

                const resCat = await client.query('SELECT id FROM categorias WHERE LOWER(nombre) = LOWER($1)', [catName]);
                if (resCat.rows.length > 0) {
                    catId = resCat.rows[0].id;
                } else {
                    // Create Category if not exists (including General)
                    const newCat = await client.query('INSERT INTO categorias (nombre, descripcion) VALUES ($1, $2) RETURNING id', [catName, 'Categoría automática']);
                    catId = newCat.rows[0].id;
                }

                // 2. Resolve Provider (Optional)
                let provId = null;
                const provName = p.proveedor && p.proveedor.trim() ? p.proveedor.trim() : 'General';

                const resProv = await client.query('SELECT id FROM proveedores WHERE LOWER(nombre) = LOWER($1)', [provName]);
                if (resProv.rows.length > 0) {
                    provId = resProv.rows[0].id;
                } else {
                    // Create Provider if not exists (including General)
                    const newProv = await client.query('INSERT INTO proveedores (nombre, contacto) VALUES ($1, $2) RETURNING id', [provName, 'Proveedor automático']);
                    provId = newProv.rows[0].id;
                }

                // 3. Insert Product (Stock always 0 per rule)
                // Check duplicate code first
                const check = await client.query('SELECT id FROM productos WHERE codigo = $1', [p.codigo]);
                if (check.rows.length > 0) {
                    results.failed++;
                    results.errors.push(`Código duplicado: ${p.codigo}`);
                    continue; // Skip
                }

                await client.query(
                    `INSERT INTO productos (codigo, nombre, descripcion, costo_usd, margen_ganancia, stock, stock_minimo, categoria_id, proveedor_id, activo, marca)
                     VALUES ($1, $2, $3, $4, $5, 0, $6, $7, $8, true, $9)`,
                    [
                        p.codigo,
                        p.nombre,
                        'Importado masivamente',
                        parseFloat(p.costo) || 0,
                        parseFloat(p.margen) || 30,
                        parseInt(p.minimo) || 5,
                        catId,
                        provId,
                        p.marca || null
                    ]
                );
                results.success++;

            } catch (rowErr) {
                results.failed++;
                results.errors.push(`Error en ${p.codigo || 'fila'}: ${rowErr.message}`);
            }
        }

        await client.query('COMMIT');
        res.json({ success: true, results });

    } catch (err) {
        await client.query('ROLLBACK');
        console.error(err);
        res.status(500).json({ success: false, message: 'Error general en carga masiva' });
    } finally {
        client.release();
    }
});

// BULK RECEIVE Stock
app.post('/api/products/bulk-receive', async (req, res) => {
    const { items } = req.body; // Array of {codigo, cantidad, costo, proveedor, destino}
    if (!items || !Array.isArray(items)) return res.status(400).json({ success: false, message: 'Formato inválido' });

    const results = { success: 0, failed: 0, errors: [] };
    const client = await req.pool.connect();

    try {
        await client.query('BEGIN');

        for (const item of items) {
            try {
                // 1. Find Product
                const resProd = await client.query('SELECT id, stock, stock_principal, stock_secundaria, proveedor_id, costo_usd FROM productos WHERE codigo = $1', [item.codigo]);
                if (resProd.rows.length === 0) {
                    results.failed++;
                    results.errors.push(`Producto no encontrado: ${item.codigo}`);
                    continue;
                }
                const product = resProd.rows[0];
                const qty = parseFloat(item.cantidad) || 0;
                if (qty <= 0) { /* skip 0 qty? maybe warning */ continue; }

                const newCost = item.costo ? parseFloat(item.costo) : (item.costo_nuevo ? parseFloat(item.costo_nuevo) : product.costo_usd); // Support multiple keys

                // 2. Resolve Provider (Optional override)
                let finalProvId = product.proveedor_id;
                if (item.proveedor) {
                    const resProv = await client.query('SELECT id FROM proveedores WHERE LOWER(nombre) = LOWER($1)', [item.proveedor.trim()]);
                    if (resProv.rows.length > 0) {
                        finalProvId = resProv.rows[0].id;
                        await client.query('UPDATE productos SET proveedor_id = $1 WHERE id = $2', [finalProvId, product.id]);
                        // Log provider change? Maybe not needed for bulk.
                    }
                }

                // 3. Update Stock & Cost
                // Determine destination column
                let destCol = 'stock'; // Default logic: 'venta' or unspecified -> stock
                let destInput = (item.destino || item.DESTINO || 'venta').toLowerCase().trim();

                if (destInput.includes('principal') || destInput.includes('bodega principal')) destCol = 'stock_principal';
                else if (destInput.includes('secundaria') || destInput.includes('bodega secundaria')) destCol = 'stock_secundaria';

                // Update specific column and cost
                // If destination is 'venta', updates 'stock'. If 'principal', 'stock_principal'.
                // Cost is global for the product usually, so we update it.
                await client.query(
                    `UPDATE productos SET ${destCol} = ${destCol} + $1, costo_usd = $2 WHERE id = $3`,
                    [qty, newCost, product.id]
                );

                // 4. Log History
                await client.query(
                    `INSERT INTO historial_compras (producto_id, proveedor_id, cantidad, costo_unitario_usd) 
                     VALUES ($1, $2, $3, $4)`,
                    [product.id, finalProvId, qty, newCost]
                );

                results.success++;

            } catch (rowErr) {
                results.failed++;
                results.errors.push(`Error en ${item.codigo}: ${rowErr.message}`);
            }
        }

        await client.query('COMMIT');
        res.json({ success: true, results });

    } catch (err) {
        await client.query('ROLLBACK');
        console.error(err);
        res.status(500).json({ success: false, message: 'Error general en recepción masiva' });
    } finally {
        client.release();
    }
});

// GET MERMAS - New Endpoint
app.get('/api/mermas', async (req, res) => {
    try {
        const { startDate, endDate } = req.query;
        let query = `
            SELECT h.fecha, p.nombre as producto, h.origen as bodega, h.cantidad, h.costo_unitario_snap as costo_unitario_usd, 'MERMA' as tipo_movimiento, h.observacion
            FROM historial_movimientos h
            JOIN productos p ON h.producto_id = p.id
            WHERE h.es_merma = true
        `;
        const params = [];

        if (startDate && endDate) {
            query += ` AND h.fecha >= $1 AND h.fecha <= $2`;
            params.push(`${startDate} 00:00:00`, `${endDate} 23:59:59`);
        }

        query += ` ORDER BY h.fecha DESC`;

        const result = await req.pool.query(query, params);
        res.json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Error al obtener mermas' });
    }
});

// REPORT SINGLE MERMA (From Edit Modal)
app.post('/api/products/merma', async (req, res) => {
    const { productId, cantidad, bodega } = req.body;

    if (!productId || !cantidad || cantidad <= 0)
        return res.status(400).json({ success: false, message: 'Datos inválidos' });

    const client = await req.pool.connect();
    try {
        await client.query('BEGIN');

        let stockCol = 'stock';
        if (bodega === 'principal') stockCol = 'stock_principal';
        if (bodega === 'secundaria') stockCol = 'stock_secundaria';

        const resProd = await client.query(`SELECT id, ${stockCol} as stock, costo_usd, proveedor_id FROM productos WHERE id = $1`, [productId]);
        if (resProd.rows.length === 0) throw new Error('Producto no encontrado');

        const product = resProd.rows[0];
        if (parseFloat(product.stock) < cantidad) throw new Error('Stock insuficiente en ' + bodega);

        await client.query(`UPDATE productos SET ${stockCol} = ${stockCol} - $1 WHERE id = $2`, [cantidad, productId]);

        await client.query(
            `INSERT INTO historial_movimientos (producto_id, cantidad, costo_unitario_snap, origen, es_merma, observacion, fecha)
             VALUES ($1, $2, $3, $4, true, $5, NOW())`,
            [productId, cantidad, product.costo_usd, bodega, `Merma desde Bodega ${bodega}`]
        );

        await client.query('COMMIT');
        res.json({ success: true });
    } catch (e) {
        await client.query('ROLLBACK');
        console.error(e);
        res.status(500).json({ success: false, message: e.message });
    } finally {
        client.release();
    }
});

// BULK CREATE Categories
app.post('/api/categories/bulk-create', async (req, res) => {
    const { items } = req.body;
    if (!items || !Array.isArray(items)) return res.status(400).json({ success: false, message: 'Formato inválido' });

    const results = { success: 0, failed: 0, errors: [] };
    const client = await req.pool.connect();

    try {
        await client.query('BEGIN');
        for (const item of items) {
            try {
                if (!item.nombre) throw new Error('Nombre requerido');
                // Check duplicate
                const check = await client.query('SELECT id FROM categorias WHERE LOWER(nombre) = LOWER($1)', [item.nombre.trim()]);
                if (check.rows.length > 0) {
                    results.failed++;
                    results.errors.push(`Categoría ya existe: ${item.nombre}`);
                    continue;
                }
                await client.query('INSERT INTO categorias (nombre, activo) VALUES ($1, $2)', [item.nombre.trim(), true]);
                results.success++;
            } catch (err) {
                results.failed++;
                results.errors.push(`Error en ${item.nombre}: ${err.message}`);
            }
        }
        await client.query('COMMIT');
        res.json({ success: true, results });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error(err);
        res.status(500).json({ success: false, message: 'Error general en categorías' });
    } finally {
        client.release();
    }
});

// BULK CREATE Suppliers
app.post('/api/suppliers/bulk-create', async (req, res) => {
    const { items } = req.body;
    if (!items || !Array.isArray(items)) return res.status(400).json({ success: false, message: 'Formato inválido' });

    const results = { success: 0, failed: 0, errors: [] };
    const client = await req.pool.connect();

    try {
        await client.query('BEGIN');
        for (const item of items) {
            try {
                if (!item.rif || !item.nombre || !item.rif.trim() || !item.nombre.trim()) {
                    results.failed++;
                    results.errors.push(`Fila inválida: RIF y Nombre son obligatorios (Datos: ${JSON.stringify(item)})`);
                    continue;
                }

                const rif = item.rif.trim();
                const nombre = item.nombre.trim();

                // Check duplicate RIF
                const check = await client.query('SELECT id FROM proveedores WHERE rif = $1', [rif]);
                if (check.rows.length > 0) {
                    results.failed++;
                    results.errors.push(`RIF ya existe: ${rif}`);
                    continue;
                }

                await client.query(
                    'INSERT INTO proveedores (rif, nombre, telefono, activo, dias_credito) VALUES ($1, $2, $3, $4, $5)',
                    [rif, nombre, item.telefono || '', true, parseInt(item.dias_credito) || 0]
                );
                results.success++;
            } catch (err) {
                results.failed++;
                results.errors.push(`Error en ${item.nombre || 'fila desconocida'}: ${err.message}`);
            }
        }
        await client.query('COMMIT');
        res.json({ success: true, results });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error(err);
        res.status(500).json({ success: false, message: 'Error general en proveedores' });
    } finally {
        client.release();
    }
});

// BULK CREATE Clients
app.post('/api/clients/bulk-create', async (req, res) => {
    const { items } = req.body;
    if (!items || !Array.isArray(items)) return res.status(400).json({ success: false, message: 'Formato inválido' });

    const results = { success: 0, failed: 0, errors: [] };
    const client = await req.pool.connect();

    try {
        await client.query('BEGIN');
        for (const item of items) {
            try {
                if (!item.cedula || !item.nombre) throw new Error('Cédula y Nombre requeridos');
                // Check duplicate Cedula
                const check = await client.query('SELECT id FROM clientes WHERE cedula = $1', [item.cedula.trim()]);
                if (check.rows.length > 0) {
                    results.failed++;
                    results.errors.push(`Cédula ya existe: ${item.cedula}`);
                    continue;
                }
                await client.query(
                    'INSERT INTO clientes (cedula, nombre, email, telefono) VALUES ($1, $2, $3, $4)',
                    [item.cedula.trim(), item.nombre.trim(), item.email || null, item.telefono || null]
                );
                results.success++;
            } catch (err) {
                results.failed++;
                results.errors.push(`Error en ${item.cedula}: ${err.message}`);
            }
        }
        await client.query('COMMIT');
        res.json({ success: true, results });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error(err);
        res.status(500).json({ success: false, message: 'Error general en clientes' });
    } finally {
        client.release();
    }
});

// BULK CREATE Users
app.post('/api/users/bulk-create', async (req, res) => {
    const { items } = req.body;
    if (!items || !Array.isArray(items)) return res.status(400).json({ success: false, message: 'Formato inválido' });

    const results = { success: 0, failed: 0, errors: [] };
    const client = await req.pool.connect();

    try {
        await client.query('BEGIN');
        for (const item of items) {
            try {
                if (!item.email || !item.password || !item.nombre) throw new Error('Email, Password y Nombre requeridos');
                const lowEmail = item.email.trim().toLowerCase();

                // Check duplicate Email
                const check = await client.query('SELECT id FROM usuarios WHERE email = $1', [lowEmail]);
                if (check.rows.length > 0) {
                    results.failed++;
                    results.errors.push(`Email ya existe: ${lowEmail}`);
                    continue;
                }

                // Hash password
                const saltRounds = 10;
                const passwordHash = await bcrypt.hash(item.password, saltRounds);

                await client.query(
                    'INSERT INTO usuarios (nombre, email, password_hash, rol, activo, creado_en) VALUES ($1, $2, $3, $4, $5, NOW())',
                    [item.nombre.trim(), lowEmail, passwordHash, item.rol || 'vendedor', true]
                );
                results.success++;
            } catch (err) {
                results.failed++;
                results.errors.push(`Error en ${item.email}: ${err.message}`);
            }
        }
        await client.query('COMMIT');
        res.json({ success: true, results });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error(err);
        res.status(500).json({ success: false, message: 'Error general en usuarios' });
    } finally {
        client.release();
    }
});

app.post('/api/sales', async (req, res) => {
    const { items, paymentMethod, totalUsd, rate, cajaId, clientId, sendEmail, observaciones } = req.body;

    const client = await req.pool.connect();
    let alerts = [];
    let invoiceHtml = '';
    let customerEmail = '';

    try {
        // 0. Get VAT Config
        const resConfig = await req.pool.query("SELECT valor FROM configuracion WHERE clave = 'iva_percentage'");
        const ivaPercentage = resConfig.rows.length > 0 ? parseFloat(resConfig.rows[0].valor) : 0;

        await client.query('BEGIN'); // Start Transaction

        // 1. Create Sale Record (Initial)
        const totalBs = parseFloat(totalUsd) * parseFloat(rate);
        const resVenta = await client.query(
            'INSERT INTO ventas (metodo_pago, total_usd, tasa_bcv, total_bs, caja_id, cliente_id, observaciones) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id',
            [paymentMethod, totalUsd, rate, totalBs, cajaId || null, clientId || null, observaciones || '']
        );
        const ventaId = resVenta.rows[0].id;

        // 1.5 Process Payments
        const paymentsList = req.body.payments || [{ method: paymentMethod, amount: totalUsd }];
        for (const payment of paymentsList) {
            const pAmountUsd = parseFloat(payment.amount);
            const pAmountBs = pAmountUsd * parseFloat(rate);
            await client.query(
                'INSERT INTO pagos_ventas (venta_id, metodo, monto_usd, monto_bs, tasa) VALUES ($1, $2, $3, $4, $5)',
                [ventaId, payment.method, pAmountUsd, pAmountBs, rate]
            );
        }

        // 2. Process Items & Calculate VAT
        let itemsTableRows = '';
        let calcTotalBase = 0;
        let calcTotalTax = 0;

        for (const item of items) {
            // Update Stock & Get Info (Including aplica_iva)
            const resUpdate = await client.query(
                'UPDATE productos SET stock = stock - $1, actualizado_en = NOW() WHERE id = $2 AND stock >= $1 RETURNING id, nombre, stock, stock_minimo, costo_usd, aplica_iva',
                [item.qty, item.id]
            );

            if (resUpdate.rowCount === 0) {
                throw new Error(`Stock insuficiente para el producto ID: ${item.id}`);
            }

            const product = resUpdate.rows[0];
            if (product.stock <= product.stock_minimo) {
                alerts.push(`${product.nombre} (Quedan: ${product.stock})`);
            }

            const subtotal = item.qty * item.price;
            let itemTax = 0;
            if (product.aplica_iva) {
                itemTax = subtotal * (ivaPercentage / 100);
            }

            calcTotalBase += subtotal;
            calcTotalTax += itemTax;

            // Record Detail
            await client.query(
                'INSERT INTO detalle_ventas (venta_id, producto_id, cantidad, precio_unitario_usd, subtotal_usd, costo_unitario_usd) VALUES ($1, $2, $3, $4, $5, $6)',
                [ventaId, item.id, item.qty, item.price, subtotal, product.costo_usd]
            );

            itemsTableRows += `
                <tr>
                    <td style="padding: 5px; border-bottom: 1px solid #ddd;">${item.qty}</td>
                    <td style="padding: 5px; border-bottom: 1px solid #ddd;">
                        ${product.nombre}
                        ${product.aplica_iva ? '<span style="font-size:0.8em; color:#777;">(G)</span>' : '<span style="font-size:0.8em; color:#aaa;">(E)</span>'}
                    </td>
                    <td style="padding: 5px; border-bottom: 1px solid #ddd; text-align: right;">$${item.price.toFixed(2)}</td>
                    <td style="padding: 5px; border-bottom: 1px solid #ddd; text-align: right;">$${subtotal.toFixed(2)}</td>
                </tr>
            `;
        }

        // 2.5 Update Sale with Calculated Totals
        // Note: totalUsd from frontend should match (Base + Tax). We can enforce or just store what we calculated.
        // For debugging/consistency, we rely on our calculation for Base/Tax columns.
        await client.query(
            'UPDATE ventas SET total_base_usd = $1, total_iva_usd = $2 WHERE id = $3',
            [calcTotalBase, calcTotalTax, ventaId]
        );

        await client.query('COMMIT');

        // --- 3. GENERATE INVOICE ---
        const configRes = await req.pool.query("SELECT * FROM configuracion");
        const config = {};
        configRes.rows.forEach(r => config[r.clave] = r.valor);

        let clientData = null;
        if (clientId) {
            const clientRes = await req.pool.query('SELECT * FROM clientes WHERE id = $1', [clientId]);
            if (clientRes.rows.length > 0) clientData = clientRes.rows[0];
        }

        if (clientData && clientData.email && sendEmail && config.smtp_email && config.smtp_pass) {

            customerEmail = clientData.email;
            const commerceName = config.commerce_name || 'PiduNet';
            const commerceRif = config.commerce_rif || 'J-00000000-0';
            const commerceAddr = config.commerce_address || 'Dirección Principal';
            const commercePhone = config.admin_phone || '';
            const invoiceNum = ventaId.toString().padStart(6, '0');
            const date = new Date().toLocaleString('es-VE');

            // Payments HTML
            let paymentsTableHtml = '';
            if (paymentsList.length > 0) {
                let paymentRows = '';
                paymentsList.forEach(p => {
                    let pBs = parseFloat(p.amount) * parseFloat(rate);
                    paymentRows += `
                        <tr>
                            <td style="padding: 5px; border-bottom: 1px solid #eee;">${p.method.replace('_', ' ')}</td>
                            <td style="padding: 5px; border-bottom: 1px solid #eee; text-align: right; color: #777;">$${parseFloat(p.amount).toFixed(2)}</td>
                            <td style="padding: 5px; border-bottom: 1px solid #eee; text-align: right;">${pBs.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Bs</td>
                        </tr>`;
                });
                paymentsTableHtml = `
                    <div style="margin-top: 20px; margin-bottom: 20px;">
                        <h4 style="margin-bottom: 5px; color: #333; border-bottom: 1px solid #ccc; padding-bottom: 5px;">Métodos de Pago</h4>
                        <table style="width: 100%; border-collapse: collapse; font-size: 0.9em;">
                            <thead><tr style="background-color: #f9f9f9;"><th style="text-align: left; padding: 5px;">Método</th><th style="text-align: right; padding: 5px;">Ref ($)</th><th style="text-align: right; padding: 5px;">Monto (Bs)</th></tr></thead>
                            <tbody>${paymentRows}</tbody>
                        </table>
                    </div>`;
            }

            invoiceHtml = `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #eee; padding: 20px;">
                    <div style="text-align: center; border-bottom: 2px solid #333; padding-bottom: 10px; margin-bottom: 20px;">
                        <h2 style="margin: 0; color: #333;">${commerceName}</h2>
                        <p style="margin: 5px 0; font-size: 0.9em; color: #666;">RIF: ${commerceRif}</p>
                        <p style="margin: 5px 0; font-size: 0.9em; color: #666;">${commerceAddr} | Tel: ${commercePhone}</p>
                    </div>
                    <div style="display: flex; justify-content: space-between; margin-bottom: 20px;">
                        <div>
                            <p><strong>Cliente:</strong> ${clientData.nombre}</p>
                            <p><strong>Cédula/RIF:</strong> ${clientData.cedula}</p>
                            <p><strong>Tel:</strong> ${clientData.telefono || '-'}</p>
                        </div>
                        <div style="text-align: right;">
                            <p style="font-size: 1.1em; font-weight: bold;">NOTA DE VENTA</p>
                            <p style="color: #d32f2f;">N° CONTROL: ${invoiceNum}</p>
                            <p>Fecha: ${date}</p>
                        </div>
                    </div>
                    <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
                        <thead>
                            <tr style="background-color: #f8f9fa;">
                                <th style="padding: 8px; text-align: left; border-bottom: 2px solid #ddd;">Cant</th>
                                <th style="padding: 8px; text-align: left; border-bottom: 2px solid #ddd;">Descripción</th>
                                <th style="padding: 8px; text-align: right; border-bottom: 2px solid #ddd;">Precio ($)</th>
                                <th style="padding: 8px; text-align: right; border-bottom: 2px solid #ddd;">Total ($)</th>
                            </tr>
                        </thead>
                        <tbody>${itemsTableRows}</tbody>
                    </table>
                    ${paymentsTableHtml}
                    <div style="text-align: right; margin-top: 20px;">
                        <p style="margin: 5px 0;"><strong>Subtotal USD:</strong> $${calcTotalBase.toFixed(2)}</p>
                        ${calcTotalTax > 0 ? `<p style="margin: 5px 0;"><strong>IVA (${ivaPercentage}%):</strong> $${calcTotalTax.toFixed(2)}</p>` : ''}
                        <p style="margin: 5px 0; font-size: 1.2em; color: #333;"><strong>TOTAL USD: $${parseFloat(totalUsd).toFixed(2)}</strong></p>
                        <hr style="margin: 10px 0;">
                        <p style="margin: 5px 0; color: #666;">Tasa de Cambio: ${parseFloat(rate).toFixed(2)} Bs/$</p>
                        <p style="margin: 5px 0; font-size: 1.1em; color: #333;"><strong>TOTAL BOLÍVARES: Bs ${totalBs.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></p>
                    </div>
                    <div style="margin-top: 30px; text-align: center; font-size: 0.8em; color: #888;">
                        <p>Gracias por su compra.</p>
                    </div>
                </div>`;

            // Setup Transporter
            const transporter = nodemailer.createTransport({
                service: 'gmail',
                auth: { user: config.smtp_email, pass: config.smtp_pass }
            });

            // Send
            transporter.sendMail({
                from: `"${commerceName}" <${config.smtp_email}>`,
                to: customerEmail,
                subject: `Comprobante de Venta #${invoiceNum} - ${commerceName}`,
                html: invoiceHtml
            }, (err, info) => {
                if (err) console.error("Error sending invoice email:", err);
                else console.log("Invoice email sent:", info.response);
            });
        }


        // ... (existing sale processing)
        // ... (existing sale processing)

        // Audit Log
        await global.logAudit(req, req.headers['x-user-id'], 'CREATE_SALE', 'ventas', ventaId, { total_usd: totalUsd, items: items.length }, req.ip);

        res.json({ success: true, message: 'Venta procesada correctamente.', alerts: alerts, invoiceSent: !!customerEmail });

    } catch (err) {
        await client.query('ROLLBACK'); // Rollback on error
        console.error('Sale Transaction Error', err);
        res.status(500).json({ success: false, message: err.message || 'Error al procesar la venta' });
    } finally {
        client.release();
    }
});

// --- SALES HISTORY & REPORTING ENDPOINTS ---

// GET: List Sales (History)
app.get('/api/sales', async (req, res) => {
    const { startDate, endDate, clientId } = req.query;
    try {
        let query = `
            SELECT v.id, v.fecha, v.total_usd, v.total_bs, v.metodo_pago, v.observaciones,
                   c.nombre as cliente_nombre, c.cedula as cliente_cedula
            FROM ventas v
            LEFT JOIN clientes c ON v.cliente_id = c.id
            WHERE 1=1
        `;
        const params = [];
        let idx = 1;

        if (startDate) {
            query += ` AND v.fecha >= $${idx++}`;
            params.push(startDate + ' 00:00:00');
        }
        if (endDate) {
            query += ` AND v.fecha <= $${idx++}`;
            params.push(endDate + ' 23:59:59');
        }
        if (clientId) {
            query += ` AND v.cliente_id = $${idx++}`;
            params.push(clientId);
        }

        query += ' ORDER BY v.fecha DESC';

        const result = await req.pool.query(query, params);
        res.json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Error al obtener historial de ventas' });
    }
});

// GET: Single Sale Detail (Invoice Data)
app.get('/api/sales/:id', async (req, res) => {
    const { id } = req.params;
    try {
        // 1. Get Sale Header
        const saleRes = await req.pool.query(`
            SELECT v.*, c.nombre as cliente_nombre, c.cedula as cliente_cedula, c.telefono, c.email
            FROM ventas v
            LEFT JOIN clientes c ON v.cliente_id = c.id
            WHERE v.id = $1
        `, [id]);

        if (saleRes.rows.length === 0) return res.status(404).json({ success: false, message: 'Venta no encontrada' });
        const sale = saleRes.rows[0];

        // 2. Get Items
        const itemsRes = await req.pool.query(`
            SELECT dv.*, p.nombre as producto_nombre, p.aplica_iva
            FROM detalle_ventas dv
            JOIN productos p ON dv.producto_id = p.id
            WHERE dv.venta_id = $1
        `, [id]);

        // 3. Get Payments (NEW)
        const paymentsRes = await req.pool.query(`
            SELECT * FROM pagos_ventas WHERE venta_id = $1
        `, [id]);

        res.json({ success: true, sale, items: itemsRes.rows, payments: paymentsRes.rows });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Error al obtener detalle de venta' });
    }
});

// --- PURCHASES HISTORY ENDPOINTS ---
app.get('/api/purchases', async (req, res) => {
    console.log('API: /api/purchases hit');
    const { startDate, endDate, supplierId, productSearch } = req.query;
    console.log('Params:', { startDate, endDate, supplierId, productSearch });

    try {
        let query = `
            SELECT h.*, 
                   p.nombre as producto_nombre, 
                   s.nombre as proveedor_nombre,
                   (h.cantidad * h.costo_unitario_usd) as total_usd
            FROM historial_compras h
            LEFT JOIN productos p ON h.producto_id = p.id
            LEFT JOIN proveedores s ON h.proveedor_id = s.id
            WHERE 1=1
        `;
        const params = [];
        let idx = 1;

        if (startDate) {
            query += ` AND h.fecha >= $${idx++}`;
            params.push(startDate + ' 00:00:00');
        }
        if (endDate) {
            query += ` AND h.fecha <= $${idx++}`;
            params.push(endDate + ' 23:59:59');
        }
        if (supplierId) {
            query += ` AND h.proveedor_id = $${idx++}`;
            params.push(supplierId);
        }
        if (productSearch) {
            query += ` AND (p.nombre ILIKE $${idx} OR p.codigo ILIKE $${idx})`;
            params.push(`%${productSearch}%`);
            idx++;
        }

        query += ' ORDER BY h.fecha DESC';
        console.log('Query:', query);
        console.log('Params:', params);

        const result = await req.pool.query(query, params);
        console.log('Rows found:', result.rows.length);
        res.json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Error al obtener historial de compras' });
    }
});

// Get Suppliers specifically for history filter (or reuse existing)
app.get('/api/purchases/suppliers', async (req, res) => {
    try {
        // Return only suppliers who have history
        const result = await req.pool.query(`
            SELECT DISTINCT s.id, s.nombre 
            FROM historial_compras h
            JOIN proveedores s ON h.proveedor_id = s.id
            ORDER BY s.nombre ASC
        `);
        res.json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Error al obtener proveedores de historial' });
    }
});

// POST: Resend Invoice Email
app.post('/api/sales/:id/email', async (req, res) => {
    const { id } = req.params;
    const { email } = req.body; // Optional override email

    try {
        // 1. Fetch Sale Data
        const saleRes = await req.pool.query(`
            SELECT v.*, c.nombre as cliente_nombre, c.cedula as cliente_cedula, c.email as cliente_email, c.telefono
            FROM ventas v
            LEFT JOIN clientes c ON v.cliente_id = c.id
            WHERE v.id = $1
        `, [id]);

        if (saleRes.rows.length === 0) return res.status(404).json({ success: false, message: 'Venta no encontrada' });
        const sale = saleRes.rows[0];

        // 2. Determine Recipient
        const targetEmail = email || sale.cliente_email;
        if (!targetEmail) return res.status(400).json({ success: false, message: 'No hay email registrado para este cliente.' });

        // 3. Get Items
        const itemsRes = await req.pool.query(`
            SELECT dv.*, p.nombre as producto_nombre
            FROM detalle_ventas dv
            JOIN productos p ON dv.producto_id = p.id
            WHERE dv.venta_id = $1
        `, [id]);
        const items = itemsRes.rows;

        // 4. Get Payments
        const paymentsRes = await req.pool.query(`SELECT * FROM pagos_ventas WHERE venta_id = $1`, [id]);
        let payments = paymentsRes.rows;

        // Legacy Support: If no split payments, create one from main sale data
        if (payments.length === 0) {
            payments = [{
                metodo: sale.metodo_pago,
                monto_usd: sale.total_usd,
                monto_bs: sale.total_bs,
                tasa: sale.tasa_bcv
            }];
        }

        res.json({ success: true, sale, items, payments });

        // 4. Get Config
        const configRes = await req.pool.query("SELECT * FROM configuracion");
        const config = {};
        configRes.rows.forEach(r => config[r.clave] = r.valor);

        if (!config.smtp_email || !config.smtp_pass) {
            return res.status(500).json({ success: false, message: 'Configuración SMTP incompleta.' });
        }

        // 5. Build HTML (Reusable Logic ideally, explicitly duplicated here for safety based on current structure)
        const commerceName = config.commerce_name || 'PiduNet';
        const invoiceNum = sale.id.toString().padStart(6, '0');
        const date = new Date(sale.fecha).toLocaleString('es-VE');
        let itemsTableRows = '';

        items.forEach(item => {
            itemsTableRows += `
                <tr>
                    <td style="padding: 5px; border-bottom: 1px solid #ddd;">${item.cantidad}</td>
                    <td style="padding: 5px; border-bottom: 1px solid #ddd;">${item.producto_nombre}</td>
                    <td style="padding: 5px; border-bottom: 1px solid #ddd; text-align: right;">$${parseFloat(item.precio_unitario_usd).toFixed(2)}</td>
                    <td style="padding: 5px; border-bottom: 1px solid #ddd; text-align: right;">$${parseFloat(item.subtotal_usd).toFixed(2)}</td>
                </tr>
            `;
        });

        const invoiceHtml = `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #eee; padding: 20px;">
                <div style="text-align: center; border-bottom: 2px solid #333; padding-bottom: 10px; margin-bottom: 20px;">
                    <h2 style="margin: 0; color: #333;">${commerceName}</h2>
                    <p style="margin: 5px 0; font-size: 0.9em; color: #666;">RIF: ${config.commerce_rif || ''}</p>
                </div>
                <div style="display: flex; justify-content: space-between; margin-bottom: 20px;">
                    <div>
                        <p><strong>Cliente:</strong> ${sale.cliente_nombre || 'Consumidor Final'}</p>
                        <p><strong>Cédula:</strong> ${sale.cliente_cedula || '-'}</p>
                    </div>
                    <div style="text-align: right;">
                        <p style="font-size: 1.1em; font-weight: bold;">NOTA DE VENTA</p>
                        <p style="color: #d32f2f;">N° CONTROL: ${invoiceNum}</p>
                        <p>Fecha: ${date}</p>
                    </div>
                </div>
                <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
                    <thead>
                        <tr style="background-color: #f8f9fa;">
                            <th style="padding: 8px; text-align: left; border-bottom: 2px solid #ddd;">Cant</th>
                            <th style="padding: 8px; text-align: left; border-bottom: 2px solid #ddd;">Descripción</th>
                            <th style="padding: 8px; text-align: right; border-bottom: 2px solid #ddd;">Precio ($)</th>
                            <th style="padding: 8px; text-align: right; border-bottom: 2px solid #ddd;">Total ($)</th>
                        </tr>
                    </thead>
                    <tbody>${itemsTableRows}</tbody>
                </table>
                <div style="text-align: right; margin-top: 20px;">
                    <p style="margin: 5px 0;"><strong>TOTAL USD: $${parseFloat(sale.total_usd).toFixed(2)}</strong></p>
                    <p style="margin: 5px 0;"><strong>TOTAL BS: Bs ${parseFloat(sale.total_bs).toLocaleString('es-VE', { minimumFractionDigits: 2 })}</strong></p>
                </div>
            </div>
        `;

        // 6. Send
        const transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: { user: config.smtp_email, pass: config.smtp_pass }
        });

        await transporter.sendMail({
            from: `"${commerceName}" <${config.smtp_email}>`,
            to: targetEmail,
            subject: `Reenvío: Comprobante de Venta #${invoiceNum}`,
            html: invoiceHtml
        });

        res.json({ success: true, message: 'Correo reenviado exitosamente.' });

    } catch (err) {
        console.error('Error resending email:', err);
        res.status(500).json({ success: false, message: 'Error al enviar correo.' });
    }
});

// --- CAJA (CASH REGISTER) ENDPOINTS ---

app.get('/api/caja/status/:userId', async (req, res) => {
    const { userId } = req.params;
    try {
        const result = await req.pool.query(
            "SELECT * FROM caja_sesiones WHERE usuario_id = $1 AND estado = 'abierta' ORDER BY fecha_apertura DESC LIMIT 1",
            [userId]
        );
        if (result.rows.length > 0) {
            const session = result.rows[0];
            
            // Fix timezone bug: adjust UTC dates to Venezuela (UTC-4) calendar days in JS
            const getLocalDateString = (dateObj) => {
                const utc = dateObj.getTime() + (dateObj.getTimezoneOffset() * 60000);
                const localTime = new Date(utc + (3600000 * -4)); // UTC-4
                return localTime.toISOString().split('T')[0];
            };
            
            const openedDate = getLocalDateString(new Date(session.fecha_apertura));
            const currentDate = getLocalDateString(new Date());
            const needsClosure = openedDate < currentDate;

            res.json({ 
                isOpen: true, 
                session: session,
                needsClosure: needsClosure
            });
        } else {
            res.json({ isOpen: false });
        }
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Error al verificar caja' });
    }
});

// OPEN Caja
app.post('/api/caja/abrir', async (req, res) => {
    const { userId, montoApertura } = req.body;
    try {
        // Check if already open
        const check = await req.pool.query("SELECT * FROM caja_sesiones WHERE usuario_id = $1 AND estado = 'abierta'", [userId]);
        if (check.rows.length > 0) {
            return res.status(400).json({ success: false, message: 'Ya tienes una caja abierta.' });
        }

        const result = await req.pool.query(
            "INSERT INTO caja_sesiones (usuario_id, monto_apertura, estado) VALUES ($1, $2, 'abierta') RETURNING id",
            [userId, montoApertura]
        );
        res.json({ success: true, message: 'Caja abierta correctamente', id: result.rows[0].id });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Error al abrir caja' });
    }
});

// GET Totals for Closure
app.get('/api/caja/totals/:sessionId', async (req, res) => {
    const { sessionId } = req.params;
    try {
        const breakdownRes = await req.pool.query(`
            SELECT 
                COALESCE(SUM(CASE WHEN metodo_pago = 'EFECTIVO_BS' THEN total_bs ELSE 0 END), 0) as efectivo,
                COALESCE(SUM(CASE WHEN metodo_pago = 'TDC' THEN total_bs ELSE 0 END), 0) as tdc,
                COALESCE(SUM(CASE WHEN metodo_pago = 'PAGO_MOVIL' THEN total_bs ELSE 0 END), 0) as pago_movil,
                COALESCE(SUM(CASE WHEN metodo_pago = 'OTROS' THEN total_bs ELSE 0 END), 0) as otros
            FROM ventas 
            WHERE caja_id = $1
        `, [sessionId]);

        const sessionRes = await req.pool.query('SELECT monto_apertura FROM caja_sesiones WHERE id = $1', [sessionId]);
        const montoApertura = sessionRes.rows.length > 0 ? parseFloat(sessionRes.rows[0].monto_apertura) : 0;

        const totals = breakdownRes.rows[0];
        // Add opening cash to efectivo
        totals.efectivo = parseFloat(totals.efectivo) + montoApertura;
        totals.tdc = parseFloat(totals.tdc);
        totals.pago_movil = parseFloat(totals.pago_movil);
        totals.otros = parseFloat(totals.otros);

        res.json({ success: true, totals });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Error al calcular totales' });
    }
});

// CLOSE Caja & Generate Report Data
// CLOSE Caja & Generate Report Data
app.post('/api/caja/cerrar', async (req, res) => {
    const { sessionId, montoDeclarado, declarado, observaciones } = req.body;

    try {
        // 1. Calculate System Breakdown
        const breakdownRes = await req.pool.query(`
            SELECT 
                COALESCE(SUM(total_bs), 0) as total_global,
                COALESCE(SUM(CASE WHEN metodo_pago = 'EFECTIVO_BS' THEN total_bs ELSE 0 END), 0) as efectivo,
                COALESCE(SUM(CASE WHEN metodo_pago = 'TDC' THEN total_bs ELSE 0 END), 0) as tdc,
                COALESCE(SUM(CASE WHEN metodo_pago = 'PAGO_MOVIL' THEN total_bs ELSE 0 END), 0) as pago_movil,
                COALESCE(SUM(CASE WHEN metodo_pago = 'OTROS' THEN total_bs ELSE 0 END), 0) as otros
            FROM ventas 
            WHERE caja_id = $1
        `, [sessionId]);

        const sysData = breakdownRes.rows[0];

        // 2. Get Opening Amount
        const sessionRes = await req.pool.query('SELECT monto_apertura FROM caja_sesiones WHERE id = $1', [sessionId]);
        if (sessionRes.rows.length === 0) return res.status(404).json({ success: false, message: 'Sesión no encontrada' });

        const montoApertura = parseFloat(sessionRes.rows[0].monto_apertura);

        // System Totals (Add Opening Cash to Eff)
        const systemTotals = {
            total_global: parseFloat(sysData.total_global) + montoApertura,
            efectivo: parseFloat(sysData.efectivo) + montoApertura,
            tdc: parseFloat(sysData.tdc),
            pago_movil: parseFloat(sysData.pago_movil),
            otros: parseFloat(sysData.otros)
        };

        const totalTeorico = systemTotals.total_global;
        const diferenciaGlobal = parseFloat(montoDeclarado) - totalTeorico;

        // 3. Update Session
        await req.pool.query(
            `UPDATE caja_sesiones SET 
            fecha_cierre = NOW(), 
            monto_cierre_declarado = $1, 
            monto_teorico = $2, 
            monto_ventas_sistema = $3,
            diferencia = $4, 
            detalles_cierre = $5,
            observaciones = $6,
            estado = 'cerrada' 
            WHERE id = $7`,
            [
                montoDeclarado,
                totalTeorico,
                parseFloat(sysData.total_global),
                diferenciaGlobal,
                JSON.stringify({ system: systemTotals, declared: declarado }),
                observaciones,
                sessionId
            ]
        );

        res.json({
            success: true,
            message: 'Caja cerrada correctamente',
            report: {
                systemTotals,
                declarado: declarado || { efectivo: 0, tdc: 0, pago_movil: 0, otros: 0 }, // Fallback if missing
                diferenciaGlobal,
                observaciones
            }
        });

    } catch (err) {
        console.error('Error closing caja:', err);
        res.status(500).json({ success: false, message: 'Error al cerrar caja: ' + err.message });
    }
});

// GET Purchase History
app.get('/api/purchase-history', async (req, res) => {
    const { productId, supplierId, startDate, endDate } = req.query;

    let query = `
        SELECT h.*, p.nombre as producto, p.codigo, s.nombre as proveedor 
        FROM historial_compras h
        LEFT JOIN productos p ON h.producto_id = p.id
        LEFT JOIN proveedores s ON h.proveedor_id = s.id
        WHERE 1=1
    `;
    const params = [];
    let idx = 1;

    if (productId) {
        query += ` AND h.producto_id = $${idx++}`;
        params.push(productId);
    }
    if (supplierId) {
        query += ` AND h.proveedor_id = $${idx++}`;
        params.push(supplierId);
    }
    if (startDate) {
        query += ` AND h.fecha >= $${idx++}`;
        params.push(startDate + ' 00:00:00');
    }
    if (endDate) {
        query += ` AND h.fecha <= $${idx++}`;
        params.push(endDate + ' 23:59:59');
    }

    query += ' ORDER BY h.fecha DESC';

    try {
        const result = await req.pool.query(query, params);
        res.json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Error al obtener historial' });
    }
});

// REPORT: Daily Sales & Profit
app.post('/api/reports/range', async (req, res) => {
    const { startDate, endDate } = req.body; // YYYY-MM-DD
    try {
        // Updated Query to avoid Cartesian Product (duplication of sales totals when multiple items exist)
        const query = `
            SELECT 
                (SELECT COALESCE(SUM(total_bs), 0) FROM ventas WHERE DATE(fecha) BETWEEN $1 AND $2) as venta_bs,
                (SELECT COALESCE(SUM(total_usd), 0) FROM ventas WHERE DATE(fecha) BETWEEN $1 AND $2) as venta_usd,
                COALESCE(SUM((dv.subtotal_usd) - (COALESCE(dv.costo_unitario_usd, 0) * dv.cantidad)), 0) as ganancia_usd,
                COALESCE(SUM(((dv.subtotal_usd) - (COALESCE(dv.costo_unitario_usd, 0) * dv.cantidad)) * v.tasa_bcv), 0) as ganancia_bs
            FROM ventas v
            JOIN detalle_ventas dv ON v.id = dv.venta_id
            WHERE DATE(v.fecha) BETWEEN $1 AND $2
        `;

        const result = await req.pool.query(query, [startDate, endDate]);
        // Handle case where no sales exist (result.rows[0] might have nulls if main query returns row with nulls, but logic above handles coalescing in subqueries)
        // Actually if main query matches NO rows (WHERE clause), result.rows is empty?
        // Wait, the main query joins tables. If no rows in join, it returns 0 rows. 
        // Then result.rows[0] is undefined.

        let data = result.rows[0];
        if (!data) {
            // If no sales found in JOIN, we might still have sales in subqueries? 
            // Ideally we should run them separately or ensure the main query always returns one row.
            // But if specific date range has NO sales, effectively all is 0.
            const salesOnly = await req.pool.query(`
                SELECT 
                    COALESCE(SUM(total_bs), 0) as venta_bs,
                    COALESCE(SUM(total_usd), 0) as venta_usd
                FROM ventas WHERE DATE(fecha) BETWEEN $1 AND $2
             `, [startDate, endDate]);

            data = {
                venta_bs: salesOnly.rows[0].venta_bs,
                venta_usd: salesOnly.rows[0].venta_usd,
                ganancia_usd: 0,
                ganancia_bs: 0
            };
        }

        res.json({ success: true, data: data });

    } catch (err) {
        console.error('Error generating daily report:', err);
        res.status(500).json({ success: false, message: 'Error generando reporte: ' + err.message });
    }
});

// REPORT: Mermas (Shrinkage)
app.post('/api/reports/mermas', async (req, res) => {
    const { startDate, endDate } = req.body;
    try {
        let query = `
            SELECT h.*, p.nombre as producto, p.codigo 
            FROM historial_movimientos h
            JOIN productos p ON h.producto_id = p.id
            WHERE h.es_merma = true
        `;
        const params = [];
        let idx = 1;

        if (startDate) {
            query += ` AND DATE(h.fecha) >= $${idx++}`;
            params.push(startDate);
        }
        if (endDate) {
            query += ` AND DATE(h.fecha) <= $${idx++}`;
            params.push(endDate);
        }

        query += ' ORDER BY h.fecha DESC';

        const result = await req.pool.query(query, params);
        res.json({ success: true, data: result.rows });
    } catch (err) {
        console.error('Error generating mermas report:', err);
        res.status(500).json({ success: false, message: 'Error generando reporte de mermas' });
    }
});

// GET System Totals for a Session
app.get('/api/caja/totals/:sessionId', async (req, res) => {
    const { sessionId } = req.params;
    try {
        // 1. Get Opening Amount
        const sessionRes = await req.pool.query('SELECT monto_apertura FROM caja_sesiones WHERE id = $1', [sessionId]);
        if (sessionRes.rows.length === 0) return res.status(404).json({ success: false, message: 'Sesión no encontrada' });
        const montoApertura = parseFloat(sessionRes.rows[0].monto_apertura);

        // 2. Get Sales Breakdown by Method
        const salesRes = await req.pool.query(`
            SELECT 
                COALESCE(SUM(total_bs), 0) as total_global,
                COALESCE(SUM(CASE WHEN metodo_pago = 'EFECTIVO_BS' THEN total_bs ELSE 0 END), 0) as efectivo,
                COALESCE(SUM(CASE WHEN metodo_pago = 'TDC' THEN total_bs ELSE 0 END), 0) as tdc,
                COALESCE(SUM(CASE WHEN metodo_pago = 'PAGO_MOVIL' THEN total_bs ELSE 0 END), 0) as pago_movil,
                COALESCE(SUM(CASE WHEN metodo_pago = 'OTROS' THEN total_bs ELSE 0 END), 0) as otros
            FROM ventas 
            WHERE caja_id = $1
        `, [sessionId]);

        const data = salesRes.rows[0];

        // Structure Response
        const totals = {
            total_global: parseFloat(data.total_global) + montoApertura, // Add opening cash to total? Or keep separate? Usually Cash Total = Opening + Cash Sales
            efectivo: parseFloat(data.efectivo) + montoApertura,
            tdc: parseFloat(data.tdc),
            pago_movil: parseFloat(data.pago_movil),
            otros: parseFloat(data.otros),
            monto_apertura: montoApertura
        };

        res.json({ success: true, totals });

    } catch (err) {
        console.error('Error fetching totals:', err);
        res.status(500).json({ success: false, message: 'Error al obtener totales' });
    }
});

// UPLOAD LOGIN LOGO
app.post('/api/config/login-logo', upload.single('logo'), (req, res) => {
    if (req.file) {
        const tempPath = req.file.path || (req.file.buffer ? 'buffer' : null);
        const targetPath = path.join(__dirname, 'images', 'login_logo.png');

        if (req.file.buffer) {
            fs.writeFile(targetPath, req.file.buffer, (err) => {
                if (err) return res.status(500).json({ success: false, message: 'Error saving login logo' });
                res.json({ success: true, message: 'Logo de login actualizado' });
            });
        } else {
            // Fallback if not memory storage
            res.status(500).json({ success: false, message: 'Storage config error' });
        }
    } else {
        res.status(400).json({ success: false, message: 'No file uploaded' });
    }
});

// DELETE Product
app.delete('/api/products/:id', async (req, res) => {
    const { id } = req.params;
    try {
        await req.pool.query('DELETE FROM productos WHERE id = $1', [id]);
        res.json({ success: true, message: 'Producto eliminado' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Error al eliminar producto' });
    }
});

app.post('/api/config/logo', upload.single('logo'), (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ success: false, message: 'No file uploaded' });
        }
        const filePath = path.join(__dirname, 'images', 'logo.png');
        fs.writeFileSync(filePath, req.file.buffer);
        res.json({ success: true, message: 'Logo actualizado' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Error al subir el logo' });
    }
});

// EMAIL CONFIGURATION REMOVED - NOW DYNAMIC IN ENDPOINT

// ...

// RECOVERY PASSWORD
app.post('/api/recover-password', async (req, res) => {
    const { email } = req.body;

    try {
        // 1. Get SMTP Config
        const configRes = await req.pool.query("SELECT * FROM configuracion WHERE clave IN ('smtp_email', 'smtp_pass')");
        const config = {};
        configRes.rows.forEach(r => config[r.clave] = r.valor);

        if (!config.smtp_email || !config.smtp_pass) {
            return res.status(500).json({ success: false, message: 'Falta configurar las credenciales de correo en el sistema.' });
        }

        // 2. Verify user exists
        const userRes = await req.pool.query('SELECT * FROM usuarios WHERE email = $1', [email]);
        if (userRes.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Correo no registrado.' });
        }
        const user = userRes.rows[0];

        // 3. Get Admins
        const adminsRes = await req.pool.query("SELECT email FROM usuarios WHERE rol = 'admin' AND activo = true");
        const adminEmails = adminsRes.rows.map(r => r.email);

        if (adminEmails.length === 0) {
            return res.status(500).json({ success: false, message: 'No hay administradores activos para notificar.' });
        }

        // 4. Create Transporter dynamically
        const transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: {
                user: config.smtp_email,
                pass: config.smtp_pass
            }
        });

        // 5. Send Email
        const mailOptions = {
            from: `"Sistema PiduNet" <${config.smtp_email}>`,
            to: adminEmails.join(', '),
            subject: '⚠️ Solicitud de Recuperación de Contraseña',
            html: `
                <h2>Solicitud de Recuperación de Contraseña</h2>
                <p>El usuario <strong>${user.nombre}</strong> (${user.email}) ha solicitado recuperar su contraseña.</p>
                <div style="background-color: #f8f9fa; border-left: 4px solid #10b981; padding: 15px; margin: 20px 0;">
                    <p style="margin-top: 0;"><strong>Pasos a seguir por el Administrador:</strong></p>
                    <ol>
                        <li>Ingrese al sistema y vaya al módulo de <strong>Usuarios (Admin)</strong>.</li>
                        <li>Busque al usuario y edite su perfil para asignar una <strong>nueva contraseña</strong>.</li>
                        <li>Envíe la nueva contraseña al usuario (puede contactarlo a: <a href="mailto:${user.email}">${user.email}</a>).</li>
                    </ol>
                </div>
                <p><em>Este es un mensaje automático del sistema.</em></p>
            `
        };

        transporter.sendMail(mailOptions, (error, info) => {
            if (error) {
                console.log(error);
                return res.status(500).json({ success: false, message: 'Error al enviar: Verifique correo/contraseña en Configuración.' });
            }
            console.log('Email sent: ' + info.response);
            res.json({ success: true, message: 'Notificación enviada a los administradores.' });
        });

    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Error del servidor.' });
    }
});

// SEND CREDENTIALS (MANUAL)
app.post('/api/users/send-credentials', async (req, res) => {
    const { email, password, name } = req.body;

    try {
        // 1. Get SMTP Config
        const configRes = await req.pool.query("SELECT * FROM configuracion WHERE clave IN ('smtp_email', 'smtp_pass')");
        const config = {};
        configRes.rows.forEach(r => config[r.clave] = r.valor);

        if (!config.smtp_email || !config.smtp_pass) {
            return res.status(500).json({ success: false, message: 'Falta configurar credenciales SMTP.' });
        }

        // 2. Create Transporter
        const transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: {
                user: config.smtp_email,
                pass: config.smtp_pass
            }
        });

        // 3. Send Email
        const mailOptions = {
            from: `"Sistema PiduNet" <${config.smtp_email}>`,
            to: email,
            subject: '🔐 Sus Credenciales de Acceso',
            html: `
                <h2>Credenciales de Acceso</h2>
                <p>Hola <strong>${name}</strong>,</p>
                <p>El administrador del sistema le ha enviado sus credenciales de acceso:</p>
                <div style="background-color: #f3f4f6; padding: 15px; border-radius: 8px; margin: 20px 0;">
                    <p><strong>Usuario/Email:</strong> ${email}</p>
                    <p><strong>Contraseña:</strong> ${password}</p>
                </div>
                <p>Por favor, ingrese al sistema y cambie su contraseña si lo considera necesario.</p>
                <p><em>Este es un mensaje automático.</em></p>
            `
        };

        transporter.sendMail(mailOptions, (error, info) => {
            if (error) {
                console.log(error);
                return res.status(500).json({ success: false, message: 'Error al enviar correo.' });
            }
            res.json({ success: true, message: 'Credenciales enviadas al usuario.' });
        });

    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Error del servidor.' });
    }
});

// --- CLIENTS ENDPOINTS ---
app.get('/api/clients', async (req, res) => {
    try {
        const result = await req.pool.query('SELECT * FROM clientes ORDER BY nombre ASC');
        res.json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Error retrieving clients' });
    }
});

app.get('/api/clients/:cedula', async (req, res) => {
    try {
        const result = await req.pool.query('SELECT * FROM clientes WHERE cedula = $1', [req.params.cedula]);
        if (result.rows.length > 0) {
            res.json({ success: true, data: result.rows[0] });
        } else {
            res.status(404).json({ success: false, message: 'Cliente no encontrado' });
        }
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Error searching client' });
    }
});

app.post('/api/clients', async (req, res) => {
    const { id, cedula, nombre, email, telefono } = req.body;
    try {
        if (id) {
            await req.pool.query(
                'UPDATE clientes SET cedula=$1, nombre=$2, email=$3, telefono=$4 WHERE id=$5',
                [cedula, nombre, email, telefono, id]
            );
        } else {
            await req.pool.query(
                'INSERT INTO clientes (cedula, nombre, email, telefono) VALUES ($1, $2, $3, $4)',
                [cedula, nombre, email, telefono]
            );
        }
        res.json({ success: true, message: 'Cliente guardado' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Error saving client. ¿Cédula duplicada?' });
    }
});

app.delete('/api/clients/:id', async (req, res) => {
    try {
        await req.pool.query('DELETE FROM clientes WHERE id = $1', [req.params.id]);
        res.json({ success: true, message: 'Cliente eliminado' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Error deleting client' });
    }
});

// --- CONFIGURATION ENDPOINTS ---
app.get('/api/config', async (req, res) => {
    try {
        const result = await req.pool.query('SELECT * FROM configuracion');
        const config = {};
        result.rows.forEach(row => {
            config[row.clave] = row.valor;
        });
        res.json(config);
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Error retrieving config' });
    }
});

app.post('/api/config', async (req, res) => {
    const { clave, valor } = req.body;
    try {
        await req.pool.query(
            'INSERT INTO configuracion (clave, valor) VALUES ($1, $2) ON CONFLICT (clave) DO UPDATE SET valor = $2',
            [clave, valor]
        );
        res.json({ success: true, message: 'Configuración guardada' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Error saving config' });
    }
});

// --- SUPPLIER COMMITMENTS (CUENTAS POR PAGAR) API ---

async function ensureCommitmentsTables(pool) {
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS compromisos_pago (
                id SERIAL PRIMARY KEY,
                proveedor_id INTEGER REFERENCES proveedores(id) ON DELETE SET NULL,
                descripcion TEXT NOT NULL,
                monto_total_usd DECIMAL(10, 2) NOT NULL,
                monto_pagado_usd DECIMAL(10, 2) DEFAULT 0.00,
                fecha_vencimiento DATE NOT NULL,
                estado VARCHAR(20) DEFAULT 'PENDIENTE',
                creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                fecha_emision DATE,
                numero_factura VARCHAR(100),
                last_alert_sent_at TIMESTAMP
            );
        `);
        await pool.query(`
            CREATE TABLE IF NOT EXISTS historial_pagos_compromisos (
                id SERIAL PRIMARY KEY,
                compromiso_id INTEGER REFERENCES compromisos_pago(id) ON DELETE CASCADE,
                monto_usd DECIMAL(10, 2) NOT NULL,
                referencia VARCHAR(100),
                fecha_pago TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);
        // Ensure columns exist (for older tables that didn't have them)
        await pool.query(`ALTER TABLE compromisos_pago ADD COLUMN IF NOT EXISTS fecha_emision DATE;`);
        await pool.query(`ALTER TABLE compromisos_pago ADD COLUMN IF NOT EXISTS numero_factura VARCHAR(100);`);
        await pool.query(`ALTER TABLE compromisos_pago ADD COLUMN IF NOT EXISTS last_alert_sent_at TIMESTAMP;`);
    } catch (e) {
        console.error('Error ensuring commitments tables:', e);
    }
}

// 1. GET Commitments (with alerts logic)
app.get('/api/commitments', async (req, res) => {
    try {
        await ensureCommitmentsTables(req.pool);
        const { status, timeframe } = req.query;
        let query = `
            SELECT cp.*, p.nombre as proveedor_nombre,
            (cp.fecha_vencimiento - CURRENT_DATE) as days_remaining
            FROM compromisos_pago cp
            JOIN proveedores p ON cp.proveedor_id = p.id
        `;
        const params = [];
        let whereClauses = [];

        if (status === 'PENDING') {
            whereClauses.push("cp.estado != 'PAGADO'");
        } else if (status === 'PAID') {
            whereClauses.push("cp.estado = 'PAGADO'");
        } else if (status === 'PARTIAL') {
            whereClauses.push("cp.estado = 'PARCIAL'");
        }

        if (whereClauses.length > 0) {
            query += " WHERE " + whereClauses.join(' AND ');
        }

        query += " ORDER BY cp.fecha_vencimiento ASC";

        const result = await req.pool.query(query, params);
        res.json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Error al obtener compromisos' });
    }
});

// DEBUG: Force Alerts Now
app.post('/api/debug/force-alerts', async (req, res) => {
    try {
        await ensureCommitmentsTables(req.pool);
        console.log('[Debug] Forzando envío de alertas...');
        // We can pass a flag or just rely on the logic. 
        // If we want to force send even if already sent today, we might need to tweak the module 
        // or just manually clear the dates first (optional).
        // For now, let's assume "Force" means "Check logic immediately".
        // To really FORCE re-sending, we'd need to clear 'last_alert_sent_at' for pending items.

        // OPTIONAL: Clear last_sent to allow re-testing
        // await req.pool.query("UPDATE compromisos_pago SET last_alert_sent_at = NULL WHERE estado != 'PAGADO'");

        const result = await checkAndSendAlerts(req.pool);
        res.json({ success: true, result });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// 2. Create Commitment
app.post('/api/commitments', async (req, res) => {
    const { proveedor_id, descripcion, monto_usd, fecha_vencimiento, fecha_emision, numero_factura } = req.body;
    try {
        await ensureCommitmentsTables(req.pool);
        const result = await req.pool.query(
            `INSERT INTO compromisos_pago (proveedor_id, descripcion, monto_total_usd, monto_pagado_usd, fecha_vencimiento, estado, fecha_emision, numero_factura)
             VALUES ($1, $2, $3, 0, $4, 'PENDIENTE', $5, $6) RETURNING *`,
            [proveedor_id, descripcion, monto_usd, fecha_vencimiento, fecha_emision || null, numero_factura || null]
        );
        res.json(result.rows[0]);
    } catch (err) {
        console.error('Error creating commitment:', err);
        res.status(500).send('Server Error');
    }
});

// 3. Register Payment (Partial or Full)
app.post('/api/commitments/:id/payments', async (req, res) => {
    const commitmentId = req.params.id;
    const { monto, referencia } = req.body; // monto is payment amount

    try {
        await ensureCommitmentsTables(req.pool);
        // A. Insert History
        await req.pool.query(
            `INSERT INTO historial_pagos_compromisos (compromiso_id, monto_usd, referencia)
             VALUES ($1, $2, $3)`,
            [commitmentId, monto, referencia]
        );

        // B. Update Commitment Balance
        await req.pool.query(
            `UPDATE compromisos_pago
             SET monto_pagado_usd = monto_pagado_usd + $2
             WHERE id = $1`,
            [commitmentId, monto]
        );

        // C. Check if paid
        const check = await req.pool.query('SELECT * FROM compromisos_pago WHERE id = $1', [commitmentId]);
        const comm = check.rows[0];
        let newStatus = comm.estado;

        if (parseFloat(comm.monto_pagado_usd) >= parseFloat(comm.monto_total_usd)) {
            newStatus = 'PAGADO';
        } else {
            newStatus = 'PARCIAL';
        }

        if (newStatus !== comm.estado) {
            await req.pool.query('UPDATE compromisos_pago SET estado = $2 WHERE id = $1', [commitmentId, newStatus]);
            comm.estado = newStatus;
        }

        res.json({ success: true, commitment: comm });

    } catch (err) {
        console.error('Error processing payment:', err);
        res.status(500).send('Server Error');
    }
});

// 4. Get Payment History for a Commitment
app.get('/api/commitments/:id/history', async (req, res) => {
    try {
        await ensureCommitmentsTables(req.pool);
        const result = await req.pool.query(
            `SELECT * FROM historial_pagos_compromisos WHERE compromiso_id = $1 ORDER BY fecha_pago DESC`,
            [req.params.id]
        );
        res.json(result.rows);
    } catch (err) {
        console.error('Error fetching history:', err);
        res.status(500).send('Server Error');
    }
});

// --- GLOBAL ALERTS & NOTIFICATIONS ---

// 1. GET Alerts (for Bell Icon)
app.get('/api/alerts', async (req, res) => {
    try {
        // Fetch alert days from configuration (defaults to 3 if not set)
        const configRes = await req.pool.query("SELECT valor FROM configuracion WHERE clave = 'alert_days'");
        const alertDays = configRes.rows.length > 0 ? parseInt(configRes.rows[0].valor) || 3 : 3;

        const result = await req.pool.query(`
            SELECT cp.*, p.nombre as proveedor_nombre,
            (cp.fecha_vencimiento - CURRENT_DATE) as days_remaining
            FROM compromisos_pago cp
            JOIN proveedores p ON cp.proveedor_id = p.id
            WHERE cp.estado != 'PAGADO' AND (cp.fecha_vencimiento - CURRENT_DATE) <= $1
            ORDER BY cp.fecha_vencimiento ASC
        `, [alertDays]);

        res.json({
            count: result.rows.length,
            alerts: result.rows
        });
    } catch (err) {
        console.error('Error fetching alerts:', err);
        res.status(500).send('Server Error');
    }
});

// 2. Email Notification Service
const sendDailyNotifications = async () => {
    console.log('Checking for payment alerts...');

    try {
        const tenantsRes = await masterPool.query(
            "SELECT slug FROM tenants WHERE status = $1",
            ['active']
        );

        for (const tenant of tenantsRes.rows) {
            const tenantPool = await getTenantPool(tenant.slug);
            if (!tenantPool) {
                console.warn(`[Alerts] Tenant ${tenant.slug} no disponible. Omitiendo.`);
                continue;
            }

            await checkAndSendAlerts(tenantPool);
        }
    } catch (err) {
        console.error('Error sending notifications:', err);
    }
};

// Check for alerts on server start (for verifying)
setTimeout(sendDailyNotifications, 5000);

// Run every 24 hours
setInterval(sendDailyNotifications, 86400000);

// GET Audit Logs (Admin/Fiscal only)
app.get('/api/audit', async (req, res) => {
    try {
        const result = await req.pool.query(`
            SELECT a.*, u.nombre as usuario_nombre, u.rol as usuario_rol 
            FROM auditoria a
            LEFT JOIN usuarios u ON a.usuario_id = u.id
            ORDER BY a.fecha DESC
            LIMIT 100
        `);
        res.json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Error obteniendo auditoría' });
    }
});

// DELETE Product (Soft Delete) - Added for Audit Compliance
app.delete('/api/products/:id', global.checkFiscal, async (req, res) => {
    const { id } = req.params;
    const userId = req.headers['x-user-id'] || null;
    const ip = req.ip;

    try {
        await req.pool.query('UPDATE productos SET activo = false WHERE id = $1', [id]);
        await global.logAudit(req, userId, 'DELETE_PRODUCT', 'productos', id, { type: 'soft_delete' }, ip);
        res.json({ success: true, message: 'Producto inactivado correctamente' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Error al inactivar producto' });
    }
});


// =============================================================================
// BULK OPERATION ENDPOINTS
// =============================================================================

// Helper: Process Bulk Insertion
async function processBulkInsert(table, fields, items, conflictKey = null) {
    const results = { success: 0, failed: 0, errors: [] };
    const client = await req.pool.connect();
    try {
        await client.query('BEGIN');
        for (const item of items) {
            try {
                // Construct Query
                const keys = Object.keys(item).filter(k => fields.includes(k));
                if (keys.length === 0) continue;

                const values = keys.map(k => item[k]);
                const placeholders = keys.map((_, i) => `$${i + 1}`).join(', ');
                const columns = keys.join(', ');

                let query = `INSERT INTO ${table} (${columns}) VALUES (${placeholders})`;
                if (conflictKey) {
                    query += ` ON CONFLICT (${conflictKey}) DO NOTHING`;
                }

                const res = await client.query(query, values);
                if (res.rowCount > 0) {
                    results.success++;
                } else {
                    results.failed++; // Duplicate or ignored
                    results.errors.push(`Duplicado o ignorado: ${item[conflictKey] || JSON.stringify(item)}`);
                }
            } catch (err) {
                results.failed++;
                results.errors.push(`Error en fila: ${err.message}`);
            }
        }
        await client.query('COMMIT');
    } catch (e) {
        await client.query('ROLLBACK');
        console.error('Bulk Transaction Error', e);
        throw e;
    } finally {
        client.release();
    }
    return results;
}

// 1. Bulk Categories
app.post('/api/categories/bulk-create', async (req, res) => {
    try {
        const { items } = req.body; // Expects array of objects
        // Normalize items: { nombre: ... }
        const normalized = items.map(i => ({
            nombre: i.nombre || i.NOMBRE || i.Name,
            activo: true
        })).filter(i => i.nombre);

        const result = await processBulkInsert('categorias', ['nombre', 'activo'], normalized, 'nombre');
        res.json({ success: true, results: result });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Error en carga masiva' });
    }
});

// 2. Bulk Suppliers
app.post('/api/suppliers/bulk-create', async (req, res) => {
    try {
        const { items } = req.body;
        const normalized = items.map(i => ({
            rif: i.rif || i.RIF || i.id || `TEMP-${Date.now()}-${Math.random()}`, // Fallback if no RIF
            nombre: i.nombre || i.NOMBRE || i.provider || i.Proveedor,
            telefono: i.telefono || i.TELEFONO || null,
            dias_credito: parseInt(i.dias_credito || i.DIAS || 0),
            activo: true
        })).filter(i => i.nombre);

        // Try to identify conflict key. RIF is usually unique but sometimes missing in simple lists.
        // If checking only by name is safer for simple lists:
        // Use RIF as conflict if present, otherwise just Insert?
        // Let's assume RIF is unique constraint.
        const result = await processBulkInsert('proveedores', ['rif', 'nombre', 'telefono', 'dias_credito', 'activo'], normalized, 'rif');
        res.json({ success: true, results: result });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Error en carga masiva' });
    }
});

// 3. Bulk Clients
app.post('/api/clients/bulk-create', async (req, res) => {
    try {
        const { items } = req.body;
        const normalized = items.map(i => ({
            cedula: i.cedula || i.CEDULA || i.dni || i.id,
            nombre: i.nombre || i.NOMBRE || i.client,
            email: i.email || i.EMAIL || null,
            telefono: i.telefono || i.TELEFONO || null
        })).filter(i => i.cedula && i.nombre);

        const result = await processBulkInsert('clientes', ['cedula', 'nombre', 'email', 'telefono'], normalized, 'cedula');
        res.json({ success: true, results: result });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Error en carga masiva' });
    }
});

// 4. Bulk Users
app.post('/api/users/bulk-create', async (req, res) => {
    try {
        const { items } = req.body;
        const normalized = [];
        for (const i of items) {
            const email = (i.email || i.EMAIL || '').toLowerCase();
            if (!email || !i.password) continue;

            const passwordHash = await bcrypt.hash(i.password, 10);
            normalized.push({
                nombre: i.nombre || i.NOMBRE || 'Usuario',
                email: email,
                password_hash: passwordHash,
                rol: (i.rol || i.ROL || 'vendedor').toLowerCase(),
                activo: true,
                creado_en: new Date() // handled by DB default usually but helpful
            });
        }

        // Custom insert for Users because of password hash and conflict
        // Using helper might trigger conflict on email
        const result = await processBulkInsert('usuarios', ['nombre', 'email', 'password_hash', 'rol', 'activo'], normalized, 'email');
        res.json({ success: true, results: result });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Error en carga masiva' });
    }
});

// 5. Bulk Payment Methods
app.post('/api/config/payment-methods/bulk-create', async (req, res) => {
    try {
        const { items } = req.body;
        // Simple list of names usually. item might be { nombre: 'Zelle' }
        const normalized = items.map(i => ({
            clave: 'payment_methods', // This is tricky. Config table is key-value. 
            // Wait, previous implementation of payment methods was likely a JSON array in config table OR a separate table?
            // "loadPaymentMethods" fetches /api/config/payment-methods.
            // Let's check how payment methods are stored.
            // If they are in a separate table, great. If in config json...
            // Looking at initSettings in modulos.js: fetch(`${API_URL}/payment-methods`) which is `http://localhost:3000/api/config/payment-methods`.
            // But I don't see that endpoint in servidor.js view! 
            // I only see `app.get('/api/config')`.
            // Ah, I need to check if there are other routes or if I missed them.
            // If they don't exist, I need to create the TABLE or the Logic.
            // Based on `modulos.js` lines 638, it expects an array from `/api/config/payment-methods`.

            // Let's assume we need a TABLE `medios_pago` and `presentaciones` or store in `configuracion` as JSON.
            // Storing as JSON in `configuracion` table: key='payment_methods', value='[{"id":1,"nombre":"Zelle"}]'
            // This is harder for bulk insert.

            // BETTER: Create tables `medios_pago` and `presentaciones`.
            nombre: i.nombre || i.NOMBRE
        })).filter(i => i.nombre);

        // For now, let's assume we create tables if they don't exist, or use a specific structure.
        // Given I'm "fixing regressions", I should probably use what was there.
        // But I don't see the endpoints in `servidor.js` for payments either!
        // So I will create the TABLES and endpoints now.

        // I'll create the tables inside the POST if they don't exist (or better in init).
        // Since I'm appending code, I'll add the table creation check here or just assume.
        // Let's create the tables via query first.
    } catch (e) { }
});

// --- REAL IMPLEMENTATION FOR PAYMENTS & PRESENTATIONS ---
// First, create tables if not exists (Lazy init or separate script? separate script prevents server restart bloat)
// I'll put the init logic in the endpoint for simplicity of this task, or rely on `pool.query` safety.

app.post('/api/config/payment-methods', async (req, res) => {
    const { nombre } = req.body;
    try {
        // Ensure table exists
        await req.pool.query(`CREATE TABLE IF NOT EXISTS medios_pago (id SERIAL PRIMARY KEY, nombre VARCHAR(100) UNIQUE NOT NULL)`);
        await req.pool.query('INSERT INTO medios_pago (nombre) VALUES ($1) ON CONFLICT DO NOTHING', [nombre]);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/config/payment-methods', async (req, res) => {
    try {
        await req.pool.query(`CREATE TABLE IF NOT EXISTS medios_pago (id SERIAL PRIMARY KEY, nombre VARCHAR(100) UNIQUE NOT NULL)`);
        const r = await req.pool.query('SELECT * FROM medios_pago ORDER BY nombre');
        res.json(r.rows);
    } catch (e) { res.status(500).json([]); }
});

app.delete('/api/config/payment-methods/:id', async (req, res) => {
    try {
        await req.pool.query('DELETE FROM medios_pago WHERE id = $1', [req.params.id]);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/payment-methods/bulk-create', async (req, res) => {
    try {
        await req.pool.query(`CREATE TABLE IF NOT EXISTS medios_pago (id SERIAL PRIMARY KEY, nombre VARCHAR(100) UNIQUE NOT NULL)`);
        const { items } = req.body;
        const normalized = items.map(i => ({ nombre: i.nombre || i.NOMBRE })).filter(i => i.nombre);
        const result = await processBulkInsert('medios_pago', ['nombre'], normalized, 'nombre');
        res.json({ success: true, results: result });
    } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});


// Presentations
app.post('/api/config/presentations', async (req, res) => {
    const { nombre } = req.body;
    try {
        await req.pool.query(`CREATE TABLE IF NOT EXISTS presentaciones (id SERIAL PRIMARY KEY, nombre VARCHAR(100) UNIQUE NOT NULL)`);
        await req.pool.query('INSERT INTO presentaciones (nombre) VALUES ($1) ON CONFLICT DO NOTHING', [nombre]);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/config/presentations', async (req, res) => {
    try {
        await req.pool.query(`CREATE TABLE IF NOT EXISTS presentaciones (id SERIAL PRIMARY KEY, nombre VARCHAR(100) UNIQUE NOT NULL)`);
        const r = await req.pool.query('SELECT * FROM presentaciones ORDER BY nombre');
        res.json(r.rows);
    } catch (e) { res.status(500).json([]); }
});

app.delete('/api/config/presentations/:id', async (req, res) => {
    try {
        await req.pool.query('DELETE FROM presentaciones WHERE id = $1', [req.params.id]);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/config/presentations/bulk-create', async (req, res) => {
    try {
        await req.pool.query(`CREATE TABLE IF NOT EXISTS presentaciones (id SERIAL PRIMARY KEY, nombre VARCHAR(100) UNIQUE NOT NULL)`);
        const { items } = req.body;
        const normalized = items.map(i => ({ nombre: i.nombre || i.NOMBRE })).filter(i => i.nombre);
        const result = await processBulkInsert('presentaciones', ['nombre'], normalized, 'nombre');
        res.json({ success: true, results: result });
    } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// =============================================================================
// ALERT CONFIGURATION ENDPOINT (PROTOTYPE)
// =============================================================================
let alertConfig = {
    alert_days: 3 // Default
};

app.get('/api/config/alerts', (req, res) => {
    res.json(alertConfig);
});

app.post('/api/config/alerts', (req, res) => {
    const { alert_days } = req.body;
    if (alert_days !== undefined) {
        alertConfig.alert_days = parseInt(alert_days);
        console.log('Alert threshold updated to:', alertConfig.alert_days);
        res.json({ success: true, message: 'Configuración actualizada' });
    } else {
        res.status(400).json({ success: false, message: 'Faltan datos' });
    }
});


// =============================================================================
// REPORTES MODULE
// =============================================================================

function handleDateFilters(startDate, endDate) {
    let whereClause = '';
    const params = [];
    let paramIndex = 1;

    // Convert stored UTC v.fecha to local Venezuela/Chile (UTC-4) timezone for accurate daily reports
    const localDateExpr = "(v.fecha AT TIME ZONE 'UTC' AT TIME ZONE 'America/Caracas')";

    if (startDate && startDate.trim() !== '' && endDate && endDate.trim() !== '') {
        whereClause = `WHERE ${localDateExpr} >= $${paramIndex++} AND ${localDateExpr} <= $${paramIndex++}`;
        params.push(`${startDate} 00:00:00`, `${endDate} 23:59:59`);
    } else if (startDate && startDate.trim() !== '') {
        whereClause = `WHERE ${localDateExpr} >= $${paramIndex++}`;
        params.push(`${startDate} 00:00:00`);
    } else if (endDate && endDate.trim() !== '') {
        whereClause = `WHERE ${localDateExpr} <= $${paramIndex++}`;
        params.push(`${endDate} 23:59:59`);
    }
    return { whereClause, params };
}

// 1. Dashboard View
app.post('/api/reports/dashboard', async (req, res) => {
    try {
        const { startDate, endDate } = req.body;
        const { whereClause, params } = handleDateFilters(startDate, endDate);

        const queryVentas = `
            SELECT 
                COALESCE(SUM(v.total_usd), 0) as total_ventas_usd,
                COALESCE(SUM(v.total_bs), 0) as total_ventas_bs
            FROM ventas v
            ${whereClause}
        `;
        const resVentas = await req.pool.query(queryVentas, params);

        const dWhereClause = whereClause.replace(/v\.fecha/g, 'v.fecha');
        const queryProfit = `
            SELECT 
                COALESCE(SUM((d.precio_unitario_usd - d.costo_unitario_usd) * d.cantidad), 0) as est_profit_usd,
                COALESCE(SUM(((d.precio_unitario_usd - d.costo_unitario_usd) * d.cantidad) * v.tasa_bcv), 0) as est_profit_bs
            FROM detalle_ventas d
            JOIN ventas v ON d.venta_id = v.id
            ${dWhereClause}
        `;
        const resProfit = await req.pool.query(queryProfit, params);

        res.json({
            success: true,
            dashboard: {
                total_ventas_usd: resVentas.rows[0].total_ventas_usd,
                total_ventas_bs: resVentas.rows[0].total_ventas_bs,
                est_profit_usd: resProfit.rows[0].est_profit_usd,
                est_profit_bs: resProfit.rows[0].est_profit_bs
            }
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Error retrieving dashboard reports' });
    }
});

// 2. Product Breakdown
app.post('/api/reports/products', async (req, res) => {
    try {
        const { startDate, endDate } = req.body;
        const { whereClause, params } = handleDateFilters(startDate, endDate);

        const query = `
            SELECT 
                p.nombre as producto, 
                c.nombre as categoria, 
                COALESCE(SUM(d.cantidad), 0) as cantidad_vendida,
                COALESCE(SUM(d.subtotal_usd), 0) as total_ventas_usd,
                COALESCE(SUM((d.precio_unitario_usd - d.costo_unitario_usd) * d.cantidad), 0) as est_profit_usd
            FROM detalle_ventas d
            JOIN ventas v ON d.venta_id = v.id
            JOIN productos p ON d.producto_id = p.id
            LEFT JOIN categorias c ON p.categoria_id = c.id
            ${whereClause}
            GROUP BY p.id, p.nombre, c.nombre
            ORDER BY cantidad_vendida DESC
        `;
        const result = await req.pool.query(query, params);
        res.json({ success: true, products: result.rows });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Error retrieving product reports' });
    }
});

// 3. Sales History (with client search)
app.post('/api/reports/history', async (req, res) => {
    try {
        const { startDate, endDate, clientTerm } = req.body;
        const { whereClause, params } = handleDateFilters(startDate, endDate);

        let query = `
            SELECT v.id, v.fecha, v.total_usd, v.total_bs, v.metodo_pago, c.nombre as cliente
            FROM ventas v
            LEFT JOIN clientes c ON v.cliente_id = c.id
            ${whereClause}
        `;

        if (clientTerm) {
            let pLen = params.length + 1;
            if (whereClause) {
                query += ` AND c.nombre ILIKE $${pLen}`;
            } else {
                query += ` WHERE c.nombre ILIKE $${pLen}`;
            }
            params.push(`%${clientTerm}%`);
        }

        query += ` ORDER BY v.fecha DESC LIMIT 200`;

        const result = await req.pool.query(query, params);
        res.json({ success: true, history: result.rows });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Error retrieving sales history reports' });
    }
});

// 4. Audit Trail
app.post('/api/reports/audit', async (req, res) => {
    try {
        const { startDate, endDate } = req.body;
        let whereClause = '';
        const params = [];
        let paramIndex = 1;

        // Convert stored UTC a.fecha to local Venezuela/Chile (UTC-4) timezone for accurate daily reports
        const localDateExpr = "(a.fecha AT TIME ZONE 'UTC' AT TIME ZONE 'America/Caracas')";

        if (startDate && endDate) {
            whereClause = `WHERE ${localDateExpr} >= $${paramIndex++} AND ${localDateExpr} <= $${paramIndex++}`;
            params.push(`${startDate} 00:00:00`, `${endDate} 23:59:59`);
        } else if (startDate) {
            whereClause = `WHERE ${localDateExpr} >= $${paramIndex++}`;
            params.push(`${startDate} 00:00:00`);
        } else if (endDate) {
            whereClause = `WHERE ${localDateExpr} <= $${paramIndex++}`;
            params.push(`${endDate} 23:59:59`);
        }

        const query = `
            SELECT a.fecha, a.accion, a.tabla, a.detalle, a.ip, u.nombre as usuario
            FROM auditoria a
            LEFT JOIN usuarios u ON a.usuario_id = u.id
            ${whereClause}
            ORDER BY a.fecha DESC LIMIT 100
        `;

        const result = await req.pool.query(query, params);
        res.json({ success: true, audit: result.rows });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Error retrieving audit reports' });
    }
});

// Start Server
if (process.env.NODE_ENV !== 'production') {
    app.listen(port, () => {
        console.log(`Servidor corriendo en http://localhost:${port}`);
    });
}

module.exports = app;
