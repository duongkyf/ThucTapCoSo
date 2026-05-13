import api from './api';

export const flightService = {
  // Giữ nguyên các endpoint cũ
  search:      (params) => api.get('/flights/search', { params }),
  getById:     (id)     => api.get(`/flights/${id}`),
  getSeats:    (id)     => api.get(`/flights/${id}/seats`),
  getServices: ()       => api.get('/flights/services'),
  getAirports: ()       => api.get('/flights/airports'),

  /**
   * AI Search — tìm kiếm có ranking cá nhân hóa.
   * @param {{ from, to, date, passengers, class, userId }} params
   * userId = null nếu guest → AI dùng cold-start vector
   */
  searchWithAI: (params) => api.post('/flights/ai-search', {
  from: params.from,
  to: params.to,
  date: params.date,
  passengers: params.passengers,
  class: params.class,
  userId: params.userId,
  customVector: params.customVector,
}),
};