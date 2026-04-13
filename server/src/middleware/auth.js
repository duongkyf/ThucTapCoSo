const jwt = require('jsonwebtoken');

// ── Bắt buộc đăng nhập ────────────────────────────────────────
const authenticate = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer <token>
  if (!token)
    return res.status(401).json({ success: false, message: 'Không có token xác thực' });
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded; // { user_id, role, airline_id }
    next();
  } catch (err) {
    return res.status(401).json({ success: false, message: 'Token không hợp lệ hoặc đã hết hạn' });
  }
};

// ── Đăng nhập không bắt buộc (guest vẫn qua được) ────────────
const optionalAuth = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return next();
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
  } catch {
    // token lỗi → coi như chưa đăng nhập
  }
  next();
};

// ── Kiểm tra role (dùng như cũ, giữ tương thích) ─────────────
const authorizeRoles = (...roles) => (req, res, next) => {
  if (!roles.includes(req.user?.role))
    return res.status(403).json({ success: false, message: 'Bạn không có quyền thực hiện hành động này' });
  next();
};

// ── Yêu cầu role cụ thể (alias rõ ràng hơn) ──────────────────
// Dùng: requireRole('SUPER_ADMIN') hoặc requireRole('SUPER_ADMIN', 'AIRLINE_ADMIN')
const requireRole = (...roles) => (req, res, next) => {
  if (!req.user)
    return res.status(401).json({ success: false, message: 'Chưa xác thực' });
  if (!roles.includes(req.user.role))
    return res.status(403).json({ success: false, message: 'Bạn không có quyền thực hiện hành động này' });
  next();
};

// ── Kiểm tra quyền truy cập airline ──────────────────────────
// SUPER_ADMIN: pass qua
// AIRLINE_ADMIN: chỉ truy cập đúng airline_id của mình
// Lấy airline_id từ: req.params.airline_id, req.body.airline_id, hoặc req.query.airline_id
const requireAirlineAccess = (req, res, next) => {
  if (!req.user)
    return res.status(401).json({ success: false, message: 'Chưa xác thực' });

  // SUPER_ADMIN bypass tất cả
  if (req.user.role === 'SUPER_ADMIN') return next();

  // AIRLINE_ADMIN: kiểm tra airline_id khớp
  if (req.user.role === 'AIRLINE_ADMIN') {
    const requestedAirlineId =
      parseInt(req.params.airline_id) ||
      parseInt(req.body.airline_id)   ||
      parseInt(req.query.airline_id);

    if (requestedAirlineId && requestedAirlineId !== req.user.airline_id) {
      return res.status(403).json({
        success: false,
        message: 'Bạn chỉ có thể quản lý dữ liệu của hãng hàng không mình',
      });
    }
    return next();
  }

  // Các role khác (USER) không có quyền
  return res.status(403).json({ success: false, message: 'Bạn không có quyền thực hiện hành động này' });
};

// ── Middleware tổng hợp sẵn để dùng trong routes ─────────────
// Dùng: isSuperAdmin, isAnyAdmin trong route files
const isSuperAdmin  = [authenticate, requireRole('SUPER_ADMIN')];
const isAnyAdmin    = [authenticate, requireRole('SUPER_ADMIN', 'AIRLINE_ADMIN')];

module.exports = {
  authenticate,
  optionalAuth,
  authorizeRoles,   // giữ cho tương thích ngược
  requireRole,
  requireAirlineAccess,
  isSuperAdmin,
  isAnyAdmin,
};