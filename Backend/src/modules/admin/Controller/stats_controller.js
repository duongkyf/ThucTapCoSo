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

// ─── Doanh thu theo tháng ─────────────────────────────────────
const getMonthlyStats = async (req, res) => {
  try {
    const year = parseInt(req.query.year, 10) || new Date().getFullYear();
    const pool = await getPool();

    const request = pool.request().input('year', sql.Int, year);

    // Nếu là AIRLINE_ADMIN → chỉ lấy doanh thu của hãng mình
    const role      = req.user?.role;
    const airlineId = req.user?.airline_id;

    let whereAirline = '';
    if (role === 'AIRLINE_ADMIN' && airlineId) {
      request.input('airline_id', sql.Int, airlineId);
      whereAirline = `
        AND EXISTS (
          SELECT 1 FROM dbo.Tickets t
          JOIN dbo.Flights f ON t.flight_id = f.flight_id
          WHERE t.booking_id = b.booking_id
            AND f.airline_id = @airline_id
        )
      `;
    }

    const result = await request.query(`
      SELECT
        FORMAT(b.booking_date, 'yyyy-MM') AS month,
        ISNULL(SUM(b.total_amount), 0)    AS revenue
      FROM dbo.Bookings b
      WHERE b.status      = N'Thành công'
        AND YEAR(b.booking_date) = @year
        ${whereAirline}
      GROUP BY FORMAT(b.booking_date, 'yyyy-MM')
      ORDER BY month ASC
    `);

    res.json({ success: true, data: result.recordset });
  } catch (err) {
    console.error('getMonthlyStats error:', err);
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
};

module.exports = { getStats, getMonthlyStats };