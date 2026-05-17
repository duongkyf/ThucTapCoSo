const { sql, getPool } = require('../../../config/db');

// ── Aircrafts ─────────────────────────────────────────────────
const getAircrafts = async (req, res) => {
  try {
    const { q } = req.query;
    const pool    = await getPool();
    const request = pool.request();

    const isStaff   = req.user?.role === 'AIRLINE_ADMIN';
    const airlineId = req.user?.airline_id;

    const conditions = [];

    // AIRLINE_ADMIN chỉ thấy máy bay của hãng mình
    if (isStaff && airlineId) {
      request.input('airline_id', sql.Int, airlineId);
      conditions.push('ac.airline_id = @airline_id');
    }

    if (q) {
      request.input('q', sql.NVarChar, `%${q}%`);
      conditions.push('(ac.model_name LIKE @q OR al.airline_name LIKE @q)');
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const result = await request.query(`
      SELECT ac.*, al.airline_name, al.airline_code, al.logo_url AS airline_logo
      FROM dbo.Aircrafts ac
      LEFT JOIN dbo.Airlines al ON ac.airline_id = al.airline_id
      ${where}
      ORDER BY ac.model_name
    `);
    res.json({ success: true, data: result.recordset });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
};

const createAircraft = async (req, res) => {
  try {
    console.log('Body nhận được:', req.body);
    const { model_name, manufacturer, total_seats, status, airline_id } = req.body;

    const pool = await getPool();
    await pool.request()
      .input('airline_id',   sql.Int,      Number(airline_id))
      .input('model_name',   sql.NVarChar, model_name)
      .input('manufacturer', sql.NVarChar, manufacturer)
      .input('total_seats',  sql.Int,      Number(total_seats))
      .input('status',       sql.NVarChar, status || 'Active')
      .query(`
        INSERT INTO dbo.Aircrafts (airline_id, model_name, manufacturer, total_seats, status)
        VALUES (@airline_id, @model_name, @manufacturer, @total_seats, @status)
      `);

    res.json({ success: true, message: 'Thêm máy bay thành công' });
  } catch (err) {
    console.error('createAircraft error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
};

const updateAircraft = async (req, res) => {
  try {
    const { model_name, total_seats, airline_id } = req.body;
    const pool = await getPool();
    await pool.request()
      .input('id',          sql.Int,      req.params.id)
      .input('model_name',  sql.NVarChar, model_name)
      .input('total_seats', sql.Int,      total_seats)
      .input('airline_id',  sql.Int,      airline_id || null)
      .query(`UPDATE dbo.Aircrafts SET model_name=@model_name, total_seats=@total_seats, airline_id=@airline_id WHERE aircraft_id=@id`);
    res.json({ success: true, message: 'Cập nhật thành công' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
};

const deleteAircraft = async (req, res) => {
  try {
    const pool = await getPool();
    await pool.request()
      .input('id', sql.Int, req.params.id)
      .query(`DELETE FROM dbo.Aircrafts WHERE aircraft_id=@id`);
    res.json({ success: true, message: 'Đã xóa' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
};

module.exports = { getAircrafts, createAircraft, updateAircraft, deleteAircraft };