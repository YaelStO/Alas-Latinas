/**
 * Capa de almacenamiento:
 * - mysql (default en Railway): base de datos MySQL
 * - web3: JSON local + contrato Stellar/Soroban
 */
require('dotenv').config();

const mode = (process.env.STORAGE_MODE || 'mysql').toLowerCase();

if (mode === 'mysql') {
    const mysql = require('mysql2/promise');

    // Soporte para URLs de Railway MySQL plugin
    const mysqlUrl = process.env.DATABASE_URL || process.env.MYSQL_URL || process.env.MYSQL_PUBLIC_URL;
    let pool;

    if (mysqlUrl) {
        pool = mysql.createPool(mysqlUrl);
    } else {
        const parsedPort = parseInt(process.env.DB_PORT || process.env.MYSQLPORT, 10);
        pool = mysql.createPool({
            host: process.env.DB_HOST || process.env.MYSQLHOST || 'localhost',
            port: !isNaN(parsedPort) ? parsedPort : 3306,
            user: process.env.DB_USER || process.env.MYSQLUSER || 'root',
            password: process.env.DB_PASSWORD || process.env.MYSQLPASSWORD || '',
            database: process.env.DB_NAME || process.env.MYSQLDATABASE || 'turismo_blockchain',
            waitForConnections: true,
            connectionLimit: 10,
        });
    }

    const dbName = process.env.DB_NAME || process.env.MYSQLDATABASE || 'Railway MySQL';

    module.exports = {
        query: (...args) => pool.query(...args),
        mode: 'mysql',
        storageLabel: `MySQL (${dbName})`,
    };
} else {
    module.exports = require('./web3-store');
}
