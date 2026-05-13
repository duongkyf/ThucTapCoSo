const { Router } = require('express');
const ctrl = require('./flights.controller');

const router = Router();

// GET /api/flights/search?from=SGN&to=HAN&date=2026-04-01&passengers=1
router.get('/search',       ctrl.search);

// GET /api/flights/airports
router.get('/airports',     ctrl.getAirports);

// GET /api/flights/services
router.get('/services',     ctrl.getServices);

// GET /api/flights/:id
router.get('/:id',          ctrl.getById);

// GET /api/flights/:id/seats
router.get('/:id/seats',    ctrl.getSeats);

module.exports = router;
