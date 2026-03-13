const http = require('http');

function makeRequest(path, method, body) {
    return new Promise((resolve, reject) => {
        const options = {
            hostname: 'localhost',
            port: 3000,
            path: path,
            method: method,
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(body)
            }
        };

        const req = http.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => {
                data += chunk;
            });
            res.on('end', () => {
                resolve({ statusCode: res.statusCode, body: data });
            });
        });

        req.on('error', (e) => {
            reject(e);
        });

        req.write(body);
        req.end();
    });
}

async function runTests() {
    console.log('--- Iniciando Tests del Backend ---');

    // 1. Test Login (Invalid)
    console.log('\n1. Test Login (Credenciales Invalidas)');
    try {
        const res = await makeRequest('/api/login', 'POST', JSON.stringify({ email: 'test@invalid.com', password: 'wrong' }));
        console.log(`Status: ${res.statusCode}`);
        console.log(`Response: ${res.body}`);
    } catch (e) { console.error(e); }

    // 2. Test Forgot Password (Simulated)
    // We don't know a valid admin email for sure without querying DB, but we can verify the API handles the request.
    console.log('\n2. Test Forgot Password (Simulacion)');
    try {
        const res = await makeRequest('/api/forgot-password', 'POST', JSON.stringify({ email: 'anyuser@test.com' }));
        console.log(`Status: ${res.statusCode}`);
        console.log(`Response: ${res.body}`);
    } catch (e) { console.error(e); }

    console.log('\n--- Tests Finalizados ---');
}

runTests();
