require('dotenv').config();

const express = require('express');
const cors = require('cors');
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const jwt = require('jsonwebtoken');
const { Keypair, TransactionBuilder, Operation, Asset, BASE_FEE, Networks, Horizon } = require('@stellar/stellar-sdk');

const app = express();
const FRONTEND_URL = process.env.FRONTEND_URL || '';
app.use(cors({
    origin: FRONTEND_URL ? [FRONTEND_URL, 'http://localhost:5173', 'http://localhost:3000'] : '*',
    credentials: true,
}));
app.use(express.json());

function newId() {
    return crypto.randomUUID();
}

function dbErrorResponse(res, error, context) {
    console.error(`${context} error:`, error);
    if (error.code === 'ER_ACCESS_DENIED_ERROR') {
        return res.status(503).json({
            error: 'No se puede conectar a MySQL. Revisa DB_USER y DB_PASSWORD en backend/.env (usa tu usuario root de MySQL local).',
        });
    }
    if (error.code === 'ER_BAD_DB_ERROR') {
        return res.status(503).json({
            error: 'La base de datos no existe. Ejecuta: mysql -u root -p < backend/schema.sql',
        });
    }
    if (error.code === 'ECONNREFUSED') {
        return res.status(503).json({
            error: 'MySQL no está encendido. Inicia el servicio MySQL en Windows o ejecuta npm run db:up (Docker).',
        });
    }
    return res.status(500).json({ error: 'Internal server error' });
}

function signToken(user) {
    return jwt.sign(
        {
            id: user.id,
            email: user.email,
            stellar_address: user.stellar_address || null,
        },
        JWT_SECRET,
        { expiresIn: '7d' }
    );
}

async function getUserById(id) {
    const [rows] = await pool.query(
        'SELECT id, name, email, stellar_address, loyalty_points FROM users WHERE id = ?',
        [id]
    );
    return rows[0] || null;
}

async function resolveStellarAddress(userFromToken) {
    if (userFromToken.stellar_address) return userFromToken.stellar_address;
    const user = await getUserById(userFromToken.id);
    return user?.stellar_address || null;
}

const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';

const CONTRACT_ID = process.env.CONTRACT_ID || 'CCK5C6NBWBPMATNCGL5O6DI6QRELKK5K3KUXZOOSJXJM4OL6KZQTINS4';
const NETWORK = process.env.STELLAR_NETWORK || 'testnet';

const pool = require('./lib/storage');

const DEMO_PACKAGES = [
    {
        destination: 'Cancún', description: 'Playa, arrecife y cultura maya. Paquete todo incluido.',
        start_date: '2026-07-01', end_date: '2026-07-07', capacity: 40, price: 1250,
        deposit_percent: 20, image_url: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=800',
    },
    {
        destination: 'Ciudad de México', description: 'Historia, gastronomía y museos en la capital.',
        start_date: '2026-08-15', end_date: '2026-08-20', capacity: 30, price: 890,
        deposit_percent: 15, image_url: 'https://images.unsplash.com/photo-1518654090668-93fc06ada88e?w=800',
    },
    {
        destination: 'Cartagena', description: 'Ciudad amurallada, Caribe y arquitectura colonial.',
        start_date: '2026-09-10', end_date: '2026-09-17', capacity: 25, price: 1100,
        deposit_percent: 25, image_url: 'https://images.unsplash.com/photo-1580654712600-7f5f7d0b8f0e?w=800',
    },
    {
        destination: 'Patagonia', description: 'Glaciares, trekking y naturaleza en el sur.',
        start_date: '2026-11-01', end_date: '2026-11-10', capacity: 15, price: 2400,
        deposit_percent: 30, image_url: 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=800',
    },
    {
        destination: 'Machu Picchu', description: 'La ciudad perdida de los Incas en los Andes peruanos.',
        start_date: '2026-10-05', end_date: '2026-10-12', capacity: 20, price: 1800,
        deposit_percent: 20, image_url: 'https://images.unsplash.com/photo-1587595431973-160d0d94add1?w=800',
    },
    {
        destination: 'Torres del Paine', description: 'Trekking y naturaleza en el parque nacional chileno.',
        start_date: '2026-12-01', end_date: '2026-12-08', capacity: 12, price: 2100,
        deposit_percent: 30, image_url: 'https://images.unsplash.com/photo-1580651315530-69c8e0026377?w=800',
    },
];

async function initDatabase() {
    try {
        await pool.query('SELECT 1 FROM users LIMIT 1');
    } catch {
        console.log('BD vacía — ejecutando schema.sql...');
        const schemaPath = path.join(__dirname, 'schema.sql');
        if (fs.existsSync(schemaPath)) {
            let sql = fs.readFileSync(schemaPath, 'utf8');
            sql = sql.replace(/CREATE DATABASE .*?;/gi, '').replace(/USE .*?;/gi, '');
            const statements = sql.split(';').filter(s => s.trim().length > 0);
            for (const stmt of statements) {
                try { await pool.query(stmt); } catch { }
            }
        }

        const bioSchemaPath = path.join(__dirname, 'db', 'biometric-schema.sql');
        if (fs.existsSync(bioSchemaPath)) {
            const bioSql = fs.readFileSync(bioSchemaPath, 'utf8');
            try { await pool.query(bioSql); } catch { }
        }

        try {
            await pool.query('ALTER TABLE users ADD COLUMN pin_hash VARCHAR(255) DEFAULT NULL, ADD COLUMN pin_enabled BOOLEAN DEFAULT FALSE');
        } catch { }

        console.log('Schema aplicado.');
    }

    const [adminRows] = await pool.query('SELECT id FROM users WHERE email = ?', ['admin@admin.com']);
    if (adminRows.length === 0) {
        const hash = await bcrypt.hash('123456', 10);
        await pool.query(
            'INSERT INTO users (id, name, email, password_hash) VALUES (?, ?, ?, ?)',
            [crypto.randomUUID(), 'Admin Turismo', 'admin@admin.com', hash]
        );
        console.log('Admin creado: admin@admin.com / 123456');
    }

    fundTestnetAccount(PLATFORM_STELLAR_ADDRESS);

    const [pkgCount] = await pool.query('SELECT COUNT(*) AS n FROM travel_packages');
    if (pkgCount[0].n === 0) {
        for (const pkg of DEMO_PACKAGES) {
            await pool.query(
                `INSERT INTO travel_packages (id, destination, description, start_date, end_date, capacity, available_slots, price, deposit_percent, image_url, is_active)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, TRUE)`,
                [crypto.randomUUID(), pkg.destination, pkg.description, pkg.start_date, pkg.end_date,
                 pkg.capacity, pkg.capacity, pkg.price, pkg.deposit_percent, pkg.image_url]
            );
        }
        console.log(`${DEMO_PACKAGES.length} paquetes de demo insertados.`);
    }
}

