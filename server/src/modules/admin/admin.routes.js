const { Router } = require('express');
const {
  authenticate,
  requireRole,
  requireAirlineAccess,
  isSuperAdmin,
  isAnyAdmin,
} = require('../../middleware/auth');
const ctrl   = require('./admin.controller');
const router = Router();

// Middleware cục bộ cho AIRLINE_ADMIN only
const isAirlineAdmin = [authenticate, requireRole('AIRLINE_ADMIN')];

// ── Stats ─────────────────────────────────────────────────────
// Cả 2 role đều gọi, controller tự filter theo role
router.get('/stats', isAnyAdmin, ctrl.getStats);

// ── Flights ───────────────────────────────────────────────────
// CHỈ AIRLINE_ADMIN
router.get   ('/flights',     isAirlineAdmin,                                ctrl.getFlights);
router.post  ('/flights',     [...isAirlineAdmin, requireAirlineAccess],     ctrl.createFlight);
router.put   ('/flights/:id', [...isAirlineAdmin, requireAirlineAccess],     ctrl.updateFlight);
router.delete('/flights/:id', [...isAirlineAdmin, requireAirlineAccess],     ctrl.deleteFlight);

// ── Aircrafts ─────────────────────────────────────────────────
// CHỈ AIRLINE_ADMIN
router.get   ('/aircrafts',     isAirlineAdmin,                              ctrl.getAircrafts);
router.post  ('/aircrafts',     [...isAirlineAdmin, requireAirlineAccess],   ctrl.createAircraft);
router.put   ('/aircrafts/:id', [...isAirlineAdmin, requireAirlineAccess],   ctrl.updateAircraft);
router.delete('/aircrafts/:id', [...isAirlineAdmin, requireAirlineAccess],   ctrl.deleteAircraft);

// ── Services ──────────────────────────────────────────────────
// CHỈ AIRLINE_ADMIN
router.get   ('/services',     isAirlineAdmin, ctrl.getServices);
router.post  ('/services',     isAirlineAdmin, ctrl.createService);
router.put   ('/services/:id', isAirlineAdmin, ctrl.updateService);
router.delete('/services/:id', isAirlineAdmin, ctrl.deleteService);

// ── Bookings ──────────────────────────────────────────────────
// CHỈ AIRLINE_ADMIN (xem/duyệt/từ chối hủy của chuyến bay hãng mình)
router.get   ('/bookings',                    isAirlineAdmin, ctrl.getBookings);
router.patch ('/bookings/:id/approve-cancel', isAirlineAdmin, ctrl.approveCancel);
router.patch ('/bookings/:id/reject-cancel',  isAirlineAdmin, ctrl.rejectCancel);
router.delete('/bookings/:id',                isSuperAdmin,   ctrl.deleteBooking); // xóa hẳn: chỉ SUPER_ADMIN

// ── Airports ──────────────────────────────────────────────────
// CHỈ SUPER_ADMIN
router.get   ('/airports',     isSuperAdmin, ctrl.getAirports);
router.post  ('/airports',     isSuperAdmin, ctrl.createAirport);
router.put   ('/airports/:id', isSuperAdmin, ctrl.updateAirport);
router.delete('/airports/:id', isSuperAdmin, ctrl.deleteAirport);

// ── Airlines ──────────────────────────────────────────────────
// CHỈ SUPER_ADMIN (tạo/sửa/xóa)
// Đọc: cả 2 role (AIRLINE_ADMIN cần xem thông tin hãng mình)
router.get   ('/airlines',     isAnyAdmin,   ctrl.getAirlines);
router.post  ('/airlines',     isSuperAdmin, ctrl.createAirline);
router.put   ('/airlines/:id', isSuperAdmin, ctrl.updateAirline);
router.delete('/airlines/:id', isSuperAdmin, ctrl.deleteAirline);

// ── Customers ─────────────────────────────────────────────────
// CHỈ SUPER_ADMIN
router.get   ('/customers',           isSuperAdmin, ctrl.getCustomers);
router.patch ('/customers/:id/ban',   isSuperAdmin, ctrl.banCustomer);
router.patch ('/customers/:id/unban', isSuperAdmin, ctrl.unbanCustomer);

module.exports = router;