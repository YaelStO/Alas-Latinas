require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const mysql = require('mysql2/promise');

async function main() {
    const config = {
        host: process.env.DB_HOST || 'localhost',
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || '',
        database: process.env.DB_NAME || 'turismo_blockchain',
    };
    console.log('Probando conexión con:', { ...config, password: config.password ? '***' : '(vacía)' });
    try {
        const conn = await mysql.createConnection(config);
        await conn.query('SELECT 1');
        const [tables] = await conn.query('SHOW TABLES');
        console.log('OK — MySQL conectado. Tablas:', tables.length);
        await conn.end();
    } catch (err) {
        console.error('FALLO:', err.message);
        if (err.code === 'ER_ACCESS_DENIED_ERROR') {
            console.error('\n→ Edita backend/.env con tu contraseña real de MySQL (usuario root).');
        }
        if (err.code === 'ER_BAD_DB_ERROR') {
            console.error('\n→ Crea la BD: mysql -u root -p < backend/schema.sql');
        }
        process.exit(1);
    }
}

main();
