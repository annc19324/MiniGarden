// routes/orderRoutes.js — Định tuyến API đơn hàng

const express         = require('express');
const router          = express.Router();
const orderController = require('../controllers/orderController');
const { auth, isAdmin } = require('../middleware/auth');

// Webhook PayOS (không cần auth — PayOS gọi server trực tiếp)
router.post('/payos-callback', orderController.handlePayOSCallback);

// Cần đăng nhập
router.post     ('/',              auth, orderController.createOrder);
router.get      ('/my-orders',     auth, orderController.getMyOrders);

// Chỉ Admin
router.get      ('/admin/all',     auth, isAdmin, orderController.getAllOrders);
router.get      ('/admin/stats',   auth, isAdmin, orderController.getAdminStats);
router.put      ('/:id/status',    auth, isAdmin, orderController.updateOrderStatus);

module.exports = router;