function invokeContract(functionName, args) {
    try {
        const cmd = `stellar contract invoke --id ${CONTRACT_ID} --network ${NETWORK} --fn ${functionName} ${args}`;
        const result = execSync(cmd, { encoding: 'utf8', timeout: 30000 });
        return result.trim();
    } catch (error) {
        console.error(`Contract invocation error: ${error.message}`);
        throw new Error(`Blockchain operation failed: ${error.message}`);
    }
}

async function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) {
        return res.status(401).json({ error: 'Authentication required' });
    }
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded;
        next();
    } catch (err) {
        return res.status(403).json({ error: 'Invalid or expired token' });
    }
}

async function authenticateAdmin(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) {
        return res.status(401).json({ error: 'Authentication required' });
    }
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        if (!decoded.email || !decoded.email.endsWith('@admin.com')) {
            return res.status(403).json({ error: 'Admin access required' });
        }
        req.user = decoded;
        next();
    } catch (err) {
        return res.status(403).json({ error: 'Invalid or expired token' });
    }
}

function generateStellarKeypair(provider, identifier) {
    const salt = 'stellar-social-v1';
    const combined = `${provider}:${identifier}:${salt}`;
    const hash = crypto.createHash('sha256').update(combined).digest();
    return Keypair.fromRawEd25519Seed(hash);
}

const stellarServer = new Horizon.Server('https://horizon-testnet.stellar.org');

async function getStellarBalance(publicKey) {
    try {
        const account = await stellarServer.loadAccount(publicKey);
        const xlmBalance = account.balances.find(b => b.asset_type === 'native');
        return xlmBalance ? parseFloat(xlmBalance.balance) : 0;
    } catch {
        return 0;
    }
}

const PLATFORM_KEYPAIR = Keypair.fromRawEd25519Seed(
    crypto.createHash('sha256').update('alas-latinas-platform-v1').digest()
);
const PLATFORM_STELLAR_ADDRESS = PLATFORM_KEYPAIR.publicKey();

function decodeGoogleJWT(token) {
    try {
        const parts = token.split('.');
        if (parts.length !== 3) throw new Error('Invalid JWT format');
        const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
        if (!payload.iss || (payload.iss !== 'https://accounts.google.com' && payload.iss !== 'accounts.google.com')) {
            throw new Error('Invalid token issuer');
        }
        if (GOOGLE_CLIENT_ID && payload.aud !== GOOGLE_CLIENT_ID) {
            throw new Error('Invalid token audience');
        }
        if (!payload.exp || payload.exp < Date.now() / 1000) {
            throw new Error('Token expired');
        }
        if (!payload.sub || !payload.email) {
            throw new Error('Missing user info in token');
        }
        return payload;
    } catch (err) {
        throw new Error(`Token verification failed: ${err.message}`);
    }
}

async function fundTestnetAccount(publicKey) {
    try {
        const response = await fetch(`https://friendbot.stellar.org?addr=${publicKey}`);
        if (!response.ok) throw new Error(`Friendbot responded with ${response.status}`);
        console.log('Account funded with testnet XLM:', publicKey);
        await new Promise(resolve => setTimeout(resolve, 3000));
        return true;
    } catch (error) {
        console.warn('Friendbot funding warning:', error.message);
        return false;
    }
}

const { registerWebAuthnRoutes } = require('./webauthn-routes');
registerWebAuthnRoutes(app, { pool, authenticateToken, signToken, getUserById, newId });

// =============================================
// AUTH ENDPOINTS
// =============================================
app.post('/api/auth/register', async (req, res) => {
    try {
        const { name, email, password, stellar_address } = req.body;
        if (!name || !email || !password) {
            return res.status(400).json({ error: 'Name, email, and password are required' });
        }

        const [existing] = await pool.query('SELECT id FROM users WHERE email = ?', [email]);
        if (existing.length > 0) {
            return res.status(409).json({ error: 'Email already registered' });
        }

        const password_hash = await bcrypt.hash(password, 10);
        let stellarAddress = stellar_address;
        if (!stellarAddress) {
            stellarAddress = generateStellarKeypair('email', email).publicKey();
        }

        const userId = newId();
        await pool.query(
            'INSERT INTO users (id, name, email, password_hash, stellar_address) VALUES (?, ?, ?, ?, ?)',
            [userId, name, email, password_hash, stellarAddress]
        );

        const user = await getUserById(userId);
        const token = signToken(user);

        fundTestnetAccount(stellarAddress);

        res.status(201).json({ user, token });
    } catch (error) {
        return dbErrorResponse(res, error, 'Register');
    }
});

