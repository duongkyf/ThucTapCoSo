import api from './api';

const crudFor = (base) => ({
  getAll:  ()        => api.get(base),
  create:  (data)    => api.post(base, data),
  update:  (id, data)=> api.put(`${base}/${id}`, data),
  remove:  (id)      => api.delete(`${base}/${id}`),
});

export const adminService = {
  getStats: () => api.get('/admin/stats'),

  flights:   crudFor('/admin/flights'),
  aircrafts: crudFor('/admin/aircrafts'),
  airports:  crudFor('/admin/airports'),
  services:  crudFor('/admin/services'),
  airlines:  crudFor('/admin/airlines'),

  bookings: {
    getAll:  ()  => api.get('/admin/bookings'),
    approve: (id)=> api.patch(`/admin/bookings/${id}/approve`),
    reject:  (id)=> api.patch(`/admin/bookings/${id}/reject`),
    cancel:       (id) => api.patch(`/admin/bookings/${id}/cancel`),
    delete:       (id) => api.delete(`/admin/bookings/${id}`),
    approveCancel:(id) => api.patch(`/admin/bookings/${id}/approve-cancel`),
    rejectCancel: (id) => api.patch(`/admin/bookings/${id}/reject-cancel`),
  },

  customers: {
    getAll: ()   => api.get('/admin/customers'),
    ban:    (id) => api.patch(`/admin/customers/${id}/ban`),
    unban:  (id) => api.patch(`/admin/customers/${id}/unban`),
  },
};