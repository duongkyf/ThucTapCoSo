import api from './api';

export const bookingService = {
  create:        (data)         => api.post('/bookings', data),
  getAll:        ()             => api.get('/bookings'),
  getById:       (id)           => api.get(`/bookings/${id}`),
  cancel:        (id)           => api.patch(`/bookings/${id}/cancel`),
  requestCancel: (id, reason)   => api.patch(`/bookings/${id}/request-cancel`, { reason }),
  lookup:        (ref)          => api.get(`/bookings/lookup/${ref}`),   // tra cứu, không ghi DB
  checkin:       (data)         => api.post('/checkin', data),           // ghi DB, chỉ gọi khi confirm
};