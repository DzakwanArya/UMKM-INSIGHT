const mysql = require('mysql2/promise');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

let useSqlite = false;
let pool = null;
let sqliteDb = null;

// Helper to normalize SQL queries for compatibility between MySQL and SQLite
const normalizeSql = (sql) => {
  if (!sql) return sql;
  if (useSqlite) {
    // Normalize SQLite: convert MySQL specific types
    let res = sql
      .replace(/AUTO_INCREMENT/gi, '')
      .replace(/INT PRIMARY KEY/gi, 'INTEGER PRIMARY KEY')
      .replace(/VARCHAR\(\d+\)/gi, 'TEXT')
      .replace(/TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP/gi, 'DATETIME DEFAULT CURRENT_TIMESTAMP')
      .replace(/TIMESTAMP DEFAULT CURRENT_TIMESTAMP/gi, 'DATETIME DEFAULT CURRENT_TIMESTAMP')
      .replace(/ON UPDATE CURRENT_TIMESTAMP/gi, '')
      .replace(/NOW\(\)/gi, "datetime('now', 'localtime')");
    return res;
  } else {
    // MySQL mode
    return sql.replace(/datetime\('now',\s*'localtime'\)/g, 'NOW()');
  }
};

// Helper for INSERT/UPDATE/DELETE queries
const run = async (sql, params = []) => {
  const normSql = normalizeSql(sql);
  if (useSqlite) {
    return new Promise((resolve, reject) => {
      sqliteDb.run(normSql, params, function(err) {
        if (err) {
          console.error(`SQLite run error on query: ${normSql}`, err);
          reject(err);
        } else {
          resolve({ id: this.lastID, changes: this.changes });
        }
      });
    });
  } else {
    const [results] = await pool.execute(normSql, params);
    return { id: results.insertId, changes: results.affectedRows };
  }
};

// Helper to fetch multiple rows (SELECT ALL)
const all = async (sql, params = []) => {
  const normSql = normalizeSql(sql);
  if (useSqlite) {
    return new Promise((resolve, reject) => {
      sqliteDb.all(normSql, params, (err, rows) => {
        if (err) {
          console.error(`SQLite all error on query: ${normSql}`, err);
          reject(err);
        } else {
          resolve(rows || []);
        }
      });
    });
  } else {
    const [rows] = await pool.execute(normSql, params);
    return rows;
  }
};

// Helper to fetch a single row (SELECT SINGLE)
const get = async (sql, params = []) => {
  const normSql = normalizeSql(sql);
  if (useSqlite) {
    return new Promise((resolve, reject) => {
      sqliteDb.get(normSql, params, (err, row) => {
        if (err) {
          console.error(`SQLite get error on query: ${normSql}`, err);
          reject(err);
        } else {
          resolve(row || null);
        }
      });
    });
  } else {
    const [rows] = await pool.execute(normSql, params);
    return rows[0] || null;
  }
};

// Seeding function to populate local tables with mock data if empty
const seedLocalDataIfEmpty = async () => {
  try {
    const marketplaceCount = await get('SELECT COUNT(*) as count FROM marketplace_transactions');
    const posCount = await get('SELECT COUNT(*) as count FROM pos_transactions');
    const supplierCount = await get('SELECT COUNT(*) as count FROM supplier_transactions');

    const totalCount = (marketplaceCount?.count || 0) + (posCount?.count || 0) + (supplierCount?.count || 0);

    if (totalCount > 0) {
      console.log(`Local tables already contain transaction data (${totalCount} records). Skipping seeding.`);
      return;
    }

    console.log('Seeding initial mock data into local database tables...');

    const umkms = [
      { id: 'umkm_01', name: 'Warung Berkah F&B', category: 'Makanan & Minuman' },
      { id: 'umkm_02', name: 'Zahra Boutique', category: 'Pakaian' },
      { id: 'umkm_03', name: 'Sentosa Rattan', category: 'Kerajinan' },
      { id: 'umkm_04', name: 'Glow Up Cosmetics', category: 'Kecantikan' }
    ];
    const suppliers = [
      { id: 'sup_01', name: 'Sembako Jaya' },
      { id: 'sup_02', name: 'Textile Grosir' },
      { id: 'sup_03', name: 'Rotan Lestari' }
    ];

    const now = new Date();
    let seededMarketplace = 0;
    let seededPos = 0;
    let seededSupplier = 0;

    // Create transactions for the past 30 days
    for (let i = 29; i >= 0; i--) {
      const currentDate = new Date(now);
      currentDate.setDate(now.getDate() - i);
      const dateStr = currentDate.toISOString().split('T')[0];

      // Generate 3 to 8 transactions per day
      const dailyTxCount = Math.floor(Math.random() * 6) + 3;

      for (let j = 0; j < dailyTxCount; j++) {
        const umkm = umkms[Math.floor(Math.random() * umkms.length)];
        const txType = Math.random() > 0.3 ? 'inflow' : 'outflow';

        const txId = `TX-${dateStr.replace(/-/g, '')}-${i}${j}`;
        const hour = Math.floor(Math.random() * 12) + 8;
        const timestamp = `${dateStr} ${hour.toString().padStart(2, '0')}:${Math.floor(Math.random() * 60).toString().padStart(2, '0')}:00`;

        if (txType === 'inflow') {
          const isMarketplace = Math.random() > 0.4;
          const amount = Math.floor(Math.random() * 150000) + 20000;
          const fee = isMarketplace ? 2000 : 1000;
          const tax = Math.floor(amount * 0.1);
          const buyerId = `user_cust_${Math.floor(Math.random() * 100)}`;

          if (isMarketplace) {
            await run(
              `INSERT INTO marketplace_transactions (id, timestamp, from_user, to_user, amount, fee, tax, status, umkm_id, umkm_name, category)
               VALUES (?, ?, ?, ?, ?, ?, ?, 'success', ?, ?, ?)`,
              [txId, timestamp, buyerId, umkm.id, amount, fee, tax, umkm.id, umkm.name, umkm.category]
            );
            seededMarketplace++;
          } else {
            await run(
              `INSERT INTO pos_transactions (id, timestamp, from_user, to_user, amount, fee, tax, status, umkm_id, umkm_name, category)
               VALUES (?, ?, ?, ?, ?, ?, ?, 'success', ?, ?, ?)`,
              [txId, timestamp, buyerId, umkm.id, amount, fee, tax, umkm.id, umkm.name, umkm.category]
            );
            seededPos++;
          }
        } else {
          const supplier = suppliers[Math.floor(Math.random() * suppliers.length)];
          const amount = Math.floor(Math.random() * 300000) + 50000;
          const tax = Math.floor(amount * 0.1);

          await run(
            `INSERT INTO supplier_transactions (id, timestamp, from_user, to_user, amount, tax, status, umkm_id, umkm_name, category, supplier_name)
             VALUES (?, ?, ?, ?, ?, ?, 'success', ?, ?, ?, ?)`,
            [txId, timestamp, umkm.id, supplier.id, amount, tax, umkm.id, umkm.name, umkm.category, supplier.name]
          );
          seededSupplier++;
        }
      }
    }

    console.log(`Seeding completed: ${seededMarketplace} Marketplace, ${seededPos} POS, ${seededSupplier} Supplier transactions.`);
  } catch (err) {
    console.error('Error seeding initial local data:', err);
  }
};

