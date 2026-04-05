// controllers/productController.js — Quản lý sản phẩm
// Upload ảnh lên Cloudinary, lưu URL vào PostgreSQL

const db         = require('../config/db');
const cloudinary = require('cloudinary').v2;
const fs         = require('fs');

// Cấu hình Cloudinary từ biến môi trường
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key:    process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Helper: upload file tạm lên Cloudinary, sau đó xóa file local
async function uploadToCloudinary(filePath) {
    const result = await cloudinary.uploader.upload(filePath, {
        folder:         'minigarden',
        transformation: [{ width: 800, height: 800, crop: 'limit', quality: 'auto' }],
    });
    fs.unlinkSync(filePath); // Xóa file tạm
    return result.secure_url;
}

const productController = {

    // ── LẤY TẤT CẢ SẢN PHẨM ────────────────────────────────────
    getAllProducts: async (req, res) => {
        try {
            const { category, search, sort } = req.query;
            let query = 'SELECT * FROM products WHERE 1=1';
            const params = [];

            // Lọc theo danh mục
            if (category) {
                params.push(category);
                query += ` AND category = $${params.length}`;
            }
            // Tìm kiếm theo tên
            if (search) {
                params.push(`%${search}%`);
                query += ` AND product_name ILIKE $${params.length}`;
            }
            
            // Sắp xếp
            const sortMap = {
                'newest':    'created_at DESC',
                'price_asc': 'price ASC',
                'price_desc':'price DESC',
            };
            query += ` ORDER BY ${sortMap[sort] || 'created_at DESC'}`;

            const result = await db.query(query, params);
            res.json(result.rows);
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    },

    // ── THÊM SẢN PHẨM MỚI (Admin) ─────────────────────────────
    createProduct: async (req, res) => {
        const { product_name, description, price, stock_quantity, category } = req.body;
        if (!product_name || !price) {
            return res.status(400).json({ message: 'Tên và giá sản phẩm là bắt buộc.' });
        }

        try {
            let imageUrl = req.body.image_url || '';
            if (req.file) {
                imageUrl = await uploadToCloudinary(req.file.path);
            }

            const result = await db.query(
                `INSERT INTO products (product_name, description, price, stock_quantity, image_url, category)
                 VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
                [product_name, description || '', price, stock_quantity || 1, imageUrl, category || '']
            );

            res.status(201).json(result.rows[0]);
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    },

    // ── CẬP NHẬT SẢN PHẨM (Admin) ───────────────────────────────
    updateProduct: async (req, res) => {
        const { product_name, description, price, stock_quantity, category } = req.body;
        try {
            // Lấy ảnh cũ nếu không upload ảnh mới
            let imageUrl = req.body.image_url;
            if (req.file) {
                imageUrl = await uploadToCloudinary(req.file.path);
            } else if (!imageUrl) {
                const old = await db.query('SELECT image_url FROM products WHERE product_id=$1', [req.params.id]);
                imageUrl = old.rows[0]?.image_url || '';
            }

            const result = await db.query(
                `UPDATE products
                 SET product_name=$1, description=$2, price=$3, stock_quantity=$4, image_url=$5, category=$6
                 WHERE product_id=$7 RETURNING *`,
                [product_name, description, price, stock_quantity, imageUrl, category, req.params.id]
            );

            if (result.rows.length === 0) return res.status(404).json({ message: 'Không tìm thấy sản phẩm.' });
            res.json(result.rows[0]);
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    },    // ── LẤY CHI TIẾT SẢN PHẨM ─────────────────────────────────
    getProductById: async (req, res) => {
        try {
            const result = await db.query('SELECT * FROM products WHERE product_id = $1', [req.params.id]);
            if (result.rows.length === 0) return res.status(404).json({ message: 'Không tìm thấy sản phẩm.' });
            res.json(result.rows[0]);
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    },

    // ── LẤY DANH SÁCH DANH MỤC ───────────────────────────────
    getCategories: async (req, res) => {
        try {
            const result = await db.query('SELECT DISTINCT category FROM products WHERE category IS NOT NULL');
            res.json(result.rows.map(row => row.category));
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    },

    // ── XÓA SẢN PHẨM (Admin) ───────────────────────────────────
    deleteProduct: async (req, res) => {
        try {
            const result = await db.query(
                'DELETE FROM products WHERE product_id=$1 RETURNING product_name',
                [req.params.id]
            );
            if (result.rows.length === 0) return res.status(404).json({ message: 'Không tìm thấy sản phẩm.' });
            res.json({ message: `Đã xóa sản phẩm: ${result.rows[0].product_name}` });
        } catch (err) {
            // Trường hợp sản phẩm đang có trong order_details
            if (err.code === '23503') {
                return res.status(400).json({ message: 'Không thể xóa sản phẩm đã có trong đơn hàng.' });
            }
            res.status(500).json({ error: err.message });
        }
    },
};

module.exports = productController;
