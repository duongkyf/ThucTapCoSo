const { Router } = require('express');
const { authenticate, optionalAuth } = require('../../middleware/auth');
const ctrl = require('./bookings.controller');

const router = Router();

// POST /api/bookings/checkin  — check-in KHÔNG cần login
router.post('/checkin', ctrl.checkin);

// POST /api/bookings          — tạo đặt vé (không cần login)
router.post('/', optionalAuth, ctrl.create);

// GET  /api/bookings          — lịch sử đặt vé
router.get('/', authenticate, ctrl.getMyBookings);

// GET  /api/bookings/:id      — chi tiết đặt vé
router.get('/:id', authenticate, ctrl.getById);

// PATCH /api/bookings/:id/request-cancel — user gửi yêu cầu hủy kèm lý do
router.patch('/:id/request-cancel', authenticate, ctrl.requestCancel);

module.exports = router;