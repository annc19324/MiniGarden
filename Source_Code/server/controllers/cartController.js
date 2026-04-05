// controllers/cartController.js — Quản lý giỏ hàng
// Mỗi user có 1 cart duy nhất (quan hệ 1-1 trong bảng carts)

const db = require('../config/db');

const cartController = {

    // ── LẤY GIỎ HÀNG ────────────────────────────────────────────
    // Join với products để lấy đầy đủ thông tin sản phẩm trong giỏ
    getCart: async (req, res) => {
        try {
            const result = await db.query(`
                SELECT
                    ci.cart_item_id,
                    ci.quantity,
                    p.product_id,
                    p.product_name,
                    p.price,
                    p.image_url,
                    p.stock_quantity,
                    p.category
                FROM carts c
                JOIN cart_items ci ON c.cart_id = ci.cart_id
                JOIN products p    ON ci.product_id = p.product_id
                WHERE c.user_id = $1
                ORDER BY ci.cart_item_id
            `, [req.user.user_id]);

            res.json(result.rows);
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    },

    // ── THÊM SẢN PHẨM VÀO GIỎ ──────────────────────────────────
    addToCart: async (req, res) => {
        const { product_id, quantity = 1 } = req.body;
        if (!product_id) return res.status(400).json({ message: 'Thiếu product_id.' });

        try {
            // Kiểm tra sản phẩm còn hàng không
            const product = await db.query(
                'SELECT stock_quantity FROM products WHERE product_id=$1', [product_id]
            );
            if (product.rows.length === 0) return res.status(404).json({ message: 'Sản phẩm không tồn tại.' });
            if (product.rows[0].stock_quantity < quantity) {
                return res.status(400).json({ message: 'Sản phẩm không đủ tồn kho.' });
            }

            // Lấy cart_id của user (tự tạo nếu chưa có)
            let cartResult = await db.query('SELECT cart_id FROM carts WHERE user_id=$1', [req.user.user_id]);
            if (cartResult.rows.length === 0) {
                cartResult = await db.query('INSERT INTO carts (user_id) VALUES ($1) RETURNING cart_id', [req.user.user_id]);
            }
            const cartId = cartResult.rows[0].cart_id;

            // Nếu đã có sản phẩm này → tăng số lượng; chưa có → thêm mới
            const existing = await db.query(
                'SELECT cart_item_id, quantity FROM cart_items WHERE cart_id=$1 AND product_id=$2',
                [cartId, product_id]
            );
            if (existing.rows.length > 0) {
                await db.query(
                    'UPDATE cart_items SET quantity = quantity + $1 WHERE cart_item_id=$2',
                    [quantity, existing.rows[0].cart_item_id]
                );
            } else {
                await db.query(
                    'INSERT INTO cart_items (cart_id, product_id, quantity) VALUES ($1, $2, $3)',
                    [cartId, product_id, quantity]
                );
            }

            res.json({ message: 'Đã thêm vào giỏ hàng!' });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    },

    // ── CẬP NHẬT SỐ LƯỢNG ───────────────────────────────────────
    updateCartItem: async (req, res) => {
        const { quantity } = req.body;
        if (!quantity || quantity < 1) {
            return res.status(400).json({ message: 'Số lượng phải lớn hơn 0.' });
        }
        try {
            const result = await db.query(
                'UPDATE cart_items SET quantity=$1 WHERE cart_item_id=$2 RETURNING *',
                [quantity, req.params.id]
            );
            if (result.rows.length === 0) return res.status(404).json({ message: 'Không tìm thấy mục giỏ hàng.' });
            res.json({ message: 'Đã cập nhật số lượng!' });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    },

    // ── XÓA 1 SẢN PHẨM KHỎI GIỎ ────────────────────────────────
    deleteFromCart: async (req, res) => {
        try {
            await db.query('DELETE FROM cart_items WHERE cart_item_id=$1', [req.params.id]);
            res.json({ message: 'Đã xóa khỏi giỏ hàng!' });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    },

    // ── XÓA TOÀN BỘ GIỎ HÀNG ────────────────────────────────────
    clearCart: async (req, res) => {
        try {
            const cart = await db.query('SELECT cart_id FROM carts WHERE user_id=$1', [req.user.user_id]);
            if (cart.rows.length > 0) {
                await db.query('DELETE FROM cart_items WHERE cart_id=$1', [cart.rows[0].cart_id]);
            }
            res.json({ message: 'Đã xóa toàn bộ giỏ hàng!' });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    },
};

module.exports = cartController;
