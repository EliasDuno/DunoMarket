const http = require('http');

function makeRequest() {
    const options = {
        hostname: 'localhost',
        port: 3000,
        path: '/api/users',
        method: 'GET',
    };

    const req = http.request(options, (res) => {
        let data = '';
        res.on('data', (chunk) => {
            data += chunk;
        });
        res.on('end', () => {
            console.log('Status Code:', res.statusCode);
            try {
                const parsed = JSON.parse(data);
                console.log('Body:', JSON.stringify(parsed, null, 2));
            } catch (e) {
                console.log('Body (Raw):', data);
            }
        });
    });

    req.on('error', (e) => {
        console.error('Request Error:', e);
    });

    req.end();
}

makeRequest();
