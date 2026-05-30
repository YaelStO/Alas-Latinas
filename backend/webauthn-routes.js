const {
    generateRegistrationOptions,
    verifyRegistrationResponse,
    generateAuthenticationOptions,
    verifyAuthenticationResponse,
} = require('@simplewebauthn/server');

const RP_NAME = 'Alas Latinas Turismo';
const CHALLENGE_TTL_MS = 5 * 60 * 1000;
const challenges = new Map();

function getRpConfig(req) {
    const origin = req?.headers?.origin || process.env.WEBAUTHN_ORIGIN || 'http://localhost:5173';
    let rpID;
    try {
        rpID = new URL(origin).hostname;
    } catch {
        rpID = process.env.WEBAUTHN_RP_ID || 'localhost';
    }
    return { rpName: RP_NAME, rpID, origin };
}

function storeChallenge(key, challenge) {
    challenges.set(key, { challenge, expires: Date.now() + CHALLENGE_TTL_MS });
}

function consumeChallenge(key) {
    const entry = challenges.get(key);
    if (!entry || entry.expires < Date.now()) {
        challenges.delete(key);
        return null;
    }
    challenges.delete(key);
    return entry.challenge;
}

async function getCredentialsByUserId(pool, userId) {
    const [rows] = await pool.query(
        'SELECT id, credential_id, public_key, counter, transports FROM webauthn_credentials WHERE user_id = ?',
        [userId]
    );
    return rows;
}

async function getCredentialByCredentialId(pool, credentialId) {
    const [rows] = await pool.query(
        `SELECT c.*, u.id AS uid, u.name, u.email, u.stellar_address, u.loyalty_points
         FROM webauthn_credentials c
         JOIN users u ON c.user_id = u.id
         WHERE c.credential_id = ?`,
        [credentialId]
    );
    return rows[0] || null;
}