app.post('/api/auth/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        if (!email || !password) {
            return res.status(400).json({ error: 'Email and password are required' });
        }

        const [rows] = await pool.query('SELECT * FROM users WHERE email = ?', [email]);
        if (rows.length === 0) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        const user = rows[0];
        const validPassword = await bcrypt.compare(password, user.password_hash);
        if (!validPassword) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        const token = signToken(user);

        res.json({
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
                stellar_address: user.stellar_address,
                loyalty_points: user.loyalty_points,
            },
            token,
        });
    } catch (error) {
        return dbErrorResponse(res, error, 'Login');
    }
});

app.post('/api/auth/google', async (req, res) => {
    try {
        const { credential } = req.body;
        if (!credential) {
            return res.status(400).json({ error: 'Google credential is required' });
        }

        const googleUser = decodeGoogleJWT(credential);
        const { sub, email, name, picture } = googleUser;

        const keypair = generateStellarKeypair('google', email);
        const stellarAddress = keypair.publicKey();

        const [existing] = await pool.query('SELECT * FROM users WHERE email = ?', [email]);

        if (existing.length > 0) {
            const user = existing[0];
            if (!user.stellar_address) {
                await pool.query('UPDATE users SET stellar_address = ? WHERE id = ?', [stellarAddress, user.id]);
                user.stellar_address = stellarAddress;
            }
            const token = signToken(user);
            return res.json({
                user: { id: user.id, name: user.name, email: user.email, stellar_address: user.stellar_address, loyalty_points: user.loyalty_points },
                token, isNew: false
            });
        }

        const passwordHash = await bcrypt.hash(crypto.randomUUID(), 10);
        const userId = newId();
        await pool.query(
            'INSERT INTO users (id, name, email, password_hash, stellar_address) VALUES (?, ?, ?, ?, ?)',
            [userId, name || 'Usuario', email, passwordHash, stellarAddress]
        );

        await fundTestnetAccount(stellarAddress);

        const user = await getUserById(userId);
        const token = signToken(user);

        res.status(201).json({ user, token, isNew: true });
    } catch (error) {
        console.error('Google auth error:', error);
        res.status(401).json({ error: error.message || 'Google authentication failed' });
    }
});

// =============================================
// PIN AUTH ENDPOINTS
// =============================================
app.post('/api/auth/pin/set', authenticateToken, async (req, res) => {
    try {
        const { pin } = req.body;
        if (!pin || pin.length < 4 || pin.length > 8 || !/^\d+$/.test(pin)) {
            return res.status(400).json({ error: 'PIN debe ser numérico de 4 a 8 dígitos' });
        }
        const pin_hash = await bcrypt.hash(pin, 10);
        await pool.query('UPDATE users SET pin_hash = ?, pin_enabled = TRUE WHERE id = ?', [pin_hash, req.user.id]);
        res.json({ message: 'PIN configurado correctamente' });
    } catch (error) {
        console.error('Set PIN error:', error);
        res.status(500).json({ error: 'Error al configurar PIN' });
    }
});

app.post('/api/auth/pin/login', async (req, res) => {
    try {
        const { email, pin } = req.body;
        if (!email || !pin) {
            return res.status(400).json({ error: 'Email y PIN requeridos' });
        }
        const [rows] = await pool.query('SELECT * FROM users WHERE email = ?', [email]);
        if (rows.length === 0) {
            return res.status(401).json({ error: 'Credenciales inválidas' });
        }
        const user = rows[0];
        if (!user.pin_hash) {
            return res.status(400).json({ error: 'Este usuario no tiene PIN configurado. Inicia sesión con contraseña y configúralo en el Dashboard.' });
        }
        const valid = await bcrypt.compare(pin, user.pin_hash);
        if (!valid) {
            return res.status(401).json({ error: 'PIN incorrecto' });
        }
        const token = signToken(user);
        res.json({
            user: { id: user.id, name: user.name, email: user.email, stellar_address: user.stellar_address, loyalty_points: user.loyalty_points },
            token, method: 'pin'
        });
    } catch (error) {
        console.error('PIN login error:', error);
        res.status(500).json({ error: 'Error al iniciar sesión con PIN' });
    }
});

// =============================================
// QR AUTH ENDPOINTS
// =============================================
const qrSessions = new Map();

app.post('/api/auth/qr/generate', authenticateToken, async (req, res) => {
    try {
        const sessionId = crypto.randomUUID();
        qrSessions.set(sessionId, {
            userId: req.user.id,
            status: 'pending',
            createdAt: Date.now(),
        });
        setTimeout(() => qrSessions.delete(sessionId), 5 * 60 * 1000);
        res.json({ sessionId, expiresIn: 300 });
    } catch (error) {
        console.error('QR generate error:', error);
        res.status(500).json({ error: 'Error al generar QR' });
    }
});

app.post('/api/auth/qr/login-init', async (req, res) => {
    try {
        const sessionId = crypto.randomUUID();
        qrSessions.set(sessionId, {
            userId: null,
            status: 'pending',
            createdAt: Date.now(),
        });
        setTimeout(() => qrSessions.delete(sessionId), 5 * 60 * 1000);
        res.json({ sessionId, expiresIn: 300 });
    } catch (error) {
        console.error('QR login-init error:', error);
        res.status(500).json({ error: 'Error al generar QR' });
    }
});

