// Script đặt lại mật khẩu admin
// Chạy: node reset-password.js
require('dotenv').config();
const bcrypt = require('bcryptjs');
const { getPool, sql } = require('./src/config/db');

async function resetPassword() {
  const email    = 'admin@sky.com';
  const password = 'admin';

  try {
    const salt = await bcrypt.genSalt(10);
    const hash = await bcrypt.hash(password, salt);
    console.log('Hash:', hash);

    const pool = await getPool();
    const result = await pool.request()
      .input('hash',  sql.NVarChar, hash)
      .input('email', sql.NVarChar, email)
      .query(`UPDATE dbo.Users SET password_hash = @hash WHERE email = @email`);

    console.log('✅ Đặt lại mật khẩu thành công!');
    console.log('   Email:', email);
    console.log('   Password: admin');
    process.exit(0);
  } catch (err) {
    console.error('❌ Lỗi:', err.message);
    process.exit(1);
  }
}

resetPassword();
