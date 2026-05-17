const { Router } = require('express');
const ctrl = require('./flights.controller');

const router = Router();

router.get('/search',     ctrl.search);
router.post('/ai-search', ctrl.aiSearch);
router.get('/airports',   ctrl.getAirports);
router.get('/services',   ctrl.getServices);
router.get('/:id/seats',  ctrl.getSeats);
router.get('/:id',        ctrl.getById);

module.exports = router;