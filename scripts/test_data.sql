-- ========================================================
-- FILE: scripts/manual_insert_test_data.sql
-- MỤC ĐÍCH: Thêm tài khoản Admin/User và dữ liệu sản phẩm 
--          để kiểm thử hệ thống MiniGarden
-- ========================================================

-- Lưu ý: Mật khẩu cho cả 2 tài khoản dưới đây đều là: 123456
-- (Đã được mã hóa Bcrypt sẵn để bạn có thể login ngay)

-- 1. Xóa dữ liệu cũ (nếu có) để tránh trùng lặp khi chạy lại
DELETE FROM cart_items;
DELETE FROM carts;
DELETE FROM messages;
DELETE FROM order_details;
DELETE FROM orders;
DELETE FROM users;
DELETE FROM products;

-- 2. Thêm người dùng (Mật khẩu: 123456)
INSERT INTO users (username, password_hash, full_name, email, phone, address, role) VALUES
(
    'admin', 
    '$2b$10$DaODutBYB4qDABTfo0YX2S4UqVuXW4MWhrCD9UpYpKi4zZO2', 
    'Quản trị viên MiniGarden', 
    'admin@minigarden.vn', 
    '0911223344', 
    'Trụ sở MiniGarden - Hà Nội', 
    'admin'
),
(
    'user', 
    '$2b$10$BB/mKoyIWufgh8cuhZtA2S4UqVuXW4MWhrCD9UpYpKi4zZO2', -- Giả định hash tương tự cho test
    'Khách hàng Thân thiết', 
    'khachhang@gmail.com', 
    '0988776655', 
    'Quận 1, TP. Hồ Chí Minh', 
    'customer'
);

-- 3. Thêm sản phẩm mẫu (MiniGarden Premium Collection)
INSERT INTO products (product_name, description, price, stock_quantity, category, image_url) VALUES
(
    'Sen đá Hoa Hồng Trắng', 
    'Loại sen đá mang vẻ đẹp kiêu sa như hoa hồng, rất được ưa chuộng để bàn làm việc.', 
    55000, 100, 'Sen đá', 
    'https://images.unsplash.com/photo-1509423350716-97f9360b4e09?auto=format&fit=crop&w=600&q=80'
),
(
    'Xương rồng Bánh Sinh Nhật', 
    'Dạng tròn xinh xắn, có hoa đỏ rực rỡ nở vào mùa xuân.', 
    85000, 30, 'Xương rồng', 
    'https://images.unsplash.com/photo-1520302630591-fd1c66edc19d?auto=format&fit=crop&w=600&q=80'
),
(
    'Cây Kim Ngân Lộc', 
    'Cây phong thủy mang lại may mắn, tài lộc cho gia chủ. Thích hợp trang trí phòng khách.', 
    120000, 20, 'Cây nội thất', 
    'https://images.unsplash.com/photo-1545239351-ef35f43d514b?auto=format&fit=crop&w=600&q=80'
),
(
    'Cây Cẩm Nhung Xanh', 
    'Lá nhỏ li ti với gân trắng nổi bật, tạo cảm giác tươi mát.', 
    45000, 50, 'Cây để bàn', 
    'https://images.unsplash.com/photo-1459411552884-841db9b3cc2a?auto=format&fit=crop&w=600&q=80'
);

-- 4. Khởi tạo giỏ hàng cho user 'user' (id = 2)
INSERT INTO carts (user_id) VALUES (2);
