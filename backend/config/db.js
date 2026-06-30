const mysql = require('mysql2/promise');

// Membuat koneksi pool ke MySQL Laragon
const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'umkm_insight',
  port: process.env.DB_PORT || 3306,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

const normalizeSql = (sql) => {
  if (!sql) return sql;
  return sql.replace(/datetime\('now',\s*'localtime'\)/g, 'NOW()');
};

// Helper untuk query INSERT/UPDATE/DELETE (meniru pola SQLite)
const run = async (sql, params = []) => {
  sql = normalizeSql(sql);
  const [results] = await pool.execute(sql, params);
  return { id: results.insertId, changes: results.affectedRows };
};

// Helper untuk mengambil banyak baris (SELECT ALL)
const all = async (sql, params = []) => {
  sql = normalizeSql(sql);
  const [rows] = await pool.execute(sql, params);
  return rows;
};

// Helper untuk mengambil satu baris saja (SELECT SINGLE)
const get = async (sql, params = []) => {
  sql = normalizeSql(sql);
  const [rows] = await pool.execute(sql, params);
  return rows[0] || null;
};

// Inisialisasi pembuatan tabel baru jika belum ada di MySQL
const initDb = async () => {
  try {
    // 1. Tabel Users
    await run(`
      CREATE TABLE IF NOT EXISTS users (
        id VARCHAR(255) PRIMARY KEY,
        username VARCHAR(255) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        role VARCHAR(50) DEFAULT 'user',
        is_premium INT DEFAULT 0,
        premium_until VARCHAR(255) NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // 2. Tabel Subscriptions
    await run(`
      CREATE TABLE IF NOT EXISTS subscriptions (
        id VARCHAR(255) PRIMARY KEY,
        user_id VARCHAR(255) NOT NULL,
        amount INT DEFAULT 10000,
        status VARCHAR(50) DEFAULT 'pending',
        snap_token VARCHAR(255) NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);

    // 3. Tabel API Logs
    await run(`
      CREATE TABLE IF NOT EXISTS api_logs (
        id INT AUTO_INCREMENT PRIMARY KEY,
        timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        endpoint VARCHAR(255) NOT NULL,
        method VARCHAR(50) NOT NULL,
        user_id VARCHAR(255) NULL,
        app_name VARCHAR(100) DEFAULT 'umkm-insight',
        status_code INT NULL,
        error_message TEXT NULL
      )
    `);

    console.log('Database MySQL tables successfully initialized.');
  } catch (error) {
    console.error('Error initializing MySQL database tables:', error);
  }
};

// Ekspor pool dan fungsi helper agar kompatibel dengan kode sebelumnya
module.exports = {
  pool,
  db: { run, all, get }, // Untuk kompatibilitas jika ada yang memanggil db.run/get/all secara langsung
  run,
  all,
  get,
  initDb
};
