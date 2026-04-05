const { Pool } = require('pg');
require('dotenv').config();

// Cấu hình kết nối tới PostgreSQL Neon
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false // Bắt buộc cho Neon/AWS SSL
  }
});

// Kiểm tra kết nối khi khởi động
pool.on('connect', () => {
  console.log('PostgreSQL Connected Successfully!');
});

pool.on('error', (err) => {
  console.error('Unexpected error on idle client', err);
  process.exit(-1);
});

module.exports = {
  query: (text, params) => pool.query(text, params),
  pool
};
