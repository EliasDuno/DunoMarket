console.log('CWD:', process.cwd());
console.log('DATABASE_URL:', process.env.DATABASE_URL ? 'Defined' : 'Undefined');
console.log('DB_HOST:', process.env.DB_HOST || 'default localhost');
console.log('keys in process.env:', Object.keys(process.env).filter(k => k.includes('DB') || k.includes('URL') || k.includes('POSTGRES')));
