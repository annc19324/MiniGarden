// index.js — Entry point Backend MiniGarden
// Tích hợp: Express API, Socket.io Chat Realtime, PostgreSQL

const express = require('express');
const cors    = require('cors');
const http    = require('http');
const { Server } = require('socket.io');
const db      = require('./config/db');

require('dotenv').config();

const app    = express();
const server = http.createServer(app);

// ── Socket.io ─────────────────────────────────────────────────
const io = new Server(server, {
    cors: {
        origin:  '*', // Production: thay bằng URL frontend cụ thể
        methods: ['GET', 'POST'],
    }
});

// ── Middleware ────────────────────────────────────────────────
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ── Routes API ────────────────────────────────────────────────
app.use('/api/users',    require('./routes/userRoutes'));
app.use('/api/products', require('./routes/productRoutes'));
app.use('/api/carts',    require('./routes/cartRoutes'));
app.use('/api/orders',   require('./routes/orderRoutes'));

// ── Health Check ──────────────────────────────────────────────
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.get('/api/messages/:otherId', require('./middleware/auth').auth, async (req, res) => {
    const userId = req.user.user_id;
    const otherId = parseInt(req.params.otherId);
    try {
        // Cập nhật is_read = true cho các tin nhắn của người kia gửi cho mình
        await db.query(`UPDATE messages SET is_read = true WHERE sender_id = $1 AND receiver_id = $2`, [otherId, userId]);

        const query = `
            SELECT * FROM messages
            WHERE (sender_id = $1 AND receiver_id = $2)
               OR (sender_id = $2 AND receiver_id = $1)
            ORDER BY sent_at ASC
        `;
        const result = await db.query(query, [userId, otherId]);
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: 'Lỗi tải tin nhắn' });
    }
});

// ── Admin Chat sidebar API ───────────────────────────────────
app.get('/api/messages/admin/chats', require('./middleware/auth').auth, async (req, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Chỉ dành cho Admin' });
    try {
        const query = `
            SELECT 
                u.user_id, u.username, u.full_name,
                MAX(m.sent_at) as last_msg_time,
                SUM(CASE WHEN m.is_read = false AND m.receiver_id = $1 THEN 1 ELSE 0 END) as unread_count
            FROM users u
            JOIN messages m ON (u.user_id = m.sender_id OR u.user_id = m.receiver_id)
            WHERE u.role != 'admin' AND (m.sender_id = $1 OR m.receiver_id = $1)
            GROUP BY u.user_id, u.username, u.full_name
            ORDER BY last_msg_time DESC
        `;
        const result = await db.query(query, [req.user.user_id]);
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: 'Lỗi tải danh sách chat' });
    }
});

// ── User Addresses API ───────────────────────────────────────
const authMiddleware = require('./middleware/auth').auth;

app.get('/api/users/addresses', authMiddleware, async (req, res) => {
    try {
        const resAdd = await db.query('SELECT * FROM user_addresses WHERE user_id = $1 ORDER BY is_default DESC, created_at DESC', [req.user.user_id]);
        res.json(resAdd.rows);
    } catch (err) { res.status(500).json({ error: 'Lỗi tải địa chỉ' }); }
});

app.post('/api/users/addresses', authMiddleware, async (req, res) => {
    const { full_name, phone, address, is_default } = req.body;
    try {
        if (is_default) {
            await db.query('UPDATE user_addresses SET is_default = false WHERE user_id = $1', [req.user.user_id]);
        }
        const resAdd = await db.query(
            'INSERT INTO user_addresses (user_id, full_name, phone, address, is_default) VALUES ($1, $2, $3, $4, $5) RETURNING *',
            [req.user.user_id, full_name, phone, address, !!is_default]
        );
        res.json(resAdd.rows[0]);
    } catch (err) { res.status(500).json({ error: 'Lỗi thêm địa chỉ' }); }
});

app.delete('/api/users/addresses/:id', authMiddleware, async (req, res) => {
    try {
        await db.query('DELETE FROM user_addresses WHERE address_id = $1 AND user_id = $2', [req.params.id, req.user.user_id]);
        res.json({ message: 'Đã xóa địa chỉ' });
    } catch (err) { res.status(500).json({ error: 'Lỗi xóa địa chỉ' }); }
});

app.put('/api/users/addresses/:id/default', authMiddleware, async (req, res) => {
    try {
        await db.query('UPDATE user_addresses SET is_default = false WHERE user_id = $1', [req.user.user_id]);
        await db.query('UPDATE user_addresses SET is_default = true WHERE address_id = $1 AND user_id = $2', [req.params.id, req.user.user_id]);
        res.json({ message: 'Đã đặt làm mặc định' });
    } catch (err) { res.status(500).json({ error: 'Lỗi đặt mặc định' }); }
});

// ── Error Handler ─────────────────────────────────────────────
app.use((err, req, res, next) => {
    console.error('[Server Error]', err);
    res.status(500).json({ error: 'Lỗi server nội bộ.' });
});

// ════════════════════════════════════════════════════════════
//  SOCKET.IO — Chat Realtime giữa Khách hàng ↔ Admin
//  Kiến trúc: mỗi user join room theo user_id của họ
// ════════════════════════════════════════════════════════════
io.on('connection', (socket) => {
    console.log(`[Socket] Connected: ${socket.id}`);

    // User join room riêng theo ID để nhận tin nhắn private
    socket.on('join_room', (userId) => {
        socket.join(String(userId));
        console.log(`[Socket] User ${userId} joined room`);
    });

    // Nhận tin nhắn → lưu DB → broadcast tới cả sender và receiver
    socket.on('send_message', async ({ sender_id, receiver_id, message_text }) => {
        if (!sender_id || !receiver_id || !message_text?.trim()) return;

        try {
            // Lưu tin nhắn vào bảng messages (PostgreSQL)
            const result = await db.query(
                `INSERT INTO messages (sender_id, receiver_id, message_text)
                 VALUES ($1, $2, $3) RETURNING *`,
                [sender_id, receiver_id, message_text.trim()]
            );

            const savedMsg = result.rows[0];

            // Gửi tới room của sender VÀ receiver
            io.to(String(sender_id)).to(String(receiver_id)).emit('receive_message', {
                message_id:   savedMsg.message_id,
                sender_id:    savedMsg.sender_id,
                receiver_id:  savedMsg.receiver_id,
                message_text: savedMsg.message_text,
                sent_at:      savedMsg.sent_at,
            });
        } catch (err) {
            console.error('[Socket] Save message error:', err.message);
        }
    });

    // Admin đánh dấu đã đọc tin nhắn
    socket.on('mark_read', async ({ sender_id, reader_id }) => {
        try {
            await db.query(
                'UPDATE messages SET is_read=TRUE WHERE sender_id=$1 AND receiver_id=$2 AND is_read=FALSE',
                [sender_id, reader_id]
            );
        } catch (err) {
            console.error('[Socket] Mark read error:', err.message);
        }
    });

    socket.on('disconnect', () => {
        console.log(`[Socket] Disconnected: ${socket.id}`);
    });
});

// ── Start Server ──────────────────────────────────────────────
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
    console.log(`🌿 MiniGarden Server running on http://localhost:${PORT}`);
    console.log(`   → REST API: http://localhost:${PORT}/api`);
    console.log(`   → Socket.io: ws://localhost:${PORT}`);
});