// Initialize database tables
const initDb = async () => {
  try {
    pool = mysql.createPool({
      host: process.env.DB_HOST || 'localhost',
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_NAME || 'umkm_insight',
      port: process.env.DB_PORT || 3306,
      waitForConnections: true,
      connectionLimit: 5,
      queueLimit: 0
    });

    const conn = await pool.getConnection();
    conn.release();
    console.log('Successfully connected to MySQL database.');
    useSqlite = false;
  } catch (error) {
    console.warn('MySQL connection failed, falling back to local SQLite3 database. Error details:', error.message);
    useSqlite = true;

    const dbPath = path.resolve(__dirname, '../database.sqlite');
    sqliteDb = new sqlite3.Database(dbPath, (err) => {
      if (err) {
        console.error('Failed to open SQLite database:', err.message);
      } else {
        console.log(`Opened local SQLite database at: ${dbPath}`);
      }
    });
  }

  try {
    // Create tables
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

    await run(`
      CREATE TABLE IF NOT EXISTS subscriptions (
        id VARCHAR(255) PRIMARY KEY,
        user_id VARCHAR(255) NOT NULL,
        amount INT DEFAULT 10000,
        status VARCHAR(50) DEFAULT 'pending',
        snap_token VARCHAR(255) NULL,
        plan_type VARCHAR(50) DEFAULT '7_days',
        duration_days INT DEFAULT 7,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);

    await run(`
      CREATE TABLE IF NOT EXISTS api_logs (
        id INTEGER PRIMARY KEY AUTO_INCREMENT,
        timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        endpoint VARCHAR(255) NOT NULL,
        method VARCHAR(50) NOT NULL,
        user_id VARCHAR(255) NULL,
        app_name VARCHAR(100) DEFAULT 'umkm-insight',
        status_code INT NULL,
        error_message TEXT NULL
      )
    `);

    await run(`
      CREATE TABLE IF NOT EXISTS marketplace_transactions (
        id VARCHAR(255) PRIMARY KEY,
        timestamp VARCHAR(255) NOT NULL,
        from_user VARCHAR(255),
        to_user VARCHAR(255),
        amount INT,
        fee INT,
        tax INT,
        status VARCHAR(50),
        umkm_id VARCHAR(255),
        umkm_name VARCHAR(255),
        category VARCHAR(255)
      )
    `);

    await run(`
      CREATE TABLE IF NOT EXISTS pos_transactions (
        id VARCHAR(255) PRIMARY KEY,
        timestamp VARCHAR(255) NOT NULL,
        from_user VARCHAR(255),
        to_user VARCHAR(255),
        amount INT,
        fee INT,
        tax INT,
        status VARCHAR(50),
        umkm_id VARCHAR(255),
        umkm_name VARCHAR(255),
        category VARCHAR(255)
      )
    `);

    await run(`
      CREATE TABLE IF NOT EXISTS supplier_transactions (
        id VARCHAR(255) PRIMARY KEY,
        timestamp VARCHAR(255) NOT NULL,
        from_user VARCHAR(255),
        to_user VARCHAR(255),
        amount INT,
        tax INT,
        status VARCHAR(50),
        umkm_id VARCHAR(255),
        umkm_name VARCHAR(255),
        category VARCHAR(255),
        supplier_name VARCHAR(255)
      )
    `);

    await run(`
      CREATE TABLE IF NOT EXISTS bank_transactions (
        id VARCHAR(255) PRIMARY KEY,
        subscription_id VARCHAR(255) UNIQUE NOT NULL,
        user_id VARCHAR(255) NOT NULL,
        amount INT NOT NULL,
        plan_type VARCHAR(50) NOT NULL,
        status VARCHAR(50) DEFAULT 'success',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    console.log('Database tables successfully initialized.');

    await seedLocalDataIfEmpty();

  } catch (error) {
    console.error('Error initializing database tables:', error);
  }
};

module.exports = {
  pool,
  db: { run, all, get },
  run,
  all,
  get,
  initDb
};
