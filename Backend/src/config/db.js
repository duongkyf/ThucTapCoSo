const sql = require('mssql');
require('dotenv').config();

const config = {
  server:       process.env.DB_HOST     || 'localhost',
  instanceName: process.env.DB_INSTANCE || undefined,
  user:         process.env.DB_USER     || 'sa',
  password:     process.env.DB_PASSWORD || '',
  database:     process.env.DB_NAME     || 'skybooker',
  options: {
    encrypt:                false,
    trustedConnection:      false,
    trustServerCertificate: true,
    enableArithAbort:       true,
    useUTC: false,
  },
  pool: {
    max: 10,
    min: 0,
    idleTimeoutMillis: 30000,
  },
};

// Singleton pool
let pool;

const getPool = async () => {
  if (!pool) {
    pool = await sql.connect(config);
    console.log('✅ SQL Server connected:', process.env.DB_NAME);
  }
  return pool;
};

// Tự connect khi module được load
getPool().catch((err) => {
  console.error('❌ SQL Server connection failed:', err.message);
  process.exit(1);
});

module.exports = { sql, getPool };