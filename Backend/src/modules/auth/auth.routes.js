const { Router } = require('express');
const { body, validationResult } = require('express-validator');
const { authenticate } = require('../../middleware/auth');
const ctrl = require('./auth.controller');

const router = Router();

// ── Validation middleware ─────────────────────────────────────
const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty())
    return res.status(400).json({ success: false, errors: errors.array() });
  next();
};

const registerRules = [
  body('username').trim().notEmpty().withMessage('Tên không được để trống'),
  body('email').isEmail().normalizeEmail().withMessage('Email không hợp lệ'),
  body('password').isLength({ min: 6 }).withMessage('Mật khẩu tối thiểu 6 ký tự'),
];

const loginRules = [
  body('email').isEmail().normalizeEmail(),
  body('password').notEmpty(),
];

const passwordRules = [
  body('current_password').notEmpty().withMessage('Nhập mật khẩu hiện tại'),
  body('new_password').isLength({ min: 6 }).withMessage('Mật khẩu mới tối thiểu 6 ký tự'),
];

// ── Routes ────────────────────────────────────────────────────
// POST /api/auth/register
router.post('/register', registerRules, validate, ctrl.register);

// POST /api/auth/login
router.post('/login', loginRules, validate, ctrl.login);

// GET  /api/auth/me      (require login)
router.get('/me', authenticate, ctrl.getMe);

// PUT  /api/auth/profile (require login)
router.put('/profile', authenticate, ctrl.updateProfile);

// PUT  /api/auth/password (require login)
router.put('/password', authenticate, passwordRules, validate, ctrl.changePassword);

module.exports = router;
