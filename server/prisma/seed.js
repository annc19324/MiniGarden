const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
  console.log('Bắt đầu chèn dữ liệu mẫu (Seed Data)...');

  // Xóa dữ liệu cũ (Tùy chọn, để đảm bảo không bị lỗi unique constraint)
  await prisma.orderDetail.deleteMany();
  await prisma.order.deleteMany();
  await prisma.cartItem.deleteMany();
  await prisma.cart.deleteMany();
  await prisma.userAddress.deleteMany();
  await prisma.message.deleteMany();
  await prisma.product.deleteMany();
  await prisma.user.deleteMany();
  console.log('Đã làm sạch cơ sở dữ liệu.');

  // Tạo mật khẩu đã mã hóa
  const salt = await bcrypt.genSalt(10);
  const adminPassword = await bcrypt.hash('admin@123', salt);
  const userPassword = await bcrypt.hash('user@123', salt);

  // 1. Tạo Users
  console.log('Đang tạo Users...');
  const userAdmin = await prisma.user.create({
    data: {
      username: 'admin',
      password_hash: adminPassword,
      full_name: 'Quản Trị Viên',
      email: 'admin@minigarden.com',
      phone: '0987654321',
      role: 'admin',
    },
  });

  const userCustomer = await prisma.user.create({
    data: {
      username: 'user',
      password_hash: userPassword,
      full_name: 'Khách Hàng Mẫu',
      email: 'user@gmail.com',
      phone: '0123456789',
      role: 'customer',
      addresses: {
        create: [
          {
            full_name: 'Người Nhận Mẫu',
            phone: '0123456789',
            address: '123 Đường Cây Cảnh, Quận Xanh, TP. HCM',
            is_default: true,
          }
        ]
      }
    },
  });

  // Tạo giỏ hàng cho user
  await prisma.cart.create({
    data: { user_id: userCustomer.user_id }
  });


  // 2. Tạo Products
  console.log('Đang tạo Products...');
  
  const products = [
    // --- Sen Đá ---
    {
      product_name: 'Sen Đá Kim Cương Trắng',
      description: 'Sen đá kim cương lấp lánh như pha lê, dễ chăm sóc, thích hợp để bàn văn phòng.',
      price: 65000,
      stock_quantity: 50,
      image_url: 'https://images.unsplash.com/photo-1542316447-fd9e23c72b84?auto=format&fit=crop&w=800&q=80',
      category: 'Sen đá',
    },
    {
      product_name: 'Sen Đá Hoa Hồng Đen',
      description: 'Màu đen huyền bí, viền lá đỏ cuốn hút, chịu hạn tốt.',
      price: 55000,
      stock_quantity: 30,
      image_url: 'https://images.unsplash.com/photo-1497250681558-e4b2d556adcc?auto=format&fit=crop&w=800&q=80',
      category: 'Sen đá',
    },
    {
      product_name: 'Sen Đá Nâu',
      description: 'Cây sen đá phổ biến nhất, sức sống mãnh liệt biểu tượng cho tình bạn bền chặt.',
      price: 35000,
      stock_quantity: 100,
      image_url: 'https://images.unsplash.com/photo-1453904300235-0f2f60b15b5d?auto=format&fit=crop&w=800&q=80',
      category: 'Sen đá',
    },

    // --- Xương Rồng ---
    {
      product_name: 'Xương Rồng Tai Thỏ',
      description: 'Đáng yêu với dáng hình gióng tai thỏ, lớp gai như tơ trắng mịn màng.',
      price: 45000,
      stock_quantity: 60,
      image_url: 'https://images.unsplash.com/photo-1510425462529-6799059fba08?auto=format&fit=crop&w=800&q=80',
      category: 'Xương rồng',
    },
    {
      product_name: 'Xương Rồng Bánh Tê',
      description: 'Lớn nhanh, hoa nở rất đẹp vào mùa hè. Cần nhiều ánh nắng.',
      price: 85000,
      stock_quantity: 20,
      image_url: 'https://images.unsplash.com/photo-1509423350716-97f9360b4e09?auto=format&fit=crop&w=800&q=80',
      category: 'Xương rồng',
    },

    // --- Cây nội thất / để bàn ---
    {
      product_name: 'Cây Kim Tiền (Mini)',
      description: 'Cây phong thủy mang lại phú quý, tiền tài cho gia chủ. Rất dễ trồng trong nhà.',
      price: 120000,
      stock_quantity: 40,
      image_url: 'https://images.unsplash.com/photo-1596706935824-0cb2eb046358?auto=format&fit=crop&w=800&q=80',
      category: 'Cây nội thất',
    },
    {
      product_name: 'Cây Ngọc Ngân',
      description: 'Lá có đốm trắng cẩm thạch cực kỳ ấn tượng, hợp mệnh Kim và Thủy.',
      price: 110000,
      stock_quantity: 25,
      image_url: 'https://images.unsplash.com/photo-1616164478810-749e776ac9f9?auto=format&fit=crop&w=800&q=80',
      category: 'Cây để bàn',
    },

    // --- Cây hoa ---
    {
      product_name: 'Chậu Lan Hồ Điệp (Mini Túi)',
      description: 'Hoa lan hồ điệp giống mini, nở hoa quanh năm nếu được chăm sóc đúng cách.',
      price: 250000,
      stock_quantity: 15,
      image_url: 'https://images.unsplash.com/photo-1620063231464-9f456cde9dbb?auto=format&fit=crop&w=800&q=80',
      category: 'Cây hoa',
    }
  ];

  await prisma.product.createMany({
    data: products
  });

  const createdProducts = await prisma.product.findMany();

  // 3. Tạo một Order mẫu cho Admin thống kê
  console.log('Đang tạo Đơn hàng mẫu...');
  const sampleOrder = await prisma.order.create({
    data: {
      user_id: userCustomer.user_id,
      total_amount: 195000,
      shipping_address: '123 Đường Cây Cảnh, Quận Xanh, TP. HCM',
      payment_method: 'PayOS',
      status: 'shipped',
      details: {
        create: [
          {
            product_id: createdProducts[0].product_id, // Mua Sen Đá Kim Cương
            quantity: 1,
            price_at_purchase: 65000
          },
          {
            product_id: createdProducts[5].product_id, // Mua Kim Tiền
            quantity: 1,
            price_at_purchase: 130000
          }
        ]
      }
    }
  });

  console.log('✅ SEED DỮ LIỆU HOÀN TẤT!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
