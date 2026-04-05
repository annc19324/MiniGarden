-- ==========================================
-- SQL DATABASE SCHEMA - MINIGARDEN SYSTEM
-- Database: PostgreSQL (Neon)
-- ==========================================

-- 1. Bảng Người dùng (users)
CREATE TABLE users (
    user_id SERIAL PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    full_name VARCHAR(100),
    email VARCHAR(100) UNIQUE NOT NULL,
    phone VARCHAR(15),
    address TEXT,
    role VARCHAR(20) DEFAULT 'customer' CHECK (role IN ('customer', 'admin')),
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 2. Bảng Sản phẩm (products)
CREATE TABLE products (
    product_id SERIAL PRIMARY KEY,
    product_name VARCHAR(150) NOT NULL,
    description TEXT,
    price NUMERIC(12, 2) NOT NULL,
    stock_quantity INTEGER DEFAULT 0,
    image_url TEXT,
    category VARCHAR(50),
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 3. Bảng Giỏ hàng (carts)
CREATE TABLE carts (
    cart_id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id)
);

-- 4. Chi tiết Giỏ hàng (cart_items)
CREATE TABLE cart_items (
    cart_item_id SERIAL PRIMARY KEY,
    cart_id INTEGER NOT NULL REFERENCES carts(cart_id) ON DELETE CASCADE,
    product_id INTEGER NOT NULL REFERENCES products(product_id) ON DELETE CASCADE,
    quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
    UNIQUE(cart_id, product_id)
);

-- 5. Bảng Đơn hàng (orders)
CREATE TABLE orders (
    order_id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(user_id),
    order_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    total_amount NUMERIC(12, 2) NOT NULL,
    shipping_address TEXT NOT NULL,
    payment_method VARCHAR(50) DEFAULT 'COD',
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'processing', 'shipped', 'completed', 'cancelled')),
    payos_order_id TEXT, -- ID từ PayOS để đối soát
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 6. Chi tiết Đơn hàng (order_details)
CREATE TABLE order_details (
    order_detail_id SERIAL PRIMARY KEY,
    order_id INTEGER NOT NULL REFERENCES orders(order_id) ON DELETE CASCADE,
    product_id INTEGER NOT NULL REFERENCES products(product_id),
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    price_at_purchase NUMERIC(12, 2) NOT NULL
);

-- 7. Bảng Tin nhắn (messages)
CREATE TABLE messages (
    message_id SERIAL PRIMARY KEY,
    sender_id INTEGER NOT NULL REFERENCES users(user_id),
    receiver_id INTEGER NOT NULL REFERENCES users(user_id),
    message_text TEXT NOT NULL,
    sent_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    is_read BOOLEAN DEFAULT FALSE
);

-- ==========================================
-- DỮ LIỆU MẪU (SAMPLE DATA)
-- ==========================================

-- Thêm Users
INSERT INTO users (username, password_hash, full_name, email, phone, address, role) VALUES
('admin_garden', '$2b$10$hashed_admin_pass', 'Admin MiniGarden', 'admin@minigarden.vn', '0911223344', 'Hà Nội', 'admin'),
('nguyenvana', '$2b$10$hashed_user_pass', 'Nguyễn Văn An', 'vana@gmail.com', '0988776655', 'Hồ Chí Minh', 'customer');

-- Thêm Products
INSERT INTO products (product_name, description, price, stock_quantity, category, image_url) VALUES
('Sen đá Hoa Hồng Trắng', 'Kích thước mini, dễ chăm sóc', 55000, 100, 'Sen đá', 'https://res.cloudinary.com/demo/image/upload/sample.jpg'),
('Xương rồng Bánh Sinh Nhật', 'Dạng tròn, có gai mềm rực rỡ', 85000, 30, 'Xương rồng', 'https://res.cloudinary.com/demo/image/upload/sample.jpg'),
('Cây Kim Ngân mini', 'Phong thủy mang lại tài lộc', 120000, 20, 'Cây phong thủy', 'https://res.cloudinary.com/demo/image/upload/sample.jpg');

-- Thêm Giỏ hàng cho user 2
INSERT INTO carts (user_id) VALUES (2);
INSERT INTO cart_items (cart_id, product_id, quantity) VALUES (1, 1, 2);

-- Thêm Đơn hàng mẫu
INSERT INTO orders (user_id, total_amount, shipping_address, payment_method, status) VALUES
(2, 110000, '123 Đường Láng, Hà Nội', 'PayOS', 'paid');

-- Chi tiết đơn hàng
INSERT INTO order_details (order_id, product_id, quantity, price_at_purchase) VALUES
(1, 1, 2, 55000);
