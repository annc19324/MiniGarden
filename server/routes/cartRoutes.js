// routes/cartRoutes.js — Định tuyến API giỏ hàng
// Tất cả route đều cần đăng nhập (auth middleware)

const express        = require('express');
const router         = express.Router();
const cartController = require('../controllers/cartController');
const { auth }       = require('../middleware/auth');

router.get   ('/',        auth, cartController.getCart);        // Lấy giỏ hàng
router.post  ('/add',     auth, cartController.addToCart);      // Thêm sản phẩm
router.put   ('/:id',     auth, cartController.updateCartItem); // Cập nhật số lượng
router.delete('/:id',     auth, cartController.deleteFromCart); // Xóa sản phẩm
router.delete('/clear/all', auth, cartController.clearCart);    // Xóa toàn bộ giỏ

module.exports = router;
