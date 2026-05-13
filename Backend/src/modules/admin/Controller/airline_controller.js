const { sql, getPool } = require('../../../config/db');

// ── Airlines ──────────────────────────────────────────────────
const getAirlines = async (req, res) => {
  try {
    const { q } = req.query;
    const pool = await getPool();
    const request = pool.request();
    let where = '';
    if (q) {
      request.input('q', sql.NVarChar, `%${q}%`);
      where = `WHERE airline_name LIKE @q OR airline_code LIKE @q`;
    }
    const result = await request.query(`SELECT * FROM dbo.Airlines ${where} ORDER BY airline_name`);
    res.json({ success: true, data: result.recordset });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
};

const createAirline = async (req, res) => {
  try {
    const { airline_name, airline_code, logo_url } = req.body;
    const pool = await getPool();
    const result = await pool.request()
      .input('airline_name', sql.NVarChar, airline_name)
      .input('airline_code', sql.NVarChar, airline_code)
      .input('logo_url',     sql.NVarChar, logo_url || null)
      .query(`INSERT INTO dbo.Airlines (airline_name, airline_code, logo_url) OUTPUT INSERTED.* VALUES (@airline_name, @airline_code, @logo_url)`);
    res.status(201).json({ success: true, data: result.recordset[0] });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
};

const updateAirline = async (req, res) => {
  try {
    const { airline_name, airline_code, logo_url } = req.body;
    const pool = await getPool();
    await pool.request()
      .input('id',           sql.Int,      req.params.id)
      .input('airline_name', sql.NVarChar, airline_name)
      .input('airline_code', sql.NVarChar, airline_code)
      .input('logo_url',     sql.NVarChar, logo_url || null)
      .query(`UPDATE dbo.Airlines SET airline_name=@airline_name, airline_code=@airline_code, logo_url=@logo_url WHERE airline_id=@id`);
    res.json({ success: true, message: 'Cập nhật thành công' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
};

const deleteAirline = async (req, res) => {
  try {
    const pool = await getPool();
    await pool.request()
      .input('id', sql.Int, req.params.id)
      .query(`DELETE FROM dbo.Airlines WHERE airline_id=@id`);
    res.json({ success: true, message: 'Đã xóa' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
};

module.exports = { getAirlines, createAirline, updateAirline, deleteAirline };
