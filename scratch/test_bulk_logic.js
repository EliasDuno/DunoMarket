const fs = require('fs');
const path = require('path');

// 1. Extract processBulkInsert from api/index.js
// Normalize CRLF to LF for robust search
const apiContent = fs.readFileSync(path.join(__dirname, '..', 'api', 'index.js'), 'utf8').replace(/\r\n/g, '\n');

// Find processBulkInsert code block
const functionStartIdx = apiContent.indexOf('async function processBulkInsert');
if (functionStartIdx === -1) {
    console.error('Could not find processBulkInsert function!');
    process.exit(1);
}

// Find the closing brace of the function. It ends at "return results;\n}"
const functionEndIdx = apiContent.indexOf('return results;\n}', functionStartIdx) + 'return results;\n}'.length;
const processBulkInsertCode = apiContent.substring(functionStartIdx, functionEndIdx);

console.log('Extracted function length:', processBulkInsertCode.length);

// Define the function dynamically
const processBulkInsert = new Function('pool', 'table', 'fields', 'items', 'conflictKey = null', 'caseInsensitiveCheckField = null', `
    const fn = ${processBulkInsertCode.replace('async function processBulkInsert', 'async function')};
    return fn(pool, table, fields, items, conflictKey, caseInsensitiveCheckField);
`);

// Mock PG Pool & Client
class MockClient {
    constructor() {
        this.queries = [];
        this.rowsToReturn = [];
        this.rowCountToReturn = 1;
        this.released = false;
    }
    async query(sql, params) {
        this.queries.push({ sql, params });
        
        // Simulate row responses
        if (sql.includes('SELECT')) {
            // Case-insensitive check mock behavior
            if (sql.toLowerCase().includes('where lower(')) {
                const searchVal = params[0].toLowerCase();
                const matchedRow = this.rowsToReturn.find(r => {
                    const keys = Object.keys(r);
                    return keys.some(k => r[k].toString().toLowerCase() === searchVal);
                });
                return { rows: matchedRow ? [matchedRow] : [] };
            }
            return { rows: this.rowsToReturn };
        }
        return { rowCount: this.rowCountToReturn, rows: [] };
    }
    release() {
        this.released = true;
    }
}

class MockPool {
    constructor() {
        this.clients = [];
    }
    async connect() {
        const client = new MockClient();
        this.clients.push(client);
        return client;
    }
}

async function runTests() {
    console.log('\n--- Running Unit Tests for Carga Masiva Logic ---\n');

    // Test 1: Insert new records successfully
    {
        console.log('Test 1: Insert new records successfully');
        const pool = new MockPool();
        const items = [
            { nombre: 'Efectivo', activo: true },
            { nombre: 'Tarjeta', activo: false }
        ];
        const fields = ['nombre', 'activo'];
        
        const results = await processBulkInsert(pool, 'medios_pago', fields, items, 'nombre', 'nombre');
        
        const client = pool.clients[0];
        console.log('Queries run:', client.queries);
        console.log('Results:', results);
        
        // Assertions
        if (results.success !== 2 || results.failed !== 0) {
            throw new Error('Test 1 failed: Expected 2 success, 0 failed');
        }
        if (client.queries[0].sql !== 'BEGIN') throw new Error('Test 1 failed: Transaction not started');
        if (client.queries[client.queries.length - 1].sql !== 'COMMIT') throw new Error('Test 1 failed: Transaction not committed');
        console.log('✅ Test 1 Passed!\n');
    }

    // Test 2: Case-insensitive check prevents duplicate insertion
    {
        console.log('Test 2: Case-insensitive check prevents duplicate insertion');
        const pool = new MockPool();
        const items = [
            { nombre: 'Zelle', activo: true }
        ];
        const fields = ['nombre', 'activo'];
        
        // Set mock client to return a matching row for Zelle
        const runner = async () => {
            const client = await pool.connect();
            client.rowsToReturn = [{ id: 1, nombre: 'zelle' }];
            pool.connect = async () => client; // reuse client
            
            const results = await processBulkInsert(pool, 'medios_pago', fields, items, 'nombre', 'nombre');
            console.log('Queries run:', client.queries);
            console.log('Results:', results);
            
            if (results.success !== 0 || results.failed !== 1 || results.errors[0] !== 'Ya existe: Zelle') {
                throw new Error('Test 2 failed: Expected 0 success, 1 failed with specific error');
            }
            console.log('✅ Test 2 Passed!\n');
        };
        await runner();
    }

    // Test 3: SQL Error inside loop doesn't fail entire batch, but tracks error
    {
        console.log('Test 3: SQL Error inside loop does not fail entire batch');
        const pool = new MockPool();
        const items = [
            { nombre: 'ErrorItem', activo: true },
            { nombre: 'SuccessItem', activo: true }
        ];
        const fields = ['nombre', 'activo'];
        
        const runner = async () => {
            const client = await pool.connect();
            client.query = async (sql, params) => {
                client.queries.push({ sql, params });
                if (sql.includes('INSERT') && params[0] === 'ErrorItem') {
                    throw new Error('Unique constraint violation');
                }
                if (sql.includes('SELECT')) return { rows: [] };
                return { rowCount: 1, rows: [] };
            };
            pool.connect = async () => client;
            
            const results = await processBulkInsert(pool, 'medios_pago', fields, items, 'nombre', 'nombre');
            console.log('Results:', results);
            
            if (results.success !== 1 || results.failed !== 1) {
                throw new Error('Test 3 failed: Expected 1 success, 1 failed');
            }
            console.log('✅ Test 3 Passed!\n');
        };
        await runner();
    }
    
    console.log('--- ALL TESTS PASSED SUCCESSFULLY! ---');
}

runTests().catch(err => {
    console.error('❌ Test execution failed:', err);
    process.exit(1);
});
