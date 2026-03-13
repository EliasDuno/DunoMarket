const http = require('http');

const data = JSON.stringify({
    startDate: '2025-01-01',
    endDate: '2025-01-02'
});

const options = {
    hostname: 'localhost',
    port: 3000,
    path: '/api/reports/range',
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
        'Content-Length': data.length
    }
};

const req = http.request(options, (res) => {
    console.log(`StatusCode: ${res.statusCode}`);
    let body = '';

    res.on('data', (chunk) => {
        body += chunk;
    });

    res.on('end', () => {
        console.log('Body:', body);
    });
});

req.on('error', (error) => {
    console.error('Error:', error);
});

req.write(data);
req.end();
