const { sql, getPool } = require('../../../config/db');

// ── Airports ──────────────────────────────────────────────────
const getAirports = async (req, res) => {
  try {
    const { q } = req.query;
    const pool = await getPool();
    const request = pool.request();
    let where = '';
    if (q) {
      request.input('q', sql.NVarChar, `%${q}%`);
      where = `WHERE airport_id LIKE @q OR name LIKE @q OR city LIKE @q OR country LIKE @q`;
    }
    const result = await request.query(`SELECT * FROM dbo.Airports ${where} ORDER BY city`);
    res.json({ success: true, data: result.recordset });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
};

const createAirport = async (req, res) => {
  try {
    console.log('Body nhận được:', req.body); // ← thêm dòng này
    const { airport_id, name, city, country } = req.body;

    if (!airport_id || !name || !city || !country) {
      return res.status(400).json({ success: false, message: 'Thiếu thông tin bắt buộc' });
    }

    const pool = await getPool();
    const result = await pool.request()
      .input('airport_id', sql.Char(3),    airport_id.toUpperCase())  // ← thêm độ dài Char(3)
      .input('name',       sql.NVarChar(255), name)
      .input('city',       sql.NVarChar(100), city)
      .input('country',    sql.NVarChar(100), country)
      .query(`INSERT INTO dbo.Airports (airport_id, name, city, country) OUTPUT INSERTED.* VALUES (@airport_id, @name, @city, @country)`);

    res.status(201).json({ success: true, data: result.recordset[0] });
  } catch (err) {
    console.error('createAirport error:', err.message); // ← xem lỗi chi tiết
    res.status(500).json({ success: false, message: err.message });
  }
};

const updateAirport = async (req, res) => {
  try {
    const { name, city, country } = req.body;
    const pool = await getPool();
    await pool.request()
      .input('id',      sql.Char,     req.params.id)
      .input('name',    sql.NVarChar, name)
      .input('city',    sql.NVarChar, city)
      .input('country', sql.NVarChar, country)
      .query(`UPDATE dbo.Airports SET name=@name, city=@city, country=@country WHERE airport_id=@id`);
    res.json({ success: true, message: 'Cập nhật thành công' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
};

const deleteAirport = async (req, res) => {
  try {
    const pool = await getPool();
    await pool.request()
      .input('id', sql.Char, req.params.id)
      .query(`DELETE FROM dbo.Airports WHERE airport_id=@id`);
    res.json({ success: true, message: 'Đã xóa' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
};

module.exports = { getAirports, createAirport, updateAirport, deleteAirport };
