const { Pool } = require('pg');

const pool = new Pool({
    user: 'postgres',
    host: 'localhost',
    database: 'PiduNet',
    password: 'Rodri%970',
    port: 5432,
});

async function migrate() {
    const client = await pool.connect();
    try {
        console.log('--- Starting VAT Migration ---');

        // 1. Config: IVA Percentage
        console.log('1. Checking configuracion table...');
        // Insert default IVA if not exists
        await client.query(`
            INSERT INTO configuracion (clave, valor) 
            VALUES ('iva_percentage', '16.00') 
            ON CONFLICT (clave) DO NOTHING;
        `);
        console.log('   - iva_percentage ensured.');

        // 2. Products: Apply IVA Flag
        console.log('2. Checking productos table...');
        await client.query(`
            ALTER TABLE productos 
            ADD COLUMN IF NOT EXISTS aplica_iva BOOLEAN DEFAULT TRUE;
        `);
        console.log('   - aplica_iva column added.');

        // 3. Sales: Totals Breakdown
        console.log('3. Checking ventas table...');
        await client.query(`
            ALTER TABLE ventas 
            ADD COLUMN IF NOT EXISTS total_base_usd DECIMAL(10, 2) DEFAULT 0.00,
            ADD COLUMN IF NOT EXISTS total_iva_usd DECIMAL(10, 2) DEFAULT 0.00;
        `);
        console.log('   - total_base_usd and total_iva_usd columns added.');

        // 4. Update existing sales (optional, but good for consistency)
        // For existing sales, we can assume total_usd is the total, and maybe set base = total, iva = 0 to be safe?
        // Or just leave them as is. Default 0 is fine.

        console.log('--- Migration Completed Successfully ---');

    } catch (err) {
        console.error('Migration Failed:', err);
    } finally {
        client.release();
        pool.end();
    }
}

migrate();
