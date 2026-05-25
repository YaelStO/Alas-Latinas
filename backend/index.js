require('dotenv').config();

const express = require('express');
const cors = require('cors');
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const { execSync } = require('child_process');
const jwt = require('jsonwebtoken');
const { Keypair } = require('@stellar/stellar-sdk');

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

        res.status(201).json({ reservation });
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
