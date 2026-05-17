const { sql, getPool } = require('../../../config/db');

// ── Customers ─────────────────────────────────────────────────
const getCustomers = async (req, res) => {
  try {
    const { q, status } = req.query;
    const pool = await getPool();
    const request = pool.request();

    // Lọc tất cả role không phải admin (case-insensitive)
    let where = `WHERE LOWER(u.role) NOT IN ('admin', 'superadmin')`;

    if (q) {
      request.input('q', sql.NVarChar, `%${q}%`);
      where += ` AND (u.username LIKE @q OR u.email LIKE @q OR u.phone_number LIKE @q)`;
    }
    if (status) {
      request.input('status', sql.NVarChar, status);
      where += ` AND u.status = @status`;
    }

    const result = await request.query(`
      SELECT
        u.user_id,
        u.username,
        u.email,
        u.phone_number,
        u.role,
        u.status,
        u.created_at,
        SUM(CASE WHEN b.user_id IS NOT NULL THEN 1 ELSE 0 END) AS booking_count,
        ISNULL(SUM(b.total_amount), 0)                         AS total_spent
      FROM dbo.Users u
      LEFT JOIN dbo.Bookings b ON b.user_id = u.user_id
      ${where}
      GROUP BY
        u.user_id, u.username, u.email, u.phone_number,
        u.role, u.status, u.created_at
      ORDER BY u.created_at DESC
    `);
    res.json({ success: true, data: result.recordset });
  } catch (err) {
    console.error('getCustomers error:', err);
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