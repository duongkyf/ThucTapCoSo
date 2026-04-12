const jwt = require('jsonwebtoken');

// ── Bắt buộc đăng nhập ────────────────────────────────────────
const authenticate = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer <token>

  if (!token)
    return res.status(401).json({ success: false, message: 'Không có token xác thực' });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ success: false, message: 'Token không hợp lệ hoặc đã hết hạn' });
  }
};

// ── Đăng nhập không bắt buộc (guest vẫn qua được) ────────────
const optionalAuth = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) return next(); // không có token → bỏ qua, tiếp tục

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
  } catch {
    // token lỗi → coi như chưa đăng nhập, không throw
  }
  next();
};

// ── Kiểm tra role ─────────────────────────────────────────────
const authorizeRoles = (...roles) => (req, res, next) => {
  if (!roles.includes(req.user?.role))
    return res.status(403).json({ success: false, message: 'Bạn không có quyền thực hiện hành động này' });
  next();
};

module.exports = { authenticate, optionalAuth, authorizeRoles };