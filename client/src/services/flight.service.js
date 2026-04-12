import api from './api';

export const flightService = {
  search:      (params) => api.get('/flights/search', { params }),
  getById:     (id)     => api.get(`/flights/${id}`),
  getSeats:    (id)     => api.get(`/flights/${id}/seats`),
  getServices: ()       => api.get('/flights/services'),
  getAirports: ()       => api.get('/flights/airports'),
};