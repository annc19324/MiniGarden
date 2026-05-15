// controllers/orderController.js — Quản lý đơn hàng & thanh toán PayOS
// Sử dụng PostgreSQL transaction để đảm bảo toàn vẹn dữ liệu

const db    = require('../config/db');
const payos = require('../utils/payos');

const orderController = {

    // ── TẠO ĐƠN HÀNG + LINK THANH TOÁN PAYOS ───────────────────
    createOrder: async (req, res) => {
        const { shipping_address, payment_method = 'COD', items } = req.body;
        const userId = req.user.user_id;

        if (!shipping_address || !items || items.length === 0) {
            return res.status(400).json({ message: 'Thiếu địa chỉ hoặc danh sách sản phẩm.' });
        }

        try {
            await db.query('BEGIN');

            // Kiểm tra tồn kho và lấy thông tin sản phẩm
            for (const item of items) {
                const productRes = await db.query(
                    'SELECT stock_quantity, product_name, price FROM products WHERE product_id=$1',
                    [item.product_id]
                );
                if (productRes.rows.length === 0) throw new Error(`Sản phẩm #${item.product_id} không tồn tại.`);
                const product = productRes.rows[0];
                
                if (product.stock_quantity < item.quantity) {
                    throw new Error(`Sản phẩm "${product.product_name}" không đủ tồn kho.`);
                }
                // Gán tên và giá từ DB để đảm bảo chính xác
                item.product_name = product.product_name;
                item.price = Number(product.price);
            }

            // Tính tổng tiền
            const total_amount = items.reduce((sum, i) => sum + (i.price * i.quantity), 0);

            // Tạo đơn hàng
            const orderResult = await db.query(
                `INSERT INTO orders (user_id, total_amount, shipping_address, payment_method, status, updated_at)
                 VALUES ($1, $2, $3, $4, $5, NOW()) RETURNING order_id`,
                [userId, total_amount, shipping_address, payment_method, 'pending']
            );
            const orderId = orderResult.rows[0].order_id;

            // Lưu chi tiết + trừ tồn kho
            for (const item of items) {
                await db.query(
                    `INSERT INTO order_details (order_id, product_id, quantity, price_at_purchase)
                     VALUES ($1, $2, $3, $4)`,
                    [orderId, item.product_id, item.quantity, item.price]
                );
                await db.query(
                    'UPDATE products SET stock_quantity = stock_quantity - $1 WHERE product_id = $2',
                    [item.quantity, item.product_id]
                );
            }

            // Xóa giỏ hàng sau khi đặt hàng thành công
            const cart = await db.query('SELECT cart_id FROM carts WHERE user_id=$1', [userId]);
            if (cart.rows.length > 0) {
                await db.query('DELETE FROM cart_items WHERE cart_id=$1', [cart.rows[0].cart_id]);
            }

            let responseData = { order_id: orderId, total_amount, status: 'pending' };

            // Nếu dùng PayOS: tạo link thanh toán
            if (payment_method === 'PayOS') {
                const orderCode = Number(String(Date.now()).slice(-9)); // Dùng 9 số cuối của timestamp cho an toàn
                
                const payosItems = items.map(i => ({
                    name:     (i.product_name || 'Sản phẩm').substring(0, 50),
                    quantity: Number(i.quantity),
                    price:    Math.round(Number(i.price)),
                }));

                const totalAmountPayOS = payosItems.reduce((sum, item) => sum + (item.price * item.quantity), 0);

                const paymentLink = await payos.paymentRequests.create({
                    orderCode,
                    amount:      totalAmountPayOS,
                    description: `MiniGarden #${orderId}`.substring(0, 25),
                    items:       payosItems,
                    returnUrl:   process.env.PAYOS_RETURN_URL || `${process.env.FRONTEND_URL}/success`,
                    cancelUrl:   process.env.PAYOS_CANCEL_URL || `${process.env.FRONTEND_URL}/cancel`,
                });

                // Lưu mã PayOS để đối soát webhook
                await db.query(
                    'UPDATE orders SET payos_order_id=$1 WHERE order_id=$2',
                    [String(orderCode), orderId]
                );

                responseData.checkout_url = paymentLink.checkoutUrl;
                responseData.qr_code      = paymentLink.qrCode;
            }

            await db.query('COMMIT');
            res.status(201).json({ error: 0, message: 'Tạo đơn hàng thành công!', data: responseData });
        } catch (err) {
            await db.query('ROLLBACK');
            console.error('[Create Order Error Details]:', {
                message: err.message,
                stack: err.stack,
                payosError: err.response?.data
            });
            res.status(500).json({ error: -1, message: err.message || 'Lỗi xử lý thanh toán.' });
        }
    },

    // ── WEBHOOK PAYOS — Nhận callback sau khi thanh toán ────────
    handlePayOSCallback: async (req, res) => {
        try {
            // Xác thực chữ ký webhook từ PayOS
            const webhookData = await payos.webhooks.verify(req.body);

            // Kiểm tra code thành công (00) hoặc status (PAID)
            if (req.body.code === '00' || webhookData.status === 'PAID') {
                // Thanh toán thành công → cập nhật status
                await db.query(
                    'UPDATE orders SET status=$1, updated_at=NOW() WHERE payos_order_id=$2',
                    ['paid', String(webhookData.orderCode)]
                );
                console.log(`[PayOS] Webhook success for order: ${webhookData.orderCode}`);
            }

            res.json({ error: 0, message: 'ok', data: webhookData });
        } catch (err) {
            console.error('[PayOS] Webhook error:', err.message);
            res.status(400).json({ error: -1, message: 'Webhook không hợp lệ.' });
        }
    },

    // ── LẤY ĐƠN HÀNG CỦA USER ──────────────────────────────────
    getMyOrders: async (req, res) => {
        try {
            const orders = await db.query(
                `SELECT o.*, 
                    COALESCE(
                        json_agg(json_build_object(
                            'product_name', p.product_name,
                            'quantity', od.quantity,
                            'price', od.price_at_purchase,
                            'image_url', p.image_url
                        )) FILTER (WHERE od.order_detail_id IS NOT NULL), '[]'
                    ) AS items
                 FROM orders o
                 LEFT JOIN order_details od ON o.order_id = od.order_id
                 LEFT JOIN products       p  ON od.product_id = p.product_id
                 WHERE o.user_id = $1
                 GROUP BY o.order_id
                 ORDER BY o.order_date DESC`,
                [req.user.user_id]
            );
            res.json(orders.rows);
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    },

    // ── ADMIN: LẤY TẤT CẢ ĐƠN HÀNG ─────────────────────────────
    getAllOrders: async (req, res) => {
        try {
            const { status } = req.query;
            let query = `
                SELECT o.*, u.username, u.full_name, u.phone
                FROM orders o
                JOIN users u ON o.user_id = u.user_id
                WHERE 1=1
            `;
            const params = [];
            if (status) {
                params.push(status);
                query += ` AND o.status = $${params.length}`;
            }
            query += ' ORDER BY o.order_date DESC';

            const result = await db.query(query, params);
            res.json(result.rows);
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    },

    // ── ADMIN: CẬP NHẬT TRẠNG THÁI ĐƠN HÀNG ────────────────────
    updateOrderStatus: async (req, res) => {
        const { status } = req.body;
        const validStatuses = ['pending', 'paid', 'processing', 'shipped', 'completed', 'cancelled'];

        if (!validStatuses.includes(status)) {
            return res.status(400).json({ message: 'Trạng thái không hợp lệ.' });
        }

        try {
            const result = await db.query(
                'UPDATE orders SET status=$1, updated_at=NOW() WHERE order_id=$2 RETURNING *',
                [status, req.params.id]
            );
            if (result.rows.length === 0) return res.status(404).json({ message: 'Không tìm thấy đơn hàng.' });
            res.json({ message: 'Cập nhật trạng thái thành công!', order: result.rows[0] });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    },

    // ── ADMIN: THỐNG KÊ DASHBOARD ────────────────────────────────
    getAdminStats: async (req, res) => {
        try {
            const [totalOrders, totalRevenue, pendingOrders, bestSellers, recentOrders, monthlyRevenue] = await Promise.all([
                // Tổng đơn hàng
                db.query('SELECT COUNT(*) as count FROM orders'),
                // Tổng doanh thu (chỉ đơn đã thanh toán)
                db.query("SELECT COALESCE(SUM(total_amount),0) as total FROM orders WHERE status IN ('paid','completed')"),
                // Đơn chờ xử lý
                db.query("SELECT COUNT(*) as count FROM orders WHERE status='pending'"),
                // Top 5 sản phẩm bán chạy
                db.query(`
                    SELECT p.product_name, p.image_url, SUM(od.quantity) as total_sold
                    FROM order_details od
                    JOIN products p ON od.product_id = p.product_id
                    GROUP BY p.product_id, p.product_name, p.image_url
                    ORDER BY total_sold DESC LIMIT 5
                `),
                // 5 đơn hàng gần nhất
                db.query(`
                    SELECT o.order_id, o.status, o.total_amount, o.order_date, u.username
                    FROM orders o JOIN users u ON o.user_id = u.user_id
                    ORDER BY o.order_date DESC LIMIT 5
                `),
                // Doanh thu 6 tháng gần nhất
                db.query(`
                    SELECT TO_CHAR(order_date, 'MM/YYYY') as month,
                           COALESCE(SUM(total_amount),0) as revenue
                    FROM orders
                    WHERE status IN ('paid','completed')
                      AND order_date >= NOW() - INTERVAL '6 months'
                    GROUP BY month ORDER BY month
                `),
            ]);

            res.json({
                total_orders:    Number(totalOrders.rows[0].count),
                total_revenue:   Number(totalRevenue.rows[0].total),
                pending_orders:  Number(pendingOrders.rows[0].count),
                best_sellers:    bestSellers.rows,
                recent_orders:   recentOrders.rows,
                monthly_revenue: monthlyRevenue.rows,
            });
        } catch (err) {
            console.error('Stats error:', err);
            res.status(500).json({ error: err.message });
        }
    },
};

module.exports = orderController;
