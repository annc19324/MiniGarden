// middleware/auth.js — Xác thực JWT Token
// Kiểm tra token trong header Authorization: Bearer <token>

const jwt = require('jsonwebtoken');

// Middleware xác thực: dùng cho mọi route cần đăng nhập
const auth = (req, res, next) => {
    try {
        const authHeader = req.header('Authorization');
        if (!authHeader) return res.status(401).json({ message: 'Không có token, từ chối truy cập.' });

        const token = authHeader.split(' ')[1]; // Tách "Bearer <token>"
        const verified = jwt.verify(token, process.env.JWT_SECRET);
        req.user = verified; // Gán {id, role} vào req để các controller dùng
        next();
    } catch (err) {
        res.status(401).json({ message: 'Token không hợp lệ hoặc đã hết hạn.' });
    }
};

// Middleware chỉ cho phép admin: gắn sau auth
const isAdmin = (req, res, next) => {
    if (req.user?.role !== 'admin') {
        return res.status(403).json({ message: 'Chỉ Admin mới có quyền thực hiện thao tác này.' });
    }
    next();
};

module.exports = { auth, isAdmin };
