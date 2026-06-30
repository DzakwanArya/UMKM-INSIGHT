const mysql = require('mysql2/promise');

async function createDb() {
  try {
    const connection = await mysql.createConnection({
      host: 'localhost',
      user: 'root',
      password: ''
    });
    await connection.query("CREATE DATABASE IF NOT EXISTS `umkm_insight`;");
    console.log("Database umkm_insight created or already exists.");
    await connection.end();
  } catch (error) {
    console.error("Error creating database:", error);
  }
}

createDb();
