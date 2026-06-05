const { Pool } = require('pg');
const { getMasterPoolConfig } = require('../config/db');

const pool = new Pool(getMasterPoolConfig());

async function addAvatarColumn() {
    try {
        console.log('Adding avatar_url column...');
        await pool.query('ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS avatar_url VARCHAR(255)');
        console.log('Column avatar_url added successfully.');
    } catch (err) {
        console.error('Error adding column:', err);
    } finally {
        pool.end();
    }
}

addAvatarColumn();
