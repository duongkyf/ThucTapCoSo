const { sql, getPool } = require('../../../config/db');

// ── Customers ─────────────────────────────────────────────────
const getCustomers = async (req, res) => {
  try {
    const { q, status } = req.query;
    const pool = await getPool();
    const request = pool.request();
    let where = `WHERE role != 'admin'`;
    if (q) {
      request.input('q', sql.NVarChar, `%${q}%`);
      where += ` AND (username LIKE @q OR email LIKE @q OR phone_number LIKE @q)`;
    }
    if (status) {
      request.input('status', sql.NVarChar, status);
      where += ` AND status = @status`;
    }
    const result = await request.query(`
      SELECT user_id, username, email, phone_number, role, status, created_at
      FROM dbo.Users ${where} ORDER BY created_at DESC
    `);
    res.json({ success: true, data: result.recordset });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
};

const banCustomer = async (req, res) => {
  try {
    const pool = await getPool();
    await pool.request().input('id', sql.Int, req.params.id)
      .query(`UPDATE dbo.Users SET status = 'banned' WHERE user_id = @id`);
    res.json({ success: true, message: 'Đã khóa tài khoản' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
};

const unbanCustomer = async (req, res) => {
  try {
    const pool = await getPool();
    await pool.request().input('id', sql.Int, req.params.id)
      .query(`UPDATE dbo.Users SET status = 'active' WHERE user_id = @id`);
    res.json({ success: true, message: 'Đã mở khóa tài khoản' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
};

module.exports = { getCustomers, banCustomer, unbanCustomer };