function registerWebAuthnRoutes(app, deps) {
    const { pool, authenticateToken, signToken, getUserById, newId } = deps;

    // Comprobar si el email tiene biometría registrada
    app.get('/api/auth/biometric/check', async (req, res) => {
        try {
            const { email } = req.query;
            if (!email) {
                return res.status(400).json({ error: 'Email requerido' });
            }
            const [users] = await pool.query('SELECT id FROM users WHERE email = ?', [email]);
            if (users.length === 0) {
                return res.json({ registered: false, has_biometric: false });
            }
            const [creds] = await pool.query(
                'SELECT COUNT(*) AS n FROM webauthn_credentials WHERE user_id = ?',
                [users[0].id]
            );
            res.json({
                registered: true,
                has_biometric: creds[0].n > 0,
                devices: Number(creds[0].n),
            });
        } catch (error) {
            console.error('Biometric check error:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    });

    // Registrar huella / Face ID (usuario autenticado)
    app.post('/api/auth/biometric/register-options', authenticateToken, async (req, res) => {
        try {
            const user = await getUserById(req.user.id);
            if (!user) {
                return res.status(404).json({ error: 'Usuario no encontrado' });
            }

            const existing = await getCredentialsByUserId(pool, user.id);
            const { rpID } = getRpConfig(req);

            const options = await generateRegistrationOptions({
                rpName: RP_NAME,
                rpID,
                userName: user.email,
                userDisplayName: user.name || user.email,
                attestationType: 'none',
                authenticatorSelection: {
                    authenticatorAttachment: 'platform',
                    residentKey: 'preferred',
                    userVerification: 'required',
                },
                excludeCredentials: existing.map((c) => ({
                    id: c.credential_id,
                    transports: JSON.parse(c.transports || '[]'),
                })),
            });

            storeChallenge(`reg:${user.id}`, options.challenge);

            res.json({ options });
        } catch (error) {
            console.error('Biometric register-options error:', error);
            res.status(500).json({ error: error.message || 'Error al generar opciones biométricas' });
        }
    });

    app.post('/api/auth/biometric/register-verify', authenticateToken, async (req, res) => {
        try {
            const userId = req.user.id;
            const { device_name, ...credentialResponse } = req.body;
            const expectedChallenge = consumeChallenge(`reg:${userId}`);
            if (!expectedChallenge) {
                return res.status(400).json({ error: 'Desafío expirado. Intenta de nuevo.' });
            }

            const { rpID, origin } = getRpConfig(req);
            const verification = await verifyRegistrationResponse({
                response: credentialResponse,
                expectedChallenge,
                expectedOrigin: origin,
                expectedRPID: rpID,
                requireUserVerification: true,
            });

            if (!verification.verified || !verification.registrationInfo) {
                return res.status(400).json({ error: 'Verificación biométrica fallida' });
            }

            const { credential } = verification.registrationInfo;
            const credentialId =
                typeof credential.id === 'string'
                    ? credential.id
                    : Buffer.from(credential.id).toString('base64url');

            const publicKeyB64 = Buffer.from(credential.publicKey).toString('base64');

            const credRecordId = newId();
            await pool.query(
                `INSERT INTO webauthn_credentials (id, user_id, credential_id, public_key, counter, device_name, transports)
                 VALUES (?, ?, ?, ?, ?, ?, ?)`,
                [
                    credRecordId,
                    userId,
                    credentialId,
                    publicKeyB64,
                    credential.counter,
                    device_name || 'Huella / Face ID',
                    JSON.stringify(credential.transports || []),
                ]
            );

            await pool.query('UPDATE users SET biometric_enabled = TRUE WHERE id = ?', [userId]);

            res.status(201).json({
                message: 'Biometría registrada correctamente',
                device_name: device_name || 'Huella / Face ID',
            });
        } catch (error) {
            console.error('Biometric register-verify error:', error);
            res.status(400).json({ error: error.message || 'No se pudo registrar la biometría' });
        }
    });

    // Iniciar sesión con biometría
    app.post('/api/auth/biometric/login-options', async (req, res) => {
        try {
            const { email } = req.body;
            if (!email) {
                return res.status(400).json({ error: 'Email requerido' });
            }

            const [users] = await pool.query('SELECT id, email, name FROM users WHERE email = ?', [email]);
            if (users.length === 0) {
                return res.status(404).json({ error: 'Usuario no encontrado' });
            }

            const user = users[0];
            const credentials = await getCredentialsByUserId(pool, user.id);
            if (credentials.length === 0) {
                return res.status(400).json({
                    error: 'Este usuario no tiene biometría activada. Inicia sesión con contraseña y actívala en el Dashboard.',
                });
            }

            const { rpID } = getRpConfig(req);
            const options = await generateAuthenticationOptions({
                rpID,
                allowCredentials: credentials.map((c) => ({
                    id: c.credential_id,
                    transports: JSON.parse(c.transports || '[]'),
                })),
                userVerification: 'required',
            });

            storeChallenge(`auth:${email}`, options.challenge);

            res.json({ options });
        } catch (error) {
            console.error('Biometric login-options error:', error);
            res.status(500).json({ error: error.message || 'Error al iniciar autenticación biométrica' });
        }
    });

    app.post('/api/auth/biometric/login-verify', async (req, res) => {
        try {
            const { email, ...authenticationResponse } = req.body;
            if (!email) {
                return res.status(400).json({ error: 'Email requerido' });
            }

            const expectedChallenge = consumeChallenge(`auth:${email}`);
            if (!expectedChallenge) {
                return res.status(400).json({ error: 'Desafío expirado. Intenta de nuevo.' });
            }

            const credentialId = authenticationResponse.id;
            const stored = await getCredentialByCredentialId(pool, credentialId);
            if (!stored) {
                return res.status(401).json({ error: 'Credencial biométrica no reconocida' });
            }

            const { rpID, origin } = getRpConfig(req);
            const verification = await verifyAuthenticationResponse({
                response: authenticationResponse,
                expectedChallenge,
                expectedOrigin: origin,
                expectedRPID: rpID,
                credential: {
                    id: stored.credential_id,
                    publicKey: Buffer.from(stored.public_key, 'base64'),
                    counter: Number(stored.counter),
                    transports: JSON.parse(stored.transports || '[]'),
                },
                requireUserVerification: true,
            });

            if (!verification.verified) {
                return res.status(401).json({ error: 'Autenticación biométrica fallida' });
            }

            const newCounter = verification.authenticationInfo.newCounter;
            await pool.query(
                'UPDATE webauthn_credentials SET counter = ?, last_used_at = NOW() WHERE id = ?',
                [newCounter, stored.id]
            );

            const user = {
                id: stored.uid,
                name: stored.name,
                email: stored.email,
                stellar_address: stored.stellar_address,
                loyalty_points: stored.loyalty_points,
            };
            const token = signToken(user);

            res.json({ user, token, method: 'biometric' });
        } catch (error) {
            console.error('Biometric login-verify error:', error);
            res.status(401).json({ error: error.message || 'Biometría no válida' });
        }
    });

    // Estado de biometría del usuario actual
    app.get('/api/auth/biometric/status', authenticateToken, async (req, res) => {
        try {
            const [creds] = await pool.query(
                'SELECT id, device_name, created_at, last_used_at FROM webauthn_credentials WHERE user_id = ?',
                [req.user.id]
            );
            res.json({
                enabled: creds.length > 0,
                devices: creds,
            });
        } catch (error) {
            console.error('Biometric status error:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    });

    app.delete('/api/auth/biometric/:credentialId', authenticateToken, async (req, res) => {
        try {
            await pool.query(
                'DELETE FROM webauthn_credentials WHERE id = ? AND user_id = ?',
                [req.params.credentialId, req.user.id]
            );
            const [remaining] = await pool.query(
                'SELECT COUNT(*) AS n FROM webauthn_credentials WHERE user_id = ?',
                [req.user.id]
            );
            if (remaining[0].n === 0) {
                await pool.query('UPDATE users SET biometric_enabled = FALSE WHERE id = ?', [req.user.id]);
            }
            res.json({ message: 'Dispositivo biométrico eliminado' });
        } catch (error) {
            console.error('Biometric delete error:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    });
}

module.exports = { registerWebAuthnRoutes };
