const fs = require('fs');
const path = require('path');
const util = require('util');

const logPath = path.join(__dirname, 'server_debug_log.txt');
const logFile = fs.createWriteStream(logPath, { flags: 'w' });

// Hook stdout and stderr
const originalStdout = process.stdout.write;
const originalStderr = process.stderr.write;

process.stdout.write = function (chunk, encoding, callback) {
    logFile.write(chunk);
    return originalStdout.apply(process.stdout, arguments);
};

process.stderr.write = function (chunk, encoding, callback) {
    logFile.write(chunk);
    return originalStderr.apply(process.stderr, arguments);
};

console.log('--- Starting Server Debug ---');

try {
    require('./servidor.js');
} catch (err) {
    console.error('--- Require Error ---');
    console.error(err);
}

process.on('uncaughtException', (err) => {
    console.error('--- Uncaught Exception ---');
    console.error(err);
    process.exit(1);
});
