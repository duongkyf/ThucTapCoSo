const { Router } = require('express');
const { authenticate, optionalAuth } = require('../../middleware/auth');
const ctrl = require('./bookings.controller');

const router = Router();

// POST /api/bookings/lookup   — tra cứu booking (ref trong body)
router.post('/lookup', ctrl.lookup);

// GET  /api/bookings/lookup/:ref — tra cứu booking (ref trong URL) ← THÊM DÒNG NÀY
router.get('/lookup/:ref', ctrl.lookup);

// POST /api/bookings/checkin
router.post('/checkin', ctrl.checkin);

// POST /api/bookings
router.post('/', optionalAuth, ctrl.create);

// GET  /api/bookings
router.get('/', authenticate, ctrl.getMyBookings);

// GET  /api/bookings/:id
router.get('/:id', authenticate, ctrl.getById);

// PATCH /api/bookings/:id/request-cancel
router.patch('/:id/request-cancel', authenticate, ctrl.requestCancel);

module.exports = router;