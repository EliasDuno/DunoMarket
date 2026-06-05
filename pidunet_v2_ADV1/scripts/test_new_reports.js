const http = require('http');

function post(path) {
    return new Promise((resolve) => {
        const data = JSON.stringify({ startDate: '2025-01-01', endDate: '2025-12-31' });
        const req = http.request({
            hostname: 'localhost',
            port: 3000,
            path: path,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': data.length
            }
        }, (res) => {
            let body = '';
            res.on('data', d => body += d);
            res.on('end', () => resolve({ status: res.statusCode, body }));
        });
        req.on('error', (e) => resolve({ error: e }));
        req.write(data);
        req.end();
    });
}

async function run() {
    console.log('Testing General Report...');
    const general = await post('/api/reports/range');
    console.log('General:', general.status);

    console.log('Testing Products Report...');
    const products = await post('/api/reports/products');
    console.log('Products:', products.status, products.body.substring(0, 100)); // Print start of body
}

run();
