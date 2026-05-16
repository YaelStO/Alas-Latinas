const express = require('express');
const mysql = require('mysql2/promise');
const bcrypt = require('bcrypt');
const { execSync } = require('child_process');
const jwt = require('jsonwebtoken');

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

const CONTRACT_ID = process.env.CONTRACT_ID || 'CCK5C6NBWBPMATNCGL5O6DI6QRELKK5K3KUXZOOSJXJM4OL6KZQTINS4';
const NETWORK = process.env.STELLAR_NETWORK || 'testnet';

const pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'turismo_blockchain',
    waitForConnections: true,
    connectionLimit: 10,
});

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
        const [result] = await pool.query(
            'INSERT INTO users (name, email, password_hash, stellar_address) VALUES (?, ?, ?, ?)',
            [name, email, password_hash, stellar_address || null]
        );

        const [userRows] = await pool.query(
            'SELECT id, name, email, stellar_address, loyalty_points FROM users WHERE id = ?',
            [result.insertId]
        );
        const user = userRows[0];
        const token = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: '7d' });

        res.status(201).json({ user, token });
    } catch (error) {
        console.error('Register error:', error);
        res.status(500).json({ error: 'Internal server error' });
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

        const token = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: '7d' });

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
        console.error('Login error:', error);
        res.status(500).json({ error: 'Internal server error' });
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

        const [result] = await pool.query(
            `INSERT INTO travel_packages (destination, description, start_date, end_date, capacity, available_slots, price, deposit_percent, image_url)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [destination, description, start_date, end_date, capacity, capacity, price, deposit_percent || 20, image_url]
        );

        const [pkgRows] = await pool.query('SELECT * FROM travel_packages WHERE id = ?', [result.insertId]);
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

        const [resResult] = await pool.query(
            `INSERT INTO reservations (user_id, package_id, total_price, deposit_amount, status) VALUES (?, ?, ?, ?, 'pending')`,
            [req.user.id, package_id, totalPrice, deposit]
        );

        const [reservationRows] = await pool.query('SELECT * FROM reservations WHERE id = ?', [resResult.insertId]);
        const reservation = reservationRows[0];

        await pool.query('UPDATE travel_packages SET available_slots = available_slots - 1 WHERE id = ?', [package_id]);

        try {
            const contractResId = invokeContract('create_reservation',
                `--arg-addr ${req.user.stellar_address || 'GAA...' } --arg-u64 ${pkg.contract_package_id || 1}`
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

        const [result] = await pool.query(
            `INSERT INTO reviews (user_id, package_id, reservation_id, rating, comment) VALUES (?, ?, ?, ?, ?)`,
            [req.user.id, package_id, reservation_id || null, rating, comment || null]
        );

        const [reviewRows] = await pool.query('SELECT * FROM reviews WHERE id = ?', [result.insertId]);
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
            const [result] = await pool.query(
                `INSERT INTO favorites (user_id, package_id) VALUES (?, ?)`,
                [req.user.id, package_id]
            );
            const [favRows] = await pool.query('SELECT * FROM favorites WHERE id = ?', [result.insertId]);
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
app.post('/api/admin/confirm-service', authenticateToken, async (req, res) => {
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

app.listen(PORT, () => {
    console.log(`Tourism Blockchain API running on http://localhost:${PORT}`);
    console.log('Available endpoints:');
    console.log('  POST   /api/auth/register');
    console.log('  POST   /api/auth/login');
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
});
