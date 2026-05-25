/**
 * Capa de almacenamiento:
 * - web3 (default): JSON local + contrato Stellar/Soroban
 * - mysql: base de datos relacional (opcional)
 */
require('dotenv').config();

const mode = (process.env.STORAGE_MODE || 'web3').toLowerCase();

if (mode === 'mysql') {
    const mysql = require('mysql2/promise');
    const pool = mysql.createPool({
        host: process.env.DB_HOST || 'localhost',
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || '',
        database: process.env.DB_NAME || 'turismo_blockchain',
        waitForConnections: true,
        connectionLimit: 10,
    });
    module.exports = {
        query: (...args) => pool.query(...args),
        mode: 'mysql',
        storageLabel: `MySQL (${process.env.DB_NAME || 'turismo_blockchain'})`,
    };
} else {
    module.exports = require('./web3-store');
}
