// ── Admin Controllers (barrel) ────────────────────────────────
// Import từ đây thay vì import trực tiếp từng file

const { getStats, getMonthlyStats }                         = require('./stats_controller');
const { getFlights, createFlight, updateFlight, deleteFlight } = require('./flight_controller');
const { getAircrafts, createAircraft, updateAircraft, deleteAircraft } = require('./aircraft_controller');
const { getAirports, createAirport, updateAirport, deleteAirport }     = require('./airport_controller');
const { getServices, createService, updateService, deleteService }     = require('./service_controller');
const { getBookings, approveBooking, rejectBooking, cancelBooking, deleteBooking, approveCancel, rejectCancel } = require('./booking_controller');
const { getAirlines, createAirline, updateAirline, deleteAirline }     = require('./airline_controller');
const { getCustomers, banCustomer, unbanCustomer }                     = require('./customer_controller');

module.exports = {
  getStats, getMonthlyStats,
  getFlights, createFlight, updateFlight, deleteFlight,
  getAircrafts, createAircraft, updateAircraft, deleteAircraft,
  getAirports, createAirport, updateAirport, deleteAirport,
  getServices, createService, updateService, deleteService,
  getBookings, approveBooking, rejectBooking, cancelBooking, deleteBooking,
  getAirlines, createAirline, updateAirline, deleteAirline,
  getCustomers, banCustomer, unbanCustomer,
  approveCancel, rejectCancel,
};