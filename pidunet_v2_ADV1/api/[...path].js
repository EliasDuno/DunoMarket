// Catch-all API entrypoint for Vercel.
// Vercel maps /api/index.js to /api, but nested routes such as /api/login
// need a dynamic API file so the Express app can receive the original path.
module.exports = require('./index');
