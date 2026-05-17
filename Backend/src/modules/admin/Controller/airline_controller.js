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
      where = `WHERE a.airline_name LIKE @q OR a.airline_code LIKE @q`;
    }
    const result = await request.query(`
      SELECT
        a.airline_id,
        a.airline_code,
        a.airline_name,
        a.country,
        a.logo_url,
        a.status,
        COUNT(DISTINCT f.flight_id)    AS flight_count,
        COUNT(DISTINCT ac.aircraft_id) AS aircraft_count
      FROM dbo.Airlines a
      LEFT JOIN dbo.Flights   f  ON f.airline_id  = a.airline_id
      LEFT JOIN dbo.Aircrafts ac ON ac.airline_id = a.airline_id
      ${where}
      GROUP BY
        a.airline_id, a.airline_code, a.airline_name,
        a.country, a.logo_url, a.status
      ORDER BY a.airline_name
    `);
    res.json({ success: true, data: result.recordset });
  } catch (err) {
    console.error('getAirlines error:', err);
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
};

const createAirline = async (req, res) => {
  try {
    const { airline_name, airline_code, logo_url, country } = req.body;
    const pool = await getPool();
    const result = await pool.request()
      .input('airline_name', sql.NVarChar, airline_name)
      .input('airline_code', sql.NVarChar, airline_code)
      .input('logo_url',     sql.NVarChar, logo_url || null)
      .input('country',      sql.NVarChar, country  || null)
      .query(`INSERT INTO dbo.Airlines (airline_name, airline_code, logo_url, country)
              OUTPUT INSERTED.*
              VALUES (@airline_name, @airline_code, @logo_url, @country)`);
    res.status(201).json({ success: true, data: result.recordset[0] });
  } catch (err) {
    console.error('createAirline error:', err);
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
};

const updateAirline = async (req, res) => {
  try {
    const { airline_name, airline_code, logo_url, country } = req.body;
    const pool = await getPool();
    await pool.request()
      .input('id',           sql.Int,      req.params.id)
      .input('airline_name', sql.NVarChar, airline_name)
      .input('airline_code', sql.NVarChar, airline_code)
      .input('logo_url',     sql.NVarChar, logo_url || null)
      .input('country',      sql.NVarChar, country  || null)
      .query(`UPDATE dbo.Airlines
              SET airline_name=@airline_name, airline_code=@airline_code,
                  logo_url=@logo_url, country=@country
              WHERE airline_id=@id`);
    res.json({ success: true, message: 'Cập nhật thành công' });
  } catch (err) {
    console.error('updateAirline error:', err);
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
    console.error('deleteAirline error:', err);
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
};

module.exports = { getAirlines, createAirline, updateAirline, deleteAirline };