/**
 * Capa de almacenamiento:
 * - mysql (default en Railway): base de datos MySQL
 * - web3: JSON local + contrato Stellar/Soroban
 */
require('dotenv').config();

const mode = (process.env.STORAGE_MODE || 'mysql').toLowerCase();

if (mode === 'mysql') {
    const mysql = require('mysql2/promise');

    // Soporte para MYSQL_URL de Railway MySQL plugin
    const mysqlUrl = process.env.DATABASE_URL || process.env.MYSQL_URL;
    let pool;

    if (mysqlUrl) {
        pool = mysql.createPool(mysqlUrl);
    } else {
        pool = mysql.createPool({
            host: process.env.DB_HOST || 'localhost',
            user: process.env.DB_USER || 'root',
            password: process.env.DB_PASSWORD || '',
            database: process.env.DB_NAME || 'turismo_blockchain',
            waitForConnections: true,
            connectionLimit: 10,
        });
    }

    module.exports = {
        query: (...args) => pool.query(...args),
        mode: 'mysql',
        storageLabel: `MySQL (${process.env.DB_NAME || 'Railway MySQL'})`,
    };
} else {
    module.exports = require('./web3-store');
}
