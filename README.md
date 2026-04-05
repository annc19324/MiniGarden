# MiniGarden - Sàn thương mại điện tử Cây cảnh

## C. Mã nguồn chương trình (Source Code)
- **Thư mục source code**: `client/` (Frontend), `server/` (Backend).
- **Cấu trúc**: Dự án được chia làm hai phần tách biệt Client và Server để dễ dàng mở rộng và bảo trì.
- **Công nghệ sử dụng**:
    - **Frontend**: HTML5, CSS3 (Tailwind CSS), JavaScript (React 19), Vite.
    - **Backend**: Node.js, Express 5.x, Socket.io (Chat realtime).
    - **Cơ sở dữ liệu**: PostgreSQL, Prisma ORM.
    - **Tích hợp**: Cloudinary (Lưu trữ ảnh), PayOS SDK (Xác thực thanh toán ngân hàng tự động).

## D. Cơ sở dữ liệu (Database)
- **Thư mục Database**: `Database/`
- **File dump**: `minigarden_postgresql_dump.sql` (File export cho PostgreSQL).
- **File schema**: `schema.prisma` (Định nghĩa models cho Prisma).
- **Cách restore**: 
    1. Tạo một Database PostgreSQL mới.
    2. Import file `.sql` bằng công cụ như DBeaver, pgAdmin hoặc lệnh psql.
    3. Cập nhật `DATABASE_URL` trong file `.env` của server.

## E. Hướng dẫn chạy chương trình
### 1. Yêu cầu môi trường
- **Node.js**: Phiên bản 18.0 trở lên.
- **PostgreSQL**: Phiên bản 14 trở lên.
- **Tài khoản**: Cần có các API Key cho Cloudinary và PayOS (Đã cấu hình sẵn trong file `.env` mẫu).

### 2. Cách cài đặt và khởi chạy dự án
#### Cài đặt Backend (Server)
1. Truy cập thư mục server: `cd server`
2. Cài đặt thư viện: `npm install`
3. Tạo file `.env` (Nếu chưa có) và cấu hình `DATABASE_URL`.
4. Sinh Prisma Client: `npx prisma generate`
5. Khởi động server: `npm run dev`
   - Server sẽ chạy tại: `http://localhost:5000`

#### Cài đặt Frontend (Client)
1. Truy cập thư mục client: `cd client`
2. Cài đặt thư viện: `npm install`
3. Cấu hình file `.env` trỏ về API_URL của server.
4. Khởi động giao diện: `npm run dev`
   - Giao diện sẽ chạy tại: `http://localhost:5173`

### 3. Tài khoản đăng nhập mặc định
- **Tài khoản Quản trị (Admin)**: 
    - Username: `admin`
    - Password: `admin@123`
- **Tài khoản Khách hàng (User)**:
    - Username: `user`
    - Password: `user@123`

### 4. Cấu trúc thư mục và Mô tả chức năng
- `server/controllers/`: Xử lý logic nghiệp vụ (Auth, Product, Order).
- `server/routes/`: Định nghĩa các endpoint API.
- `server/prisma/`: Định nghĩa lược đồ cơ sở dữ liệu.
- `client/src/pages/`: Các trang giao diện (Trang chủ, Chat, Giỏ hàng, Admin).
- `client/src/components/`: Các thành phần tái sử dụng (Header, ProductCard).