app.get('/api/auth/qr/status/:sessionId', async (req, res) => {
    try {
        const session = qrSessions.get(req.params.sessionId);
        if (!session) {
            return res.status(404).json({ error: 'Sesión QR expirada o inválida' });
        }
        if (session.status === 'approved') {
            qrSessions.delete(req.params.sessionId);
            return res.json({ status: 'approved', token: session.token, user: session.user });
        }
        res.json({ status: session.status });
    } catch (error) {
        console.error('QR status error:', error);
        res.status(500).json({ error: 'Error al verificar QR' });
    }
});

app.post('/api/auth/qr/approve', authenticateToken, async (req, res) => {
    try {
        const { sessionId } = req.body;
        const session = qrSessions.get(sessionId);
        if (!session) {
            return res.status(404).json({ error: 'Sesión QR expirada' });
        }
        if (session.userId && session.userId !== req.user.id) {
            return res.status(403).json({ error: 'No autorizado' });
        }
        const user = await getUserById(req.user.id);
        const token = signToken(user);
        session.status = 'approved';
        session.token = token;
        session.user = { id: user.id, name: user.name, email: user.email, stellar_address: user.stellar_address, loyalty_points: user.loyalty_points };
        res.json({ message: 'QR aprobado', user: user.email });
    } catch (error) {
        console.error('QR approve error:', error);
        res.status(500).json({ error: 'Error al aprobar QR' });
    }
});

// =============================================
// STELLAR ENDPOINTS
// =============================================
app.get('/api/stellar/balance', authenticateToken, async (req, res) => {
    try {
        const stellarAddress = await resolveStellarAddress(req.user);
        if (!stellarAddress) {
            return res.json({ balance: 0, address: null });
        }
        const balance = await getStellarBalance(stellarAddress);
        res.json({ balance, address: stellarAddress, platform_address: PLATFORM_STELLAR_ADDRESS });
    } catch (error) {
        console.error('Stellar balance error:', error);
        res.status(500).json({ error: 'Error al consultar saldo' });
    }
});

app.post('/api/stellar/fund', authenticateToken, async (req, res) => {
    try {
        const stellarAddress = await resolveStellarAddress(req.user);
        if (!stellarAddress) {
            return res.status(400).json({ error: 'Cuenta Stellar no disponible' });
        }
        const balance = await getStellarBalance(stellarAddress);
        if (balance > 0) {
            return res.json({ message: 'La cuenta ya tiene fondos', balance, address: stellarAddress });
        }
        await fundTestnetAccount(stellarAddress);
        const newBalance = await getStellarBalance(stellarAddress);
        res.json({ message: 'Cuenta fondeada con 10,000 XLM', balance: newBalance, address: stellarAddress });
    } catch (error) {
        console.error('Stellar fund error:', error);
        res.status(500).json({ error: 'Error al fondear cuenta' });
    }
});

