/**
 * Pobla la BD con usuario admin y paquetes de demo.
 * Uso: npm run db:seed  (desde backend/)
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const mysql = require('mysql2/promise');
const bcrypt = require('bcrypt');
const crypto = require('crypto');

const ADMIN_ID = 'b2000001-0000-4000-8000-000000000001';
const DEMO_PACKAGES = [
    {
        id: 'a1000001-0000-4000-8000-000000000001',
        destination: 'Cancún',
        description: 'Playa, arrecife y cultura maya. Paquete todo incluido.',
        start_date: '2026-07-01',
        end_date: '2026-07-07',
        capacity: 40,
        price: 1250,
        deposit_percent: 20,
        image_url: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=800',
    },
    {
        id: 'a1000001-0000-4000-8000-000000000002',
        destination: 'Ciudad de México',
        description: 'Historia, gastronomía y museos en la capital.',
        start_date: '2026-08-15',
        end_date: '2026-08-20',
        capacity: 30,
        price: 890,
        deposit_percent: 15,
        image_url: 'https://images.unsplash.com/photo-1518654090668-93fc06ada88e?w=800',
    },
    {
        id: 'a1000001-0000-4000-8000-000000000003',
        destination: 'Cartagena',
        description: 'Ciudad amurallada, Caribe y arquitectura colonial.',
        start_date: '2026-09-10',
        end_date: '2026-09-17',
        capacity: 25,
        price: 1100,
        deposit_percent: 25,
        image_url: 'https://images.unsplash.com/photo-1580654712600-7f5f7d0b8f0e?w=800',
    },
    {
        id: 'a1000001-0000-4000-8000-000000000004',
        destination: 'Patagonia',
        description: 'Glaciares, trekking y naturaleza en el sur.',
        start_date: '2026-11-01',
        end_date: '2026-11-10',
        capacity: 15,
        price: 2400,
        deposit_percent: 30,
        image_url: 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=800',
    },
];

async function waitForDb(config, attempts = 30) {
    for (let i = 1; i <= attempts; i++) {
        try {
            const pool = mysql.createPool(config);
            await pool.query('SELECT 1');
            await pool.end();
            return true;
        } catch {
            process.stdout.write(`Esperando MySQL (${i}/${attempts})...\r`);
            await new Promise((r) => setTimeout(r, 1000));
        }
    }
    return false;
}

async function main() {
    const config = {
        host: process.env.DB_HOST || 'localhost',
        user: process.env.DB_USER || 'turismo',
        password: process.env.DB_PASSWORD || 'turismo_dev',
        database: process.env.DB_NAME || 'turismo_blockchain',
        multipleStatements: true,
    };

    if (!(await waitForDb(config))) {
        console.error('\nNo se pudo conectar a MySQL. Ejecuta: npm run db:up');
        process.exit(1);
    }

    const pool = mysql.createPool(config);

    const fs = require('fs');
    const path = require('path');
    const sqlFiles = ['schema.sql', path.join('db', 'biometric-schema.sql')];
    for (const file of sqlFiles) {
        const schemaPath = path.join(__dirname, '..', file);
        if (fs.existsSync(schemaPath)) {
            await pool.query(fs.readFileSync(schemaPath, 'utf8'));
            console.log(`Schema aplicado: ${file}`);
        }
    }

    const [existingAdmin] = await pool.query('SELECT id FROM users WHERE email = ?', ['admin@admin.com']);
    if (existingAdmin.length === 0) {
        const hash = await bcrypt.hash('123456', 10);
        await pool.query(
            `INSERT INTO users (id, name, email, password_hash, stellar_address, loyalty_points)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [ADMIN_ID, 'Admin Turismo', 'admin@admin.com', hash, null, 0]
        );
        console.log('Usuario admin creado: admin@admin.com / 123456');
    } else {
        console.log('Usuario admin ya existe.');
    }

    for (const pkg of DEMO_PACKAGES) {
        await pool.query(
            `INSERT INTO travel_packages (
                id, destination, description, start_date, end_date,
                capacity, available_slots, price, deposit_percent, image_url, is_active
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, TRUE)
            ON DUPLICATE KEY UPDATE
                description = VALUES(description),
                available_slots = VALUES(available_slots),
                is_active = TRUE`,
            [
                pkg.id,
                pkg.destination,
                pkg.description,
                pkg.start_date,
                pkg.end_date,
                pkg.capacity,
                pkg.capacity,
                pkg.price,
                pkg.deposit_percent,
                pkg.image_url,
            ]
        );
    }
    console.log(`${DEMO_PACKAGES.length} paquetes de demo listos.`);

    const [count] = await pool.query('SELECT COUNT(*) AS n FROM travel_packages WHERE is_active = TRUE');
    console.log(`Paquetes activos en BD: ${count[0].n}`);

    await pool.end();
    console.log('Seed completado.');
}

main().catch((err) => {
    console.error(err.message);
    process.exit(1);
});
