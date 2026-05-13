const { sql, getPool } = require('../../../config/db');

// ── Bookings ──────────────────────────────────────────────────
const getBookings = async (req, res) => {
  try {
    const { q, status } = req.query;
    const pool = await getPool();
    const request = pool.request();
    let where = 'WHERE 1=1';
    if (q) {
      request.input('q', sql.NVarChar, `%${q}%`);
      where += ` AND (b.booking_ref LIKE @q OR u.username LIKE @q OR u.email LIKE @q OR b.contact_name LIKE @q OR b.contact_email LIKE @q)`;
    }
    if (status) {
      request.input('status', sql.NVarChar, status);
      where += ` AND b.status = @status`;
    }
    const result = await request.query(`
      SELECT
        b.booking_id, b.user_id, b.booking_ref, b.booking_date,
        b.total_amount, b.status, b.cancel_reason,
        b.contact_name, b.contact_email, b.contact_phone,
        u.username, u.email,
        COUNT(t.ticket_id) AS passenger_count
      FROM dbo.Bookings b
      JOIN dbo.Users u   ON b.user_id    = u.user_id
      JOIN dbo.Tickets t ON t.booking_id = b.booking_id
      ${where}
      GROUP BY b.booking_id, b.user_id, b.booking_ref, b.booking_date,
               b.total_amount, b.status, b.cancel_reason,
               b.contact_name, b.contact_email, b.contact_phone,
               u.username, u.email
      ORDER BY b.booking_date DESC
    `);
    res.json({ success: true, data: result.recordset });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
};

const approveBooking = async (req, res) => {
  try {
    const pool = await getPool();
    await pool.request().input('id', sql.Int, req.params.id)
      .query(`UPDATE dbo.Bookings SET status = N'Đã xác nhận' WHERE booking_id = @id`);
    res.json({ success: true, message: 'Đã xác nhận đặt vé' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
};

const rejectBooking = async (req, res) => {
  try {
    const pool = await getPool();
    await pool.request().input('id', sql.Int, req.params.id)
      .query(`UPDATE dbo.Bookings SET status = N'Từ chối' WHERE booking_id = @id`);
    res.json({ success: true, message: 'Đã từ chối đặt vé' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
};

const cancelBooking = async (req, res) => {
  try {
    const pool = await getPool();
    await pool.request().input('id', sql.Int, req.params.id)
      .query(`UPDATE dbo.Bookings SET status = N'Đã hủy' WHERE booking_id = @id`);
    res.json({ success: true, message: 'Đã hủy đặt vé' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
};

const deleteBooking = async (req, res) => {
  try {
    const pool = await getPool();
    await pool.request().input('id', sql.Int, req.params.id)
      .query(`DELETE FROM dbo.Bookings WHERE booking_id = @id`);
    res.json({ success: true, message: 'Đã xóa đặt vé' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
};

const approveCancel = async (req, res) => {
  try {
    const pool = await getPool();
    const r = await pool.request()
      .input('id', sql.Int, req.params.id)
      .query(`UPDATE dbo.Bookings SET status = N'Đã hủy' WHERE booking_id = @id AND status = N'Chờ hủy'`);

    if (r.rowsAffected[0] === 0)
      return res.status(400).json({ success: false, message: 'Không tìm thấy yêu cầu hủy' });

    res.json({ success: true, message: 'Đã duyệt hủy vé' });
  } catch (err) {
    console.error('approveCancel error:', err);
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
};

const rejectCancel = async (req, res) => {
  try {
    const pool = await getPool();
    const r = await pool.request()
      .input('id', sql.Int, req.params.id)
      .query(`
        UPDATE dbo.Bookings
        SET status = N'Chờ xử lý', cancel_reason = NULL
        WHERE booking_id = @id AND status = N'Chờ hủy'
      `);

    if (r.rowsAffected[0] === 0)
      return res.status(400).json({ success: false, message: 'Không tìm thấy yêu cầu hủy' });

    res.json({ success: true, message: 'Đã từ chối yêu cầu hủy vé' });
  } catch (err) {
    console.error('rejectCancel error:', err);
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
};

module.exports = {
  getBookings,
  approveBooking, rejectBooking, cancelBooking, deleteBooking,
  approveCancel, rejectCancel,
};