// =============================================
// PACKAGES ENDPOINTS
// =============================================
app.get('/api/packages', async (req, res) => {
    try {
        const { destination, min_price, max_price, active } = req.query;
        let query = 'SELECT * FROM travel_packages WHERE 1=1';
        const params = [];

        if (destination) {
            params.push(`%${destination}%`);
            query += ` AND destination LIKE ?`;
        }
        if (min_price) {
            params.push(min_price);
            query += ` AND price >= ?`;
        }
        if (max_price) {
            params.push(max_price);
            query += ` AND price <= ?`;
        }
        if (active !== undefined) {
            params.push(active === 'true' ? 1 : 0);
            query += ` AND is_active = ?`;
        }

        query += ' ORDER BY start_date ASC';
        const [rows] = await pool.query(query, params);
        res.json({ packages: rows });
    } catch (error) {
        console.error('Get packages error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.get('/api/packages/:id', async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT * FROM travel_packages WHERE id = ?', [req.params.id]);
        if (rows.length === 0) {
            return res.status(404).json({ error: 'Package not found' });
        }
        res.json({ package: rows[0] });
    } catch (error) {
        console.error('Get package error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.post('/api/packages', authenticateToken, async (req, res) => {
    try {
        const { destination, description, start_date, end_date, capacity, price, deposit_percent, image_url } = req.body;
        if (!destination || !start_date || !end_date || !capacity || !price) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        const pkgId = newId();
        await pool.query(
            `INSERT INTO travel_packages (id, destination, description, start_date, end_date, capacity, available_slots, price, deposit_percent, image_url)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [pkgId, destination, description, start_date, end_date, capacity, capacity, price, deposit_percent || 20, image_url]
        );

        const [pkgRows] = await pool.query('SELECT * FROM travel_packages WHERE id = ?', [pkgId]);
        const pkg = pkgRows[0];

        try {
            const contractPkgId = invokeContract('create_package',
                `--arg-string "${destination}" --arg-i128 ${Math.round(price * 100)} --arg-u32 ${capacity} --arg-u32 ${deposit_percent || 20}`
            );
            await pool.query('UPDATE travel_packages SET contract_package_id = ? WHERE id = ?', [contractPkgId, pkg.id]);
            pkg.contract_package_id = contractPkgId;
        } catch (contractError) {
            console.warn('Contract package creation warning:', contractError.message);
        }

        res.status(201).json({ package: pkg });
    } catch (error) {
        console.error('Create package error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// =============================================
// RESERVATIONS ENDPOINTS
// =============================================
app.post('/api/reservations', authenticateToken, async (req, res) => {
    try {
        const { package_id } = req.body;
        if (!package_id) {
            return res.status(400).json({ error: 'Package ID is required' });
        }

        const [pkgRows] = await pool.query('SELECT * FROM travel_packages WHERE id = ? AND is_active = TRUE', [package_id]);
        if (pkgRows.length === 0) {
            return res.status(404).json({ error: 'Package not found or inactive' });
        }

        const pkg = pkgRows[0];
        if (pkg.available_slots <= 0) {
            return res.status(400).json({ error: 'No available slots' });
        }

        const deposit = (parseFloat(pkg.price) * pkg.deposit_percent) / 100;
        const totalPrice = parseFloat(pkg.price);

        const stellarAddress = await resolveStellarAddress(req.user);
        if (!stellarAddress) {
            return res.status(400).json({ error: 'Cuenta Stellar no configurada. Cierra sesión e inicia de nuevo.' });
        }

        const resId = newId();
        await pool.query(
            `INSERT INTO reservations (id, user_id, package_id, total_price, deposit_amount, status) VALUES (?, ?, ?, ?, ?, 'pending')`,
            [resId, req.user.id, package_id, totalPrice, deposit]
        );

        const [reservationRows] = await pool.query('SELECT * FROM reservations WHERE id = ?', [resId]);
        const reservation = reservationRows[0];

        await pool.query('UPDATE travel_packages SET available_slots = available_slots - 1 WHERE id = ?', [package_id]);

        let txHash = null;
        try {
            const userKeypair = generateStellarKeypair('email', req.user.email);
            const userAccount = await stellarServer.loadAccount(stellarAddress);
            const depositStroops = Math.floor(deposit * 1e7);
            const tx = new TransactionBuilder(userAccount, {
                fee: BASE_FEE,
                networkPassphrase: Networks.TESTNET,
            })
                .addOperation(Operation.payment({
                    destination: PLATFORM_STELLAR_ADDRESS,
                    asset: Asset.native(),
                    amount: (depositStroops / 1e7).toFixed(7),
                }))
                .setTimeout(30)
                .build();
            tx.sign(userKeypair);
            const result = await stellarServer.submitTransaction(tx);
            txHash = result.hash;
            await pool.query('UPDATE reservations SET payment_transaction_hash = ? WHERE id = ?', [txHash, resId]);
        } catch (txError) {
            console.warn('XLM transfer warning (demo):', txError.message);
        }

        try {
            const contractResId = invokeContract('create_reservation',
                `--arg-addr ${stellarAddress} --arg-u64 ${pkg.contract_package_id || 1}`
            );
            await pool.query('UPDATE reservations SET contract_reservation_id = ? WHERE id = ?', [contractResId, reservation.id]);
            reservation.contract_reservation_id = contractResId;
        } catch (contractError) {
            console.warn('Contract reservation creation warning:', contractError.message);
        }

        await pool.query(
            'INSERT INTO payment_log (reservation_id, transaction_type, amount, status) VALUES (?, ?, ?, ?)',
            [reservation.id, 'deposit', deposit, 'pending']
        );

        res.status(201).json({ reservation, stellar_tx: txHash });
    } catch (error) {
        console.error('Create reservation error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.get('/api/reservations', authenticateToken, async (req, res) => {
    try {
        const { status } = req.query;
        let query = `SELECT r.*, p.destination, p.start_date, p.end_date 
                     FROM reservations r 
                     JOIN travel_packages p ON r.package_id = p.id 
                     WHERE r.user_id = ?`;
        const params = [req.user.id];

        if (status) {
            params.push(status);
            query += ` AND r.status = ?`;
        }

        query += ' ORDER BY r.created_at DESC';
        const [rows] = await pool.query(query, params);
        res.json({ reservations: rows });
    } catch (error) {
        console.error('Get reservations error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.get('/api/reservations/:id', authenticateToken, async (req, res) => {
    try {
        const [rows] = await pool.query(
            `SELECT r.*, p.destination, p.start_date, p.end_date, p.description 
             FROM reservations r 
             JOIN travel_packages p ON r.package_id = p.id 
             WHERE r.id = ? AND r.user_id = ?`,
            [req.params.id, req.user.id]
        );
        if (rows.length === 0) {
            return res.status(404).json({ error: 'Reservation not found' });
        }
        res.json({ reservation: rows[0] });
    } catch (error) {
        console.error('Get reservation error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// =============================================
// PAYMENT ENDPOINTS
// =============================================
app.post('/api/payments/confirm', authenticateToken, async (req, res) => {
    try {
        const { reservation_id, transaction_hash } = req.body;
        if (!reservation_id) {
            return res.status(400).json({ error: 'Reservation ID is required' });
        }

        const [rows] = await pool.query('SELECT * FROM reservations WHERE id = ? AND user_id = ?', [reservation_id, req.user.id]);
        if (rows.length === 0) {
            return res.status(404).json({ error: 'Reservation not found' });
        }

        const reservation = rows[0];
        if (reservation.status !== 'pending') {
            return res.status(400).json({ error: 'Reservation is not pending payment' });
        }

        await pool.query(
            `UPDATE reservations SET status = 'confirmed', payment_transaction_hash = ? WHERE id = ?`,
            [transaction_hash || null, reservation_id]
        );

        await pool.query(
            `UPDATE payment_log SET status = 'completed', transaction_hash = ? 
             WHERE reservation_id = ? AND transaction_type = 'deposit' AND status = 'pending'`,
            [transaction_hash || null, reservation_id]
        );

        try {
            invokeContract('confirm_payment', `--arg-u64 ${reservation.contract_reservation_id || 1}`);
        } catch (contractError) {
            console.warn('Contract payment confirmation warning:', contractError.message);
        }

        res.json({ message: 'Payment confirmed', reservation_id });
    } catch (error) {
        console.error('Confirm payment error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// =============================================
// REFUND ENDPOINTS
// =============================================
app.post('/api/refunds', authenticateToken, async (req, res) => {
    try {
        const { reservation_id, reason } = req.body;
        if (!reservation_id) {
            return res.status(400).json({ error: 'Reservation ID is required' });
        }

        const [rows] = await pool.query('SELECT * FROM reservations WHERE id = ? AND user_id = ?', [reservation_id, req.user.id]);
        if (rows.length === 0) {
            return res.status(404).json({ error: 'Reservation not found' });
        }

        const reservation = rows[0];
        if (reservation.status === 'completed') {
            return res.status(400).json({ error: 'Cannot refund completed reservation' });
        }
        if (reservation.status === 'refunded') {
            return res.status(400).json({ error: 'Reservation already refunded' });
        }

        await pool.query(
            `UPDATE reservations SET status = 'refunded', refund_transaction_hash = ? WHERE id = ?`,
            [null, reservation_id]
        );

        await pool.query(
            `UPDATE travel_packages SET available_slots = available_slots + 1 WHERE id = ?`,
            [reservation.package_id]
        );

        await pool.query(
            `INSERT INTO payment_log (reservation_id, transaction_type, amount, status) VALUES (?, ?, ?, ?)`,
            [reservation_id, 'refund', reservation.deposit_amount, 'completed']
        );

        try {
            invokeContract('process_refund', `--arg-u64 ${reservation.contract_reservation_id || 1}`);
        } catch (contractError) {
            console.warn('Contract refund warning:', contractError.message);
        }

        res.json({ message: 'Refund processed', reservation_id });
    } catch (error) {
        console.error('Refund error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// =============================================
// REVIEWS ENDPOINTS
// =============================================
app.post('/api/reviews', authenticateToken, async (req, res) => {
    try {
        const { package_id, rating, comment, reservation_id } = req.body;
        if (!package_id || !rating) {
            return res.status(400).json({ error: 'Package ID and rating are required' });
        }
        if (rating < 1 || rating > 5) {
            return res.status(400).json({ error: 'Rating must be between 1 and 5' });
        }

        if (reservation_id) {
            const [resRows] = await pool.query('SELECT * FROM reservations WHERE id = ? AND user_id = ?', [reservation_id, req.user.id]);
            if (resRows.length === 0 || resRows[0].status !== 'completed') {
                return res.status(400).json({ error: 'Can only review completed reservations' });
            }
        }

        const reviewId = newId();
        await pool.query(
            `INSERT INTO reviews (id, user_id, package_id, reservation_id, rating, comment) VALUES (?, ?, ?, ?, ?, ?)`,
            [reviewId, req.user.id, package_id, reservation_id || null, rating, comment || null]
        );

        const [reviewRows] = await pool.query('SELECT * FROM reviews WHERE id = ?', [reviewId]);
        res.status(201).json({ review: reviewRows[0] });
    } catch (error) {
        console.error('Create review error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.get('/api/reviews/package/:package_id', async (req, res) => {
    try {
        const [rows] = await pool.query(
            `SELECT r.rating, r.comment, r.created_at, u.name as user_name 
             FROM reviews r 
             JOIN users u ON r.user_id = u.id 
             WHERE r.package_id = ? 
             ORDER BY r.created_at DESC`,
            [req.params.package_id]
        );

        const reviews = rows;
        const avgRating = reviews.length > 0
            ? reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length
            : 0;

        res.json({ reviews, average_rating: parseFloat(avgRating.toFixed(2)), total: reviews.length });
    } catch (error) {
        console.error('Get reviews error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// =============================================
// FAVORITES ENDPOINTS
// =============================================
app.post('/api/favorites', authenticateToken, async (req, res) => {
    try {
        const { package_id } = req.body;
        if (!package_id) {
            return res.status(400).json({ error: 'Package ID is required' });
        }

        try {
            const favId = newId();
            await pool.query(
                `INSERT INTO favorites (id, user_id, package_id) VALUES (?, ?, ?)`,
                [favId, req.user.id, package_id]
            );
            const [favRows] = await pool.query('SELECT * FROM favorites WHERE id = ?', [favId]);
            res.status(201).json({ favorite: favRows[0] });
        } catch (err) {
            if (err.code === 'ER_DUP_ENTRY') {
                return res.json({ message: 'Already in favorites' });
            }
            throw err;
        }
    } catch (error) {
        console.error('Add favorite error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.delete('/api/favorites/:package_id', authenticateToken, async (req, res) => {
    try {
        await pool.query('DELETE FROM favorites WHERE user_id = ? AND package_id = ?', [req.user.id, req.params.package_id]);
        res.json({ message: 'Favorite removed' });
    } catch (error) {
        console.error('Remove favorite error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.get('/api/favorites', authenticateToken, async (req, res) => {
    try {
        const [rows] = await pool.query(
            `SELECT p.*, f.created_at as favorited_at 
             FROM favorites f 
             JOIN travel_packages p ON f.package_id = p.id 
             WHERE f.user_id = ? 
             ORDER BY f.created_at DESC`,
            [req.user.id]
        );
        res.json({ favorites: rows });
    } catch (error) {
        console.error('Get favorites error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// =============================================
// LOYALTY ENDPOINTS
// =============================================
app.get('/api/loyalty', authenticateToken, async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT loyalty_points FROM users WHERE id = ?', [req.user.id]);
        res.json({ loyalty_points: rows[0]?.loyalty_points || 0 });
    } catch (error) {
        console.error('Get loyalty error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// =============================================
// ADMIN ENDPOINTS
// =============================================
app.post('/api/admin/confirm-service', authenticateAdmin, async (req, res) => {
    try {
        const { reservation_id } = req.body;
        if (!reservation_id) {
            return res.status(400).json({ error: 'Reservation ID is required' });
        }

        const [rows] = await pool.query('SELECT * FROM reservations WHERE id = ?', [reservation_id]);
        if (rows.length === 0) {
            return res.status(404).json({ error: 'Reservation not found' });
        }

        const reservation = rows[0];
        if (reservation.status !== 'confirmed') {
            return res.status(400).json({ error: 'Reservation must be confirmed first' });
        }

        await pool.query("UPDATE reservations SET status = 'completed' WHERE id = ?", [reservation_id]);

        await pool.query('UPDATE users SET loyalty_points = loyalty_points + 10 WHERE id = ?', [reservation.user_id]);

        try {
            invokeContract('confirm_service', `--arg-u64 ${reservation.contract_reservation_id || 1}`);
        } catch (contractError) {
            console.warn('Contract service confirmation warning:', contractError.message);
        }

        res.json({ message: 'Service confirmed as completed', reservation_id });
    } catch (error) {
        console.error('Confirm service error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// =============================================
// ADMIN ENDPOINTS
// =============================================
app.get('/api/admin/users', authenticateAdmin, async (req, res) => {
    try {
        const [users] = await pool.query(
            `SELECT u.id, u.name, u.email, u.stellar_address, u.loyalty_points, u.created_at,
                    COUNT(DISTINCT r.id) as total_reservations,
                    COUNT(DISTINCT CASE WHEN r.status = 'completed' THEN r.id END) as completed_reservations
             FROM users u
             LEFT JOIN reservations r ON r.user_id = u.id
             GROUP BY u.id
             ORDER BY u.created_at DESC`
        );
        res.json({ users });
    } catch (error) {
        console.error('Admin get users error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.get('/api/admin/packages', authenticateAdmin, async (req, res) => {
    try {
        const [packages] = await pool.query(
            `SELECT p.*, COUNT(DISTINCT r.id) as total_reservations,
                    COUNT(DISTINCT CASE WHEN r.status IN ('confirmed','completed') THEN r.id END) as active_reservations
             FROM travel_packages p
             LEFT JOIN reservations r ON r.package_id = p.id
             GROUP BY p.id
             ORDER BY p.created_at DESC`
        );
        res.json({ packages });
    } catch (error) {
        console.error('Admin get packages error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.put('/api/admin/packages/:id', authenticateAdmin, async (req, res) => {
    try {
        const { destination, description, start_date, end_date, capacity, price, deposit_percent, image_url, is_active } = req.body;
        const [existing] = await pool.query('SELECT * FROM travel_packages WHERE id = ?', [req.params.id]);
        if (existing.length === 0) {
            return res.status(404).json({ error: 'Package not found' });
        }

        const pkg = existing[0];
        const updates = [];
        const params = [];

        if (destination !== undefined) { updates.push('destination = ?'); params.push(destination); }
        if (description !== undefined) { updates.push('description = ?'); params.push(description); }
        if (start_date !== undefined) { updates.push('start_date = ?'); params.push(start_date); }
        if (end_date !== undefined) { updates.push('end_date = ?'); params.push(end_date); }
        if (capacity !== undefined) {
            const oldCap = pkg.capacity;
            const diff = capacity - oldCap;
            const newAvailable = pkg.available_slots + diff;
            updates.push('capacity = ?', 'available_slots = ?');
            params.push(capacity, newAvailable >= 0 ? newAvailable : 0);
        }
        if (price !== undefined) { updates.push('price = ?'); params.push(price); }
        if (deposit_percent !== undefined) { updates.push('deposit_percent = ?'); params.push(deposit_percent); }
        if (image_url !== undefined) { updates.push('image_url = ?'); params.push(image_url); }
        if (is_active !== undefined) { updates.push('is_active = ?'); params.push(is_active); }

        if (updates.length === 0) {
            return res.json({ message: 'No changes' });
        }

        params.push(req.params.id);
        await pool.query(`UPDATE travel_packages SET ${updates.join(', ')} WHERE id = ?`, params);

        const [updated] = await pool.query('SELECT * FROM travel_packages WHERE id = ?', [req.params.id]);
        res.json({ package: updated[0] });
    } catch (error) {
        console.error('Admin update package error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.delete('/api/admin/packages/:id', authenticateAdmin, async (req, res) => {
    try {
        const [existing] = await pool.query('SELECT * FROM travel_packages WHERE id = ?', [req.params.id]);
        if (existing.length === 0) {
            return res.status(404).json({ error: 'Package not found' });
        }
        await pool.query('UPDATE travel_packages SET is_active = FALSE WHERE id = ?', [req.params.id]);
        res.json({ message: 'Package deactivated' });
    } catch (error) {
        console.error('Admin deactivate package error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.get('/api/admin/reservations', authenticateAdmin, async (req, res) => {
    try {
        const { status } = req.query;
        let query = `SELECT r.*, u.name as user_name, u.email as user_email, p.destination, p.start_date, p.end_date
                     FROM reservations r
                     JOIN users u ON r.user_id = u.id
                     JOIN travel_packages p ON r.package_id = p.id
                     WHERE 1=1`;
        const params = [];
        if (status) {
            params.push(status);
            query += ' AND r.status = ?';
        }
        query += ' ORDER BY r.created_at DESC';
        const [rows] = await pool.query(query, params);
        res.json({ reservations: rows });
    } catch (error) {
        console.error('Admin get reservations error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.post('/api/admin/confirm-payment', authenticateAdmin, async (req, res) => {
    try {
        const { reservation_id } = req.body;
        if (!reservation_id) {
            return res.status(400).json({ error: 'Reservation ID is required' });
        }

        const [rows] = await pool.query('SELECT * FROM reservations WHERE id = ?', [reservation_id]);
        if (rows.length === 0) {
            return res.status(404).json({ error: 'Reservation not found' });
        }

        const reservation = rows[0];
        if (reservation.status !== 'pending') {
            return res.status(400).json({ error: 'Reservation is not pending' });
        }

        await pool.query("UPDATE reservations SET status = 'confirmed' WHERE id = ?", [reservation_id]);
        await pool.query(
            "UPDATE payment_log SET status = 'completed' WHERE reservation_id = ? AND transaction_type = 'deposit' AND status = 'pending'",
            [reservation_id]
        );

        try {
            invokeContract('confirm_payment', `--arg-u64 ${reservation.contract_reservation_id || 1}`);
        } catch (contractError) {
            console.warn('Contract payment confirmation warning:', contractError.message);
        }

        res.json({ message: 'Payment confirmed by admin', reservation_id });
    } catch (error) {
        console.error('Admin confirm payment error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.post('/api/admin/process-refund', authenticateAdmin, async (req, res) => {
    try {
        const { reservation_id } = req.body;
        if (!reservation_id) {
            return res.status(400).json({ error: 'Reservation ID is required' });
        }

        const [rows] = await pool.query('SELECT * FROM reservations WHERE id = ?', [reservation_id]);
        if (rows.length === 0) {
            return res.status(404).json({ error: 'Reservation not found' });
        }

        const reservation = rows[0];
        if (reservation.status === 'completed') {
            return res.status(400).json({ error: 'Cannot refund completed reservation' });
        }
        if (reservation.status === 'refunded') {
            return res.status(400).json({ error: 'Already refunded' });
        }

        await pool.query("UPDATE reservations SET status = 'refunded' WHERE id = ?", [reservation_id]);
        await pool.query('UPDATE travel_packages SET available_slots = available_slots + 1 WHERE id = ?', [reservation.package_id]);
        await pool.query(
            "INSERT INTO payment_log (reservation_id, transaction_type, amount, status) VALUES (?, 'refund', ?, 'completed')",
            [reservation_id, reservation.deposit_amount]
        );

        try {
            invokeContract('process_refund', `--arg-u64 ${reservation.contract_reservation_id || 1}`);
        } catch (contractError) {
            console.warn('Contract refund warning:', contractError.message);
        }

        res.json({ message: 'Refund processed by admin', reservation_id });
    } catch (error) {
        console.error('Admin process refund error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.get('/api/health', async (req, res) => {
    try {
        await pool.query('SELECT 1');
        const [rows] = await pool.query('SELECT COUNT(*) AS packages FROM travel_packages WHERE is_active = TRUE');
        res.json({
            status: 'ok',
            storage: pool.storageLabel || pool.mode,
            contract_id: CONTRACT_ID,
            network: NETWORK,
            active_packages: rows[0].packages,
        });
    } catch (err) {
        res.status(503).json({ status: 'error', database: 'disconnected', message: err.message });
    }
});

async function startServer() {
    try {
        await pool.query('SELECT 1');
        console.log(`Almacenamiento: ${pool.storageLabel || pool.mode}`);
        await initDatabase();
        if (pool.mode === 'web3') {
            console.log(`Contrato Soroban (testnet): ${CONTRACT_ID}`);
        }
    } catch (err) {
        console.error('Almacenamiento no disponible:', err.message);
        if (pool.mode === 'mysql') {
            console.error('Inicia MySQL: cd backend && npm run db:up && npm run db:seed');
        }
    }

    app.listen(PORT, () => {
    console.log(`Tourism Blockchain API running on http://localhost:${PORT}`);
    console.log('Available endpoints:');
    console.log('  POST   /api/auth/register');
    console.log('  POST   /api/auth/login');
    console.log('  POST   /api/auth/google');
    console.log('  GET    /api/auth/biometric/check');
    console.log('  POST   /api/auth/biometric/register-options');
    console.log('  POST   /api/auth/biometric/register-verify');
    console.log('  POST   /api/auth/biometric/login-options');
    console.log('  POST   /api/auth/biometric/login-verify');
    console.log('  GET    /api/auth/biometric/status');
    console.log('  POST   /api/auth/pin/set');
    console.log('  POST   /api/auth/pin/login');
    console.log('  POST   /api/auth/qr/generate');
    console.log('  POST   /api/auth/qr/login-init');
    console.log('  GET    /api/auth/qr/status/:sessionId');
    console.log('  POST   /api/auth/qr/approve');
    console.log('  GET    /api/packages');
    console.log('  GET    /api/packages/:id');
    console.log('  POST   /api/packages');
    console.log('  POST   /api/reservations');
    console.log('  GET    /api/reservations');
    console.log('  GET    /api/reservations/:id');
    console.log('  POST   /api/payments/confirm');
    console.log('  POST   /api/refunds');
    console.log('  POST   /api/reviews');
    console.log('  GET    /api/reviews/package/:package_id');
    console.log('  POST   /api/favorites');
    console.log('  GET    /api/favorites');
    console.log('  DELETE /api/favorites/:package_id');
    console.log('  GET    /api/stellar/balance');
    console.log('  POST   /api/stellar/fund');
    console.log('  GET    /api/loyalty');
    console.log('  POST   /api/admin/confirm-service');
    console.log('  GET    /api/admin/users');
    console.log('  GET    /api/admin/packages');
    console.log('  PUT    /api/admin/packages/:id');
    console.log('  DELETE /api/admin/packages/:id');
    console.log('  GET    /api/admin/reservations');
    console.log('  POST   /api/admin/confirm-payment');
    console.log('  POST   /api/admin/process-refund');
    console.log('  GET    /api/health');
    });
}

startServer();
