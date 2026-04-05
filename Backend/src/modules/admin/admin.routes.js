const { Router } = require('express');
const { authenticate, authorizeRoles } = require('../../middleware/auth');
const ctrl = require('./admin.controller');

const router  = Router();
const isAdmin = [authenticate, authorizeRoles('admin')];

// GET /api/admin/stats
router.get('/stats', isAdmin, ctrl.getStats);

// ── Flights ───────────────────────────────────────────────────
router.get   ('/flights',     isAdmin, ctrl.getFlights);
router.post  ('/flights',     isAdmin, ctrl.createFlight);
router.put   ('/flights/:id', isAdmin, ctrl.updateFlight);
router.delete('/flights/:id', isAdmin, ctrl.deleteFlight);

// ── Aircrafts ─────────────────────────────────────────────────
router.get   ('/aircrafts',     isAdmin, ctrl.getAircrafts);
router.post  ('/aircrafts',     isAdmin, ctrl.createAircraft);
router.put   ('/aircrafts/:id', isAdmin, ctrl.updateAircraft);
router.delete('/aircrafts/:id', isAdmin, ctrl.deleteAircraft);

// ── Airports ──────────────────────────────────────────────────
router.get   ('/airports',     isAdmin, ctrl.getAirports);
router.post  ('/airports',     isAdmin, ctrl.createAirport);
router.put   ('/airports/:id', isAdmin, ctrl.updateAirport);
router.delete('/airports/:id', isAdmin, ctrl.deleteAirport);

// ── Services ──────────────────────────────────────────────────
router.get   ('/services',     isAdmin, ctrl.getServices);
router.post  ('/services',     isAdmin, ctrl.createService);
router.put   ('/services/:id', isAdmin, ctrl.updateService);
router.delete('/services/:id', isAdmin, ctrl.deleteService);

// ── Bookings ──────────────────────────────────────────────────
router.get   ('/bookings',                    isAdmin, ctrl.getBookings);
router.patch ('/bookings/:id/approve-cancel', isAdmin, ctrl.approveCancel); // duyệt yêu cầu hủy
router.patch ('/bookings/:id/reject-cancel',  isAdmin, ctrl.rejectCancel);  // từ chối yêu cầu hủy
router.delete('/bookings/:id',                isAdmin, ctrl.deleteBooking);  // soft delete

// ── Airlines ──────────────────────────────────────────────────
router.get   ('/airlines',     isAdmin, ctrl.getAirlines);
router.post  ('/airlines',     isAdmin, ctrl.createAirline);
router.put   ('/airlines/:id', isAdmin, ctrl.updateAirline);
router.delete('/airlines/:id', isAdmin, ctrl.deleteAirline);

// ── Customers ─────────────────────────────────────────────────
router.get   ('/customers',           isAdmin, ctrl.getCustomers);
router.patch ('/customers/:id/ban',   isAdmin, ctrl.banCustomer);
router.patch ('/customers/:id/unban', isAdmin, ctrl.unbanCustomer);

module.exports = router;