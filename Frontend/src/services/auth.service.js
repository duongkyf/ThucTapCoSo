import axios from 'axios';

const API = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';
const TOKEN_KEY = 'skybooker_token';

const authAxios = axios.create({ baseURL: API });

// Tự động đính token vào mọi request
authAxios.interceptors.request.use((config) => {
  const token = localStorage.getItem(TOKEN_KEY);
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

export const authService = {
  login:    (email, password)                              => authAxios.post('/auth/login',    { email, password }),
  register: (username, email, password, phone_number, id_number) => authAxios.post('/auth/register', { username, email, password, phone_number, id_number }),
  getMe:    ()                                             => authAxios.get('/auth/me'),
  updateProfile: (data)                                    => authAxios.put('/auth/profile', data),
  changePassword: (data)                                   => authAxios.put('/auth/password', data),
};