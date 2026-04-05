// controllers/userController.js — Quản lý người dùng
// Tích hợp: bcrypt (hash mật khẩu), jwt (token xác thực), pg (PostgreSQL)

const bcrypt = require('bcrypt');
const jwt    = require('jsonwebtoken');
const db     = require('../config/db');

const nodemailer = require('nodemailer');
const crypto = require('crypto');

const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

const userController = {

    // ── QUÊN MẬT KHẨU ──────────────────────────────────────────
    forgotPassword: async (req, res) => {
        const { email } = req.body;
        if (!email) return res.status(400).json({ message: 'Vui lòng nhập Email.' });

        try {
            const result = await db.query('SELECT user_id, username FROM users WHERE email = $1', [email]);
            if (result.rows.length === 0) return res.status(404).json({ message: 'Không tìm thấy tài khoản với Email này.' });

            const user = result.rows[0];
            const resetToken = crypto.randomBytes(20).toString('hex');
            const resetExpiry = new Date(Date.now() + 3600000); // 1 giờ sau

            await db.query(
                'UPDATE users SET reset_token = $1, reset_expiry = $2 WHERE user_id = $3',
                [resetToken, resetExpiry, user.user_id]
            );

            const resetUrl = `${process.env.FRONTEND_URL}/#reset-password?token=${resetToken}`;

            const mailOptions = {
                to: email,
                from: process.env.EMAIL_USER,
                subject: '🌿 Khôi phục mật khẩu MiniGarden',
                html: `
                    <div style="font-family: 'Montserrat', sans-serif; padding: 2rem; border: 1px solid #eee; border-radius: 12px; max-width: 500px; margin: auto;">
                        <h2 style="color: #2d5a27;">Chào ${user.username},</h2>
                        <p>Bạn đã yêu cầu khôi phục mật khẩu tại MiniGarden.</p>
                        <p>Nhấp vào nút bên dưới để đổi mật khẩu mới (có hiệu lực trong 1 giờ):</p>
                        <a href="${resetUrl}" style="display: inline-block; padding: 1rem 2rem; background: #2d5a27; color: white; text-decoration: none; border-radius: 8px; font-weight: 700; margin-top: 1rem;">Đổi mật khẩu ngay</a>
                        <p style="margin-top: 2rem; border-top: 1px solid #eee; padding-top: 1rem; color: #888; font-size: 0.85rem;">Nếu bạn không yêu cầu điều này, hãy bỏ qua email này.</p>
                    </div>
                `
            };

            await transporter.sendMail(mailOptions);
            res.json({ message: 'Link khôi phục mật khẩu đã được gửi vào Email của bạn!' });
        } catch (err) {
            console.error('Forgot password error:', err);
            res.status(500).json({ error: 'Lỗi hệ thống khi gửi mail.' });
        }
    },

    // ── RESET MẬT KHẨU ──────────────────────────────────────────
    resetPassword: async (req, res) => {
        const { token, new_password } = req.body;
        if (!token || !new_password) return res.status(400).json({ message: 'Thiếu thông tin khôi phục.' });

        try {
            const result = await db.query(
                'SELECT user_id FROM users WHERE reset_token = $1 AND reset_expiry > $2',
                [token, new Date()]
            );

            if (result.rows.length === 0) {
                return res.status(400).json({ message: 'Token không hợp lệ hoặc đã hết hạn.' });
            }

            const userId = result.rows[0].user_id;
            const hashedPass = await bcrypt.hash(new_password, 10);

            await db.query(
                'UPDATE users SET password_hash = $1, reset_token = NULL, reset_expiry = NULL WHERE user_id = $2',
                [hashedPass, userId]
            );

            res.json({ message: 'Mật khẩu đã được thay đổi thành công! Hãy đăng nhập lại.' });
        } catch (err) {
            console.error('Reset password error:', err);
            res.status(500).json({ error: 'Lỗi khi cập nhật mật khẩu mới.' });
        }
    },

    // ── ĐĂNG KÝ ────────────────────────────────────────────────
    register: async (req, res) => {
        const { username, password, full_name, email, phone, address } = req.body;

        // Validate dữ liệu đầu vào
        if (!username || !password || !email) {
            return res.status(400).json({ message: 'username, password và email là bắt buộc.' });
        }
        if (password.length < 6) {
            return res.status(400).json({ message: 'Mật khẩu phải có ít nhất 6 ký tự.' });
        }

        try {
            // Kiểm tra trùng username hoặc email
            const check = await db.query(
                'SELECT user_id FROM users WHERE username = $1 OR email = $2',
                [username, email]
            );
            if (check.rows.length > 0) {
                return res.status(400).json({ message: 'Username hoặc email đã tồn tại.' });
            }

            // Hash mật khẩu với bcrypt
            const hashedPassword = await bcrypt.hash(password, 10);

            // Tạo user mới
            const newUser = await db.query(
                `INSERT INTO users (username, password_hash, full_name, email, phone)
                 VALUES ($1, $2, $3, $4, $5)
                 RETURNING user_id, username, email, role`,
                [username, hashedPassword, full_name || '', email, phone || '']
            );
            const user = newUser.rows[0];

            // Tự động tạo giỏ hàng trống cho user mới
            await db.query('INSERT INTO carts (user_id) VALUES ($1)', [user.user_id]);

            res.status(201).json({ message: 'Đăng ký thành công!', user });
        } catch (err) {
            console.error('Register error:', err);
            res.status(500).json({ error: err.message });
        }
    },

    // ── ĐĂNG NHẬP ──────────────────────────────────────────────
    login: async (req, res) => {
        const { username, password } = req.body;
        if (!username || !password) {
            return res.status(400).json({ message: 'Vui lòng nhập username và password.' });
        }

        try {
            const result = await db.query(
                'SELECT * FROM users WHERE username = $1',
                [username]
            );
            if (result.rows.length === 0) {
                return res.status(404).json({ message: 'Không tìm thấy tài khoản.' });
            }

            const user = result.rows[0];

            // So sánh mật khẩu
            const validPass = await bcrypt.compare(password, user.password_hash);
            if (!validPass) {
                return res.status(400).json({ message: 'Mật khẩu không đúng.' });
            }

            // Ký JWT, hết hạn sau 7 ngày
            const token = jwt.sign(
                { user_id: user.user_id, role: user.role },
                process.env.JWT_SECRET,
                { expiresIn: '7d' }
            );

            res.json({
                token,
                user: {
                    user_id:   user.user_id,
                    username: user.username,
                    role:     user.role,
                    full_name: user.full_name,
                    email:    user.email,
                }
            });
        } catch (err) {
            console.error('Login error:', err);
            res.status(500).json({ error: err.message });
        }
    },

    // ── LẤY PROFILE ────────────────────────────────────────────
    getProfile: async (req, res) => {
        try {
            const result = await db.query(
                'SELECT user_id, username, full_name, email, phone, role, created_at FROM users WHERE user_id = $1',
                [req.user.id]
            );
            if (result.rows.length === 0) return res.status(404).json({ message: 'Không tìm thấy user.' });
            res.json(result.rows[0]);
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    },

    // ── CẬP NHẬT PROFILE ───────────────────────────────────────
    updateProfile: async (req, res) => {
        const { full_name, phone } = req.body;
        try {
            const updated = await db.query(
                `UPDATE users SET full_name=$1, phone=$2 WHERE user_id=$3
                 RETURNING user_id, username, full_name, email, phone, role`,
                [full_name, phone, req.user.id]
            );
            res.json({ message: 'Cập nhật thành công!', user: updated.rows[0] });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    },

    // ── ĐỔI MẬT KHẨU ───────────────────────────────────────────
    changePassword: async (req, res) => {
        const { old_password, new_password } = req.body;
        if (!old_password || !new_password) {
            return res.status(400).json({ message: 'Vui lòng cung cấp mật khẩu cũ và mới.' });
        }
        if (new_password.length < 6) {
            return res.status(400).json({ message: 'Mật khẩu mới phải từ 6 ký tự.' });
        }

        try {
            const result = await db.query('SELECT password_hash FROM users WHERE user_id = $1', [req.user.id]);
            const validPass = await bcrypt.compare(old_password, result.rows[0].password_hash);
            if (!validPass) return res.status(400).json({ message: 'Mật khẩu cũ không đúng.' });

            const newHash = await bcrypt.hash(new_password, 10);
            await db.query('UPDATE users SET password_hash=$1 WHERE user_id=$2', [newHash, req.user.id]);

            res.json({ message: 'Đổi mật khẩu thành công!' });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    },

    // ── ADMIN: LẤY TẤT CẢ USERS ────────────────────────────────
    getAllUsers: async (req, res) => {
        try {
            const result = await db.query(
                'SELECT user_id, username, full_name, email, phone, role, created_at FROM users ORDER BY created_at DESC'
            );
            res.json(result.rows);
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    },

    // ── ADMIN: XÓA USER ─────────────────────────────────────────
    deleteUser: async (req, res) => {
        try {
            await db.query('DELETE FROM users WHERE user_id = $1', [req.params.id]);
            res.json({ message: 'Đã xóa user.' });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    },

    // ── ADMIN: CẬP NHẬT QUYỀN ──────────────────────────────────
    updateRole: async (req, res) => {
        try {
            const { role } = req.body;
            if (role !== 'admin' && role !== 'customer') {
                return res.status(400).json({ message: 'Quyền không hợp lệ.' });
            }
            await db.query('UPDATE users SET role = $1 WHERE user_id = $2', [role, req.params.id]);
            res.json({ message: 'Cập nhật quyền thành công.' });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    },

    // ── ADMIN: CẬP NHẬT THÔNG TIN ─────────────────────────────
    updateUserAdmin: async (req, res) => {
        const { full_name, phone } = req.body;
        try {
            await db.query(
                `UPDATE users SET full_name=$1, phone=$2 WHERE user_id=$3`,
                [full_name, phone, req.params.id]
            );
            res.json({ message: 'Cập nhật thông tin thành công.' });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    }
};

module.exports = userController;
