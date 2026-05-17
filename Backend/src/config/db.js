const sql = require('mssql');

const config = {
  server: 'localhost',
  port: 1435,
  database: 'skybooker_v2',
  user: 'sa',
  password: '123456',
  options: {
    encrypt: false,
    trustServerCertificate: true,
  },
  connectionTimeout: 30000,
  requestTimeout: 30000
};

let pool = null;

const connectDB = async () => {
  try {
    pool = await sql.connect(config);
    console.log('✅ Kết nối SQL Server thành công');
    return pool;
  } catch (err) {
    console.error('❌ Kết nối thất bại:', err.message);
    process.exit(1);
  }
};

const getPool = () => {
  if (!pool) throw new Error('Database chưa được kết nối!');
  return pool;
};

module.exports = { connectDB, getPool, sql };
//              