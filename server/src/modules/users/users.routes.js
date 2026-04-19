const express = require('express');
const router = express.Router();
const { getPool } = require('../../config/db');
const { computeFlightSignal } = require('../flights/ai.helper');

// Cache in-memory đơn giản (có thể dùng Redis)
const prefCache = new Map();

// Cập nhật preference vector cho user sau khi đặt vé
router.post('/:userId/preference/update', async (req, res) => {
    const { userId } = req.params;
    const { flightId, action } = req.body; // action = 'book' hoặc 'cancel'
    
    if (!['book', 'cancel'].includes(action)) {
        return res.status(400).json({ error: 'action must be book or cancel' });
    }
    
    const pool = await getPool();
    
    // Lấy thông tin chuyến bay
    const flightResult = await pool.request()
        .input('flightId', sql.Int, flightId)
        .query(`
            SELECT f.base_price, f.duration_minutes, f.stops_num, 
                   al.airline_name, DATEPART(HOUR, f.departure_time) AS dep_hour,
                   CAST(CASE WHEN t.class IN ('business','first') THEN 1 ELSE 0 END AS BIT) AS is_business
            FROM dbo.Flights f
            JOIN dbo.Airlines al ON f.airline_id = al.airline_id
            LEFT JOIN dbo.Tickets t ON t.flight_id = f.flight_id
            WHERE f.flight_id = @flightId
        `);
    if (flightResult.recordset.length === 0) {
        return res.status(404).json({ error: 'Flight not found' });
    }
    const flight = flightResult.recordset[0];
    
    // Lấy preferred_airline hiện tại của user
    const userResult = await pool.request()
        .input('userId', sql.Int, userId)
        .query(`SELECT preferred_airline, preference_vector FROM dbo.Users WHERE user_id = @userId`);
    if (userResult.recordset.length === 0) {
        return res.status(404).json({ error: 'User not found' });
    }
    const user = userResult.recordset[0];
    const preferredAirline = user.preferred_airline || '';
    
    // Lấy vector hiện tại (từ cache hoặc DB)
    let currentVec = prefCache.get(userId);
    if (!currentVec) {
        if (user.preference_vector) {
            currentVec = JSON.parse(user.preference_vector);
        } else {
            currentVec = [0.5, 0.5, 0.5, 0.5, 0.5, 0.5]; // default
        }
    }
    
    // Tính signal của chuyến bay
    const signal = computeFlightSignal(flight, preferredAirline);
    
    // EMA update: alpha = 0.2 (có thể điều chỉnh)
    const alpha = 0.2;
    let newVec;
    if (action === 'book') {
        newVec = currentVec.map((v, i) => v * (1 - alpha) + signal[i] * alpha);
    } else { // cancel: giảm signal
        newVec = currentVec.map((v, i) => v * (1 - alpha) - signal[i] * alpha);
    }
    // Clamp về [0,1]
    newVec = newVec.map(v => Math.min(1, Math.max(0, v)));
    
    // Lưu vào cache
    prefCache.set(userId, newVec);
    
    // Lưu vào database (cập nhật cột preference_vector)
    await pool.request()
        .input('userId', sql.Int, userId)
        .input('vec', sql.NVarChar, JSON.stringify(newVec))
        .query(`UPDATE dbo.Users SET preference_vector = @vec WHERE user_id = @userId`);
    
    res.json({ userId, newVector: newVec, action });
});

// Lấy preference vector hiện tại (dùng cho frontend nếu cần)
router.get('/:userId/preference', async (req, res) => {
    const { userId } = req.params;
    const pool = await getPool();
    const result = await pool.request()
        .input('userId', sql.Int, userId)
        .query(`SELECT preference_vector FROM dbo.Users WHERE user_id = @userId`);
    if (result.recordset.length === 0) return res.status(404).json({ error: 'User not found' });
    const vec = result.recordset[0].preference_vector ? JSON.parse(result.recordset[0].preference_vector) : [0.5,0.5,0.5,0.5,0.5,0.5];
    res.json({ userId, vector: vec });
});

module.exports = router;