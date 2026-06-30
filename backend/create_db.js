require('dotenv').config();
const mysql = require('mysql2/promise');

async function createDb() {
  const dbName = process.env.DB_NAME || 'umkm_insight';
  try {
    const connection = await mysql.createConnection({
      host: process.env.DB_HOST || 'localhost',
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
      port: Number(process.env.DB_PORT) || 3306
    });

    await connection.query(`CREATE DATABASE IF NOT EXISTS \`${dbName}\`;`);
    console.log(`Database ${dbName} created or already exists.`);
    await connection.end();
  } catch (error) {
    console.error('Error creating database:', error.message);
  }
}

createDb();
