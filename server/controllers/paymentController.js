// controllers/paymentController.js - Module thanh toán nạp lượt đẩy tin (PASSUP)

const db    = require('../config/db');
const payos = require('../utils/payos');

const paymentController = {

    // ── TẠO LINK NẠP LƯỢT ĐẨY TIN ─────────────────────────────
    createPushOrder: async (req, res) => {
        const { pack_type } = req.body; // 'PRO_PACK' (100 lượt), 'BASIC_PACK' (10 lượt)...
        const userId = req.user.user_id;

        const packs = {
            'BASIC_PACK': { amount: 10000, pushes: 10,  label: 'Gói Basic (10 lượt)' },
            'PRO_PACK':   { amount: 50000, pushes: 100, label: 'Gói Pro (100 lượt)' },
        };

        const config = packs[pack_type];
        if (!config) return res.status(400).json({ message: 'Gói không hợp lệ.' });

        try {
            const orderCode = Number(String(Date.now()).slice(-9));
            const paymentLink = await payos.paymentRequests.create({
                orderCode,
                amount:      config.amount,
                description: `NAP_DAY_TIN_${userId}`.substring(0, 25),
                items: [{ name: config.label, quantity: 1, price: config.amount }],
                returnUrl: `${process.env.FRONTEND_URL}/#profile`,
                cancelUrl: `${process.env.FRONTEND_URL}/#profile`,
            });

            // Lưu log giao dịch chờ xử lý
            await db.query(
                'INSERT INTO orders (user_id, total_amount, payment_method, status, payos_order_id, shipping_address) VALUES ($1, $2, $3, $4, $5, $6)',
                [userId, config.amount, 'PayOS', 'pending_push', String(orderCode), `Nạp ${config.pushes} lượt đẩy tin`]
            );

            res.json({ checkoutUrl: paymentLink.checkoutUrl });
        } catch (err) {
            console.error('Push payment error:', err);
            res.status(500).json({ error: err.message });
        }
    },

    // ── WEBHOOK XỬ LÝ NẠP THÀNH CÔNG ───────────────────────────
    handleWebhook: async (req, res) => {
        try {
            const webhookData = await payos.webhooks.verify(req.body);

            if (req.body.code === '00') {
                const description = webhookData.description || '';
                const orderCode   = String(webhookData.orderCode);
                
                // Tìm đơn hàng nạp tin
                const orderRes = await db.query('SELECT * FROM orders WHERE payos_order_id = $1', [orderCode]);
                if (orderRes.rows.length > 0 && orderRes.rows[0].status === 'pending_push') {
                    const userId = orderRes.rows[0].user_id;
                    const log = orderRes.rows[0].shipping_address; // Lưu tạm text nạp ở đây
                    
                    const pushMatch = log.match(/Nạp (\d+) lượt/);
                    const pushCount = pushMatch ? parseInt(pushMatch[1]) : 0;

                    await db.query('BEGIN');
                    // Cập nhật trạng thái đơn
                    await db.query('UPDATE orders SET status=$1 WHERE payos_order_id=$2', ['paid', orderCode]);
                    // Tăng lượt đẩy tin cho User
                    await db.query('UPDATE users SET push_count = push_count + $1 WHERE user_id = $2', [pushCount, userId]);
                    await db.query('COMMIT');
                    
                    console.log(`[PayOS] User ${userId} recharged ${pushCount} pushes.`);
                }
            }
            res.json({ error: 0 });
        } catch (err) {
            console.error('[PayOS] Webhook error:', err.message);
            res.status(400).json({ error: -1 });
        }
    }
};

module.exports = paymentController;
