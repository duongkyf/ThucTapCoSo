const { sql, getPool } = require('../../../config/db');

// ── Services ──────────────────────────────────────────────────
const getServices = async (req, res) => {
  try {
    const { q, type, status } = req.query;
    const pool = await getPool();
    const request = pool.request();
    let where = 'WHERE 1=1';
    if (q) {
      request.input('q', sql.NVarChar, `%${q}%`);
      where += ` AND service_name LIKE @q`;
    }
    if (type) {
      request.input('type', sql.NVarChar, type);
      where += ` AND type = @type`;
    }
    if (status) {
      request.input('status', sql.NVarChar, status);
      where += ` AND status = @status`;
    }
    const result = await request.query(`SELECT * FROM dbo.Services ${where} ORDER BY type, service_name`);
    res.json({ success: true, data: result.recordset });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
};

const createService = async (req, res) => {
  try {
    const { service_name, type, price, description, status } = req.body;
    const pool = await getPool();
    const result = await pool.request()
      .input('service_name', sql.NVarChar, service_name)
      .input('type',         sql.NVarChar, type)
      .input('price',        sql.Decimal,  Number(price))
      .input('description',  sql.NVarChar, description || null)
      .input('status',       sql.NVarChar, status || 'Active')
      .query(`
        INSERT INTO dbo.Services (service_name, type, price, description, status)
        OUTPUT INSERTED.*
        VALUES (@service_name, @type, @price, @description, @status)
      `);
    res.status(201).json({ success: true, data: result.recordset[0] });
  } catch (err) {
    console.error('createService error:', err.message);
    res.status(500).json({ success: false, message: err.message });
  }
};

const updateService = async (req, res) => {
  try {
    const { service_name, type, price, description, status } = req.body;
    const pool = await getPool();
    await pool.request()
      .input('id',           sql.Int,      req.params.id)
      .input('service_name', sql.NVarChar, service_name)
      .input('type',         sql.NVarChar, type)
      .input('price',        sql.Decimal,  Number(price))
      .input('description',  sql.NVarChar, description || null)
      .input('status',       sql.NVarChar, status)
      .query(`
        UPDATE dbo.Services
        SET service_name=@service_name, type=@type,
            price=@price, description=@description, status=@status
        WHERE service_id=@id
      `);
    res.json({ success: true, message: 'Cập nhật thành công' });
  } catch (err) {
    console.error('updateService error:', err.message);
    res.status(500).json({ success: false, message: err.message });
  }
};

const deleteService = async (req, res) => {
  try {
    const pool = await getPool();
    await pool.request()
      .input('id', sql.Int, req.params.id)
      .query(`DELETE FROM dbo.Services WHERE service_id=@id`);
    res.json({ success: true, message: 'Đã xóa' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
};

module.exports = { getServices, createService, updateService, deleteService };
