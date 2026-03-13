const fetch = require('node-fetch');

async function testReport() {
    try {
        const response = await fetch('http://localhost:3000/api/reports/range', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                startDate: '2025-01-01',
                endDate: '2025-12-31'
            })
        });

        console.log('Status:', response.status);
        const text = await response.text();
        console.log('Body:', text);
    } catch (err) {
        console.error('Request failed:', err);
    }
}

testReport();
