const { sql, getPool } = require('../../../config/db');

const getStats = async (req, res) => {
  try {
    const pool = await getPool();

    const [s, r] = await Promise.all([
      pool.request().query(`
        SELECT
          (SELECT COUNT(*) FROM dbo.Users    WHERE role != 'admin')          AS total_customers,
          (SELECT COUNT(*) FROM dbo.Flights  WHERE status != 'Cancelled')    AS total_flights,
          (SELECT COUNT(*) FROM dbo.Bookings)                                AS total_bookings,
          (SELECT COUNT(*) FROM dbo.Bookings WHERE status = N'Thành công')   AS success_bookings,
          (SELECT COUNT(*) FROM dbo.Bookings WHERE status = N'Chờ xử lý')   AS pending_bookings,
          (SELECT COUNT(*) FROM dbo.Bookings WHERE status = N'Chờ hủy')     AS canceling_bookings,
          (SELECT COUNT(*) FROM dbo.Bookings WHERE status = N'Đã hủy')      AS canceled_bookings,
          (SELECT ISNULL(SUM(total_amount),0) FROM dbo.Bookings WHERE status = N'Thành công') AS total_revenue
      `),
      pool.request().query(`
        SELECT CAST(booking_date AS DATE) AS date, ISNULL(SUM(total_amount),0) AS revenue
        FROM dbo.Bookings
        WHERE status = N'Thành công'
          AND booking_date >= DATEADD(DAY,-6, CAST(GETDATE() AS DATE))
        GROUP BY CAST(booking_date AS DATE)
        ORDER BY date ASC
      `),
    ]);

    const d = s.recordset[0];

    const revenueMap = Object.fromEntries(
      r.recordset.map(x => [new Date(x.date).toISOString().split('T')[0], Number(x.revenue)])
    );

    const daily = Array.from({ length: 7 }, (_, i) => {
      const day = new Date();
      day.setDate(day.getDate() - 6 + i);
      const date = day.toISOString().split('T')[0];
      return { date, revenue: revenueMap[date] || 0 };
    });

    res.json({ success: true, data: {
      revenue:  { total: d.total_revenue, daily },
      users:    { total: d.total_customers, active: d.total_customers },
      bookings: {
        total:     d.total_bookings,
        success:   d.success_bookings,
        pending:   d.pending_bookings,
        canceling: d.canceling_bookings,
        canceled:  d.canceled_bookings,
      },
    }});
  } catch (err) {
    console.error('getStats error:', err);
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
};

module.exports = { getStats };