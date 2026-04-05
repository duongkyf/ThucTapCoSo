const { sql, getPool } = require('../../config/db');

// ── Generate booking ref ──────────────────────────────────────
const genRef = () => 'BK-' + Math.random().toString(36).substring(2, 7).toUpperCase();

// ── Create booking ────────────────────────────────────────────
const create = async (req, res) => {
  try {
    const { flight_id, passengers, services, contact } = req.body;

    if (!flight_id || !passengers?.length)
      return res.status(400).json({ success: false, message: 'Thiếu thông tin đặt vé' });

    const pool = await getPool();

    // Xác định user_id — nếu chưa đăng nhập thì dùng guest account
    let user_id = req.user?.user_id || null;
    if (!user_id) {
      // Tìm hoặc tạo guest user
      const guestEmail = 'guest@skybooker.vn';
      const guestRes = await pool.request()
        .input('email', sql.NVarChar, guestEmail)
        .query('SELECT user_id FROM dbo.Users WHERE email = @email');
      if (guestRes.recordset[0]) {
        user_id = guestRes.recordset[0].user_id;
      } else {
        const newGuest = await pool.request()
          .input('email', sql.NVarChar, guestEmail)
          .query(`INSERT INTO dbo.Users (username, password_hash, email, role)
                  OUTPUT INSERTED.user_id
                  VALUES (N'Khách', 'N/A', @email, 'user')`);
        user_id = newGuest.recordset[0].user_id;
      }
    }

    // Kiểm tra chuyến bay
    const flightRes = await pool.request()
      .input('fid', sql.Int, flight_id)
      .query(`SELECT * FROM dbo.Flights WHERE flight_id = @fid AND status != 'Cancelled'`);
    if (!flightRes.recordset[0])
      return res.status(404).json({ success: false, message: 'Chuyến bay không tồn tại' });

    const flight = flightRes.recordset[0];

    // Tính tổng tiền
    let total = 0;
    passengers.forEach((p) => { total += Number(p.ticket_price || flight.base_price); });
    if (services?.length) {
      for (const sv of services) { total += Number(sv.price || 0) * Number(sv.quantity || 1); }
    }

    // Tạo booking
    const ref = genRef();
    const bookingRes = await pool.request()
      .input('uid',   sql.Int,      user_id)
      .input('ref',   sql.NVarChar, ref)
      .input('total', sql.Decimal,  total)
      .input('cn',    sql.NVarChar, contact?.name  || null)
      .input('ce',    sql.NVarChar, contact?.email || null)
      .input('cp',    sql.NVarChar, contact?.phone || null)
      .query(`
        INSERT INTO dbo.Bookings (user_id, booking_ref, total_amount, contact_name, contact_email, contact_phone)
        OUTPUT INSERTED.booking_id, INSERTED.booking_ref
        VALUES (@uid, @ref, @total, @cn, @ce, @cp)
      `);

    const booking_id = bookingRes.recordset[0].booking_id;

    // Tạo tickets
    const classMap = { eco: 'economy', premium: 'economy', business: 'business', first: 'first' };
    const typeMap  = { adult: 'adult', child: 'child', infant: 'infant' };

    for (const [i, p] of passengers.entries()) {
      try {
        const cls  = classMap[p.class]  || classMap[p.ticket_class] || 'economy';
        const ptype = typeMap[p.passenger_type] || typeMap[p.type] || 'adult';
        const pname = (p.passenger_name || `${p.first_name || ''} ${p.last_name || ''}`.trim() || `Passenger ${i + 1}`).substring(0, 200);

        console.log('Inserting ticket:', { pname, ptype, cls, price: p.ticket_price });

        const ticketRes = await pool.request()
          .input('bid',  sql.Int,      booking_id)
          .input('fid',  sql.Int,      flight_id)
          .input('sid',  sql.Int,      null)
          .input('pn',   sql.NVarChar, pname)
          .input('pt',   sql.NVarChar, ptype)
          .input('ic',   sql.NVarChar, p.identity_card || null)
          .input('tp',   sql.Decimal,  Number(p.ticket_price) || Number(flight.base_price) || 0)
          .input('cls',  sql.NVarChar, cls)
          .query(`
            INSERT INTO dbo.Tickets (booking_id, flight_id, seat_id, passenger_name, passenger_type, identity_card, ticket_price, class)
            OUTPUT INSERTED.ticket_id
            VALUES (@bid, @fid, @sid, @pn, @pt, @ic, @tp, @cls)
          `);

        console.log('Ticket inserted:', ticketRes.recordset[0]);
      } catch (ticketErr) {
        console.error('TICKET INSERT ERROR:', ticketErr.message, '| Passenger:', JSON.stringify(p));
      }
    }

    res.status(201).json({
      success: true,
      message: 'Đặt vé thành công',
      data: { booking_id, booking_ref: ref, total_amount: total },
    });
  } catch (err) {
    console.error('create booking error:', err);
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
};

// ── Get booking history ───────────────────────────────────────
const getMyBookings = async (req, res) => {
  try {
    const pool = await getPool();
    const r = await pool.request()
      .input('uid', sql.Int, req.user.user_id)
      .query(`
        SELECT
          b.booking_id, b.booking_ref, b.booking_date, b.total_amount, b.status,
          f.flight_code, f.departure_time, f.arrival_time,
          src.city AS origin_city,  src.airport_id AS origin_iata,
          dst.city AS dest_city,    dst.airport_id AS dest_iata,
          COUNT(t.ticket_id) AS passenger_count
        FROM dbo.Bookings b
        JOIN dbo.Tickets  t   ON t.booking_id = b.booking_id
        JOIN dbo.Flights  f   ON t.flight_id  = f.flight_id
        JOIN dbo.Airports src ON f.source_airport_id      = src.airport_id
        JOIN dbo.Airports dst ON f.destination_airport_id = dst.airport_id
        WHERE b.user_id = @uid
        GROUP BY b.booking_id, b.booking_ref, b.booking_date, b.total_amount, b.status,
                 f.flight_code, f.departure_time, f.arrival_time,
                 src.city, src.airport_id, dst.city, dst.airport_id
        ORDER BY b.booking_date DESC
      `);
    res.json({ success: true, data: r.recordset });
  } catch (err) {
    console.error('getMyBookings error:', err);
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
};

// ── Get booking detail ────────────────────────────────────────
const getById = async (req, res) => {
  try {
    const pool = await getPool();
    const [booking, tickets] = await Promise.all([
      pool.request()
        .input('id',  sql.Int, req.params.id)
        .input('uid', sql.Int, req.user.user_id)
        .query(`
          SELECT b.*, f.flight_code, f.departure_time, f.arrival_time, f.base_price,
            src.name AS origin_name, src.city AS origin_city, src.airport_id AS origin_iata,
            dst.name AS dest_name,  dst.city AS dest_city,  dst.airport_id AS dest_iata,
            a.model_name
          FROM dbo.Bookings b
          JOIN dbo.Tickets  t   ON t.booking_id = b.booking_id
          JOIN dbo.Flights  f   ON t.flight_id  = f.flight_id
          JOIN dbo.Aircrafts a  ON f.aircraft_id = a.aircraft_id
          JOIN dbo.Airports src ON f.source_airport_id      = src.airport_id
          JOIN dbo.Airports dst ON f.destination_airport_id = dst.airport_id
          WHERE b.booking_id = @id AND b.user_id = @uid
        `),
      pool.request()
        .input('id', sql.Int, req.params.id)
        .query(`
          SELECT t.*, sm.seat_code,
            ts_agg.services
          FROM dbo.Tickets t
          LEFT JOIN dbo.SeatMaps sm ON t.seat_id = sm.seat_id
          OUTER APPLY (
            SELECT STRING_AGG(s.service_name + ' x' + CAST(ts.quantity AS VARCHAR), ', ') AS services
            FROM dbo.Ticket_Services ts
            JOIN dbo.Services s ON ts.service_id = s.service_id
            WHERE ts.ticket_id = t.ticket_id
          ) ts_agg
          WHERE t.booking_id = @id
        `),
    ]);

    if (!booking.recordset[0])
      return res.status(404).json({ success: false, message: 'Không tìm thấy đặt vé' });

    res.json({
      success: true,
      data: { ...booking.recordset[0], tickets: tickets.recordset },
    });
  } catch (err) {
    console.error('getById error:', err);
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
};

// ── Cancel booking ────────────────────────────────────────────
const cancel = async (req, res) => {
  try {
    const pool = await getPool();
    const r = await pool.request()
      .input('id',  sql.Int, req.params.id)
      .input('uid', sql.Int, req.user.user_id)
      .query(`
        UPDATE dbo.Bookings SET status = N'Đã hủy'
        WHERE booking_id = @id AND user_id = @uid AND status = N'Chờ xử lý'
      `);

    if (r.rowsAffected[0] === 0)
      return res.status(400).json({ success: false, message: 'Không thể hủy đặt vé này' });

    res.json({ success: true, message: 'Đã hủy đặt vé' });
  } catch (err) {
    console.error('cancel error:', err);
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
};

// ── Check-in ──────────────────────────────────────────────────
const checkin = async (req, res) => {
  try {
    const { booking_ref } = req.body;
    if (!booking_ref)
      return res.status(400).json({ success: false, message: 'Vui lòng nhập mã đặt chỗ' });

    const pool = await getPool();
    const r = await pool.request()
      .input('ref',  sql.NVarChar, booking_ref.toUpperCase())
      .query(`
        SELECT TOP 1 b.booking_id, b.booking_ref, b.status,
          f.flight_code, f.departure_time,
          src.city AS origin_city, src.airport_id AS origin_iata,
          dst.city AS dest_city,   dst.airport_id AS dest_iata,
          t.ticket_id, t.passenger_name, t.class, sm.seat_code,
          al.airline_name, al.airline_code, al.logo_url AS airline_logo
        FROM dbo.Bookings b
        JOIN dbo.Tickets  t   ON t.booking_id = b.booking_id
        JOIN dbo.Flights  f   ON t.flight_id  = f.flight_id
        JOIN dbo.Airports src ON f.source_airport_id      = src.airport_id
        JOIN dbo.Airports dst ON f.destination_airport_id = dst.airport_id
        LEFT JOIN dbo.SeatMaps sm ON t.seat_id = sm.seat_id
        LEFT JOIN dbo.Airlines al ON f.airline_id = al.airline_id
        WHERE b.booking_ref = @ref
      `);

    if (!r.recordset[0])
      return res.status(404).json({ success: false, message: 'Không tìm thấy thông tin đặt vé' });

    if (r.recordset[0].status === 'Đã hủy')
      return res.status(400).json({ success: false, message: 'Đặt vé đã bị hủy' });

    // Cập nhật trạng thái ticket → Đã check-in
    await pool.request()
      .input('tid', sql.Int, r.recordset[0].ticket_id)
      .query(`UPDATE dbo.Tickets SET status = N'Đã check-in' WHERE ticket_id = @tid`);

    // Cập nhật booking → Thành công
    await pool.request()
      .input('bid', sql.Int, r.recordset[0].booking_id)
      .query(`UPDATE dbo.Bookings SET status = N'Thành công' WHERE booking_id = @bid`);

    res.json({ success: true, message: 'Check-in thành công', data: r.recordset[0] });
  } catch (err) {
    console.error('checkin error:', err);
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
};


// ── Request cancel (user gửi yêu cầu hủy kèm lý do) ──────────
const requestCancel = async (req, res) => {
  try {
    const { reason } = req.body;
    if (!reason?.trim())
      return res.status(400).json({ success: false, message: 'Vui lòng nhập lý do hủy vé' });

    const pool = await getPool();
    const r = await pool.request()
      .input('id',     sql.Int,      req.params.id)
      .input('uid',    sql.Int,      req.user.user_id)
      .input('reason', sql.NVarChar, reason.trim())
      .query(`
        UPDATE dbo.Bookings
        SET status = N'Chờ hủy', cancel_reason = @reason
        WHERE booking_id = @id AND user_id = @uid AND status = N'Chờ xử lý'
      `);

    if (r.rowsAffected[0] === 0)
      return res.status(400).json({ success: false, message: 'Không thể gửi yêu cầu hủy cho vé này' });

    res.json({ success: true, message: 'Đã gửi yêu cầu hủy vé. Vui lòng chờ quản trị viên xác nhận.' });
  } catch (err) {
    console.error('requestCancel error:', err);
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
};

module.exports = { create, getMyBookings, getById, cancel, requestCancel, checkin };