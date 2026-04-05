require('dotenv').config();
const express = require('express');
const cors    = require('cors');
const helmet  = require('helmet');
const morgan  = require('morgan');

const app = express();

// ── Global middleware ─────────────────────────────────────────
app.use(helmet());
app.use(cors({ origin: process.env.CLIENT_URL || 'http://localhost:5173', credentials: true }));
app.use(express.json());
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));

// ── Routes ────────────────────────────────────────────────────
app.use('/api/auth',     require('./modules/auth/auth.routes'));
app.use('/api/flights',  require('./modules/flights/flights.routes'));

// Checkin — route riêng, KHÔNG cần đăng nhập, khai báo TRƯỚC /api/bookings
const bookingCtrl = require('./modules/bookings/bookings.controller');
app.post('/api/checkin', bookingCtrl.checkin);

app.use('/api/bookings', require('./modules/bookings/bookings.routes'));
app.use('/api/admin',    require('./modules/admin/admin.routes'));

// ── Health check ──────────────────────────────────────────────
app.get('/api/health', (_, res) => res.json({ status: 'ok', env: process.env.NODE_ENV }));

// ── 404 ───────────────────────────────────────────────────────
app.use((_, res) => res.status(404).json({ success: false, message: 'Route không tồn tại' }));

// ── Global error handler ──────────────────────────────────────
app.use((err, _req, res, _next) => {
  console.error(err.stack);
  res.status(500).json({ success: false, message: 'Lỗi server' });
});

// ── Start ─────────────────────────────────────────────────────
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Server running on http://localhost:${PORT}`));