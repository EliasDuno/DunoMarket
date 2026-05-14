const dotenv = require('dotenv');

dotenv.config({ quiet: true });

function parseBoolean(value, defaultValue = false) {
    if (value === undefined || value === null || value === '') return defaultValue;
    return ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase());
}

function getSslConfig(defaultValue = false) {
    if (!parseBoolean(process.env.DB_SSL, defaultValue)) return undefined;
    return { rejectUnauthorized: false };
}

function getMasterPoolConfig() {
    if (process.env.DATABASE_URL) {
        return {
            connectionString: process.env.DATABASE_URL,
            ssl: getSslConfig(true)
        };
    }

    return {
        user: process.env.DB_USER || 'postgres',
        host: process.env.DB_HOST || 'localhost',
        database: process.env.DB_NAME || 'PiduNet',
        password: process.env.DB_PASSWORD || '',
        port: Number(process.env.DB_PORT || 5432),
        ssl: getSslConfig(false)
    };
}

function getTenantPoolConfig(connectionString) {
    return {
        connectionString,
        ssl: getSslConfig(true)
    };
}

module.exports = {
    getMasterPoolConfig,
    getTenantPoolConfig
};
