const bcrypt  = require('bcryptjs');
const jwt     = require('jsonwebtoken');
const { sql, getPool } = require('../../config/db');

// ── Helpers ───────────────────────────────────────────────────
const signToken = (payload) =>
  jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || '7d' });

const safeUser = (u) => ({
  user_id:      u.user_id,
  username:     u.username,
  email:        u.email,
  phone_number: u.phone_number,
  id_number:    u.id_number,
  role:         u.role,
  status:       u.status,
  airline_id:   u.airline_id ?? null,
  created_at:   u.created_at,
});

// ── Register ──────────────────────────────────────────────────
const register = async (req, res) => {
  try {
    const { username, email, password, phone_number, id_number } = req.body;

    const pool = await getPool();

    const exists = await pool.request()
      .input('email', sql.NVarChar, email)
      .query('SELECT user_id FROM dbo.Users WHERE email = @email');

    if (exists.recordset.length > 0)
      return res.status(409).json({ success: false, message: 'Email đã được sử dụng' });

    const hash = await bcrypt.hash(password, 10);

    const result = await pool.request()
      .input('username',      sql.NVarChar, username)
      .input('password_hash', sql.NVarChar, hash)
      .input('email',         sql.NVarChar, email)
      .input('phone_number',  sql.NVarChar, phone_number || null)
      .input('id_number',     sql.NVarChar, id_number    || null)
      .query(`
        INSERT INTO dbo.Users (username, password_hash, email, phone_number, id_number)
        OUTPUT INSERTED.user_id, INSERTED.username, INSERTED.email,
               INSERTED.phone_number, INSERTED.id_number, INSERTED.role,
               INSERTED.status, INSERTED.airline_id, INSERTED.created_at
        VALUES (@username, @password_hash, @email, @phone_number, @id_number)
      `);

    const user  = result.recordset[0];
    const token = signToken({
      user_id:    user.user_id,
      role:       user.role,
      airline_id: user.airline_id ?? null,
    });

    res.status(201).json({ success: true, token, user: safeUser(user) });
  } catch (err) {
    console.error('register error:', err);
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
};

// ── Login ─────────────────────────────────────────────────────
const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    const pool   = await getPool();
    const result = await pool.request()
      .input('email', sql.NVarChar, email)
      .query('SELECT * FROM dbo.Users WHERE email = @email');

    const user = result.recordset[0];
    if (!user)
      return res.status(401).json({ success: false, message: 'Email hoặc mật khẩu không đúng' });

    if (user.status === 'banned')
      return res.status(403).json({ success: false, message: 'Tài khoản đã bị khóa' });

    const match = await bcrypt.compare(password, user.password_hash);
    if (!match)
      return res.status(401).json({ success: false, message: 'Email hoặc mật khẩu không đúng' });

    const token = signToken({
      user_id:    user.user_id,
      role:       user.role,
      airline_id: user.airline_id ?? null,
    });

    res.json({ success: true, token, user: safeUser(user) });
  } catch (err) {
    console.error('login error:', err);
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
};

// ── Get current user ──────────────────────────────────────────
const getMe = async (req, res) => {
  try {
    const pool   = await getPool();
    const result = await pool.request()
      .input('id', sql.Int, req.user.user_id)
      .query('SELECT * FROM dbo.Users WHERE user_id = @id');

    const user = result.recordset[0];
    if (!user)
      return res.status(404).json({ success: false, message: 'Không tìm thấy người dùng' });

    res.json({ success: true, user: safeUser(user) });
  } catch (err) {
    console.error('getMe error:', err);
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
};

// ── Update profile ────────────────────────────────────────────
// FIX: removed date_of_birth — column does not exist in dbo.Users.
// To re-enable: ALTER TABLE dbo.Users ADD date_of_birth DATE NULL;
// then add back: .input('dob', sql.Date, date_of_birth || null)
// and in SET: date_of_birth = @dob,
const updateProfile = async (req, res) => {
  try {
    const { username, phone_number, id_number } = req.body;
    const pool = await getPool();

    await pool.request()
      .input('id',           sql.Int,      req.user.user_id)
      .input('username',     sql.NVarChar, username      || null)
      .input('phone_number', sql.NVarChar, phone_number  || null)
      .input('id_number',    sql.NVarChar, id_number     || null)
      .query(`
        UPDATE dbo.Users
        SET username     = @username,
            phone_number = @phone_number,
            id_number    = @id_number
        WHERE user_id = @id
      `);

    res.json({ success: true, message: 'Cập nhật thông tin thành công' });
  } catch (err) {
    console.error('updateProfile error:', err);
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
};

// ── Change password ───────────────────────────────────────────
const changePassword = async (req, res) => {
  try {
    const { current_password, new_password } = req.body;
    if (!current_password || !new_password)
      return res.status(400).json({ success: false, message: 'Thiếu thông tin mật khẩu' });

    const pool = await getPool();

    const result = await pool.request()
      .input('id', sql.Int, req.user.user_id)
      .query('SELECT password_hash FROM dbo.Users WHERE user_id = @id');

    const user = result.recordset[0];
    if (!user)
      return res.status(404).json({ success: false, message: 'Không tìm thấy người dùng' });

    const match = await bcrypt.compare(current_password, user.password_hash);
    if (!match)
      return res.status(400).json({ success: false, message: 'Mật khẩu hiện tại không đúng' });

    const hash = await bcrypt.hash(new_password, 10);
    await pool.request()
      .input('id',   sql.Int,      req.user.user_id)
      .input('hash', sql.NVarChar, hash)
      .query('UPDATE dbo.Users SET password_hash = @hash WHERE user_id = @id');

    res.json({ success: true, message: 'Đổi mật khẩu thành công' });
  } catch (err) {
    console.error('changePassword error:', err);
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
};

module.exports = { register, login, getMe, updateProfile, changePassword };