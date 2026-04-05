// routes/productRoutes.js — Định tuyến API sản phẩm
// Dùng multer để nhận file ảnh, sau đó upload lên Cloudinary

const express           = require('express');
const router            = express.Router();
const productController = require('../controllers/productController');
const { auth, isAdmin }   = require('../middleware/auth');
const multer            = require('multer');

// Lưu file tạm vào thư mục uploads/ trước khi đẩy Cloudinary
const upload = multer({ dest: 'uploads/' });

// Công khai (không cần đăng nhập)
router.get ('/',              productController.getAllProducts);
router.get ('/categories',    productController.getCategories);
router.get ('/:id',           productController.getProductById);

// Chỉ dành cho Admin
router.post ('/',   auth, isAdmin, upload.single('image'), productController.createProduct);
router.put  ('/:id', auth, isAdmin, upload.single('image'), productController.updateProduct);
router.delete('/:id', auth, isAdmin, productController.deleteProduct);

module.exports = router;
