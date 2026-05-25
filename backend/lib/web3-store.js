/**
 * Almacenamiento Web3 — sin MySQL.
 * Datos de negocio en JSON local; paquetes/reservas/lealtad sincronizables con Soroban.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_DIR = path.join(__dirname, '..', 'data');
const DB_FILE = path.join(DATA_DIR, 'app.json');
const SEED_FILE = path.join(DATA_DIR, 'seed.json');

function now() {
    return new Date().toISOString();
}

function loadDb() {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    if (!fs.existsSync(DB_FILE)) {
        const seed = JSON.parse(fs.readFileSync(SEED_FILE, 'utf8'));
        fs.writeFileSync(DB_FILE, JSON.stringify(seed, null, 2));
    }
    return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
}

function saveDb(db) {
    fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
}

function norm(sql) {
    return sql.replace(/\s+/g, ' ').trim().toLowerCase();
}

function like(value, pattern) {
    const re = new RegExp('^' + pattern.replace(/%/g, '.*') + '$', 'i');
    return re.test(value);
}

function findUserByEmail(db, email) {
    const normalized = String(email).trim().toLowerCase();
    return db.users.find((u) => u.email.toLowerCase() === normalized);
}

async function query(sql, params = []) {
    const db = loadDb();
    const s = norm(sql);
    let rows = [];

    if (s === 'select 1') {
        return [[{ '1': 1 }]];
    }

    // --- USERS ---
    if (s.includes('from users where email =') && s.startsWith('select')) {
        const user = findUserByEmail(db, params[0]);
        if (!user) {
            rows = [];
        } else if (s.includes('select id from')) {
            rows = [{ id: user.id }];
        } else if (s.includes('select id, email, name from')) {
            rows = [{ id: user.id, email: user.email, name: user.name }];
        } else if (s.includes('select loyalty_points from')) {
            rows = [{ loyalty_points: user.loyalty_points }];
        } else if (s.includes('select id, name, email, stellar_address, loyalty_points from')) {
            rows = [{
                id: user.id, name: user.name, email: user.email,
                stellar_address: user.stellar_address, loyalty_points: user.loyalty_points,
            }];
        } else {
            rows = [user];
        }
    } else if (s.includes('select id, name, email, stellar_address, loyalty_points from users where id =')) {
        rows = db.users
            .filter((u) => u.id === params[0])
            .map(({ id, name, email, stellar_address, loyalty_points }) => ({
                id, name, email, stellar_address, loyalty_points,
            }));
    } else if (s.includes('select loyalty_points from users where id =')) {
        const u = db.users.find((x) => x.id === params[0]);
        rows = u ? [{ loyalty_points: u.loyalty_points }] : [];
    } else if (s.startsWith('insert into users')) {
        const [id, name, email, password_hash, stellar_address] = params;
        const emailNorm = String(email).trim().toLowerCase();
        db.users.push({
            id, name, email: emailNorm, password_hash, stellar_address,
            loyalty_points: 0, biometric_enabled: false,
            created_at: now(), updated_at: now(),
        });
        saveDb(db);
        rows = [];
    } else if (s.includes('update users set stellar_address =')) {
        const u = db.users.find((x) => x.id === params[1]);
        if (u) { u.stellar_address = params[0]; u.updated_at = now(); saveDb(db); }
    } else if (s.includes('update users set loyalty_points = loyalty_points + 10')) {
        const u = db.users.find((x) => x.id === params[0]);
        if (u) { u.loyalty_points = (u.loyalty_points || 0) + 10; u.updated_at = now(); saveDb(db); }
    } else if (s.includes('update users set biometric_enabled = true')) {
        const u = db.users.find((x) => x.id === params[0]);
        if (u) { u.biometric_enabled = true; saveDb(db); }
    } else if (s.includes('update users set biometric_enabled = false')) {
        const u = db.users.find((x) => x.id === params[0]);
        if (u) { u.biometric_enabled = false; saveDb(db); }
    }

    // --- PACKAGES ---
    else if (s.includes('select * from travel_packages where id =') && s.includes('and is_active = true')) {
        rows = db.travel_packages.filter((p) => p.id === params[0] && p.is_active);
    } else if (s.includes('select * from travel_packages where id =')) {
        rows = db.travel_packages.filter((p) => p.id === params[params.length - 1]);
    } else if (s.includes('select * from travel_packages where 1=1')) {
        rows = [...db.travel_packages];
        let pi = 0;
        if (s.includes('destination like')) {
            rows = rows.filter((p) => like(p.destination, params[pi++]));
        }
        if (s.includes('price >=')) {
            rows = rows.filter((p) => parseFloat(p.price) >= parseFloat(params[pi++]));
        }
        if (s.includes('price <=')) {
            rows = rows.filter((p) => parseFloat(p.price) <= parseFloat(params[pi++]));
        }
        if (s.includes('is_active =')) {
            const active = params[pi++] === 1 || params[pi - 1] === '1' || params[pi - 1] === true;
            rows = rows.filter((p) => p.is_active === active);
        }
        rows.sort((a, b) => String(a.start_date).localeCompare(String(b.start_date)));
    } else if (s.startsWith('insert into travel_packages')) {
        const [id, destination, description, start_date, end_date, capacity, available_slots, price, deposit_percent, image_url] = params;
        const pkg = {
            id, destination, description, start_date, end_date, capacity, available_slots,
            price, deposit_percent, image_url, contract_package_id: null,
            is_active: true, created_at: now(), updated_at: now(),
        };
        db.travel_packages.push(pkg);
        saveDb(db);
        rows = [];
    } else if (s.includes('update travel_packages set contract_package_id =')) {
        const p = db.travel_packages.find((x) => x.id === params[1]);
        if (p) { p.contract_package_id = params[0]; p.updated_at = now(); saveDb(db); }
    } else if (s.includes('available_slots = available_slots - 1')) {
        const p = db.travel_packages.find((x) => x.id === params[0]);
        if (p) { p.available_slots = Math.max(0, p.available_slots - 1); p.updated_at = now(); saveDb(db); }
    } else if (s.includes('available_slots = available_slots + 1')) {
        const p = db.travel_packages.find((x) => x.id === params[0]);
        if (p) { p.available_slots += 1; p.updated_at = now(); saveDb(db); }
    } else if (s.includes('update travel_packages set is_active = false')) {
        const p = db.travel_packages.find((x) => x.id === params[0]);
        if (p) { p.is_active = false; p.updated_at = now(); saveDb(db); }
    } else if (s.startsWith('update travel_packages set')) {
        const id = params[params.length - 1];
        const p = db.travel_packages.find((x) => x.id === id);
        if (p) {
            const fields = s.match(/update travel_packages set (.+) where/)[1].split(',').map((f) => f.trim().split(' ')[0]);
            fields.forEach((field, i) => { p[field] = params[i]; });
            p.updated_at = now();
            saveDb(db);
        }
    } else if (s.includes('select count(*) as packages from travel_packages where is_active = true')) {
        rows = [{ packages: db.travel_packages.filter((p) => p.is_active).length }];
    }

    // --- RESERVATIONS ---
    else if (s.startsWith('insert into reservations')) {
        const [id, user_id, package_id, total_price, deposit_amount] = params;
        db.reservations.push({
            id, user_id, package_id, total_price, deposit_amount,
            status: 'pending', contract_reservation_id: null,
            payment_transaction_hash: null, refund_transaction_hash: null,
            created_at: now(), updated_at: now(),
        });
        saveDb(db);
    } else if (s.includes('select * from reservations where id =') && !s.includes('user_id')) {
        rows = db.reservations.filter((r) => r.id === params[0]);
    } else if (s.includes('select * from reservations where id =') && s.includes('user_id')) {
        rows = db.reservations.filter((r) => r.id === params[0] && r.user_id === params[1]);
    } else if (s.includes('from reservations r') && s.includes('join travel_packages p') && s.includes('where r.id =')) {
        const r = db.reservations.find((x) => x.id === params[0] && x.user_id === params[1]);
        if (r) {
            const p = db.travel_packages.find((pkg) => pkg.id === r.package_id);
            rows = [{ ...r, destination: p?.destination, start_date: p?.start_date, end_date: p?.end_date, description: p?.description }];
        }
    } else if (s.includes('from reservations r') && s.includes('where r.user_id =')) {
        let list = db.reservations.filter((r) => r.user_id === params[0]);
        if (s.includes('and r.status =')) list = list.filter((r) => r.status === params[1]);
        rows = list.map((r) => {
            const p = db.travel_packages.find((pkg) => pkg.id === r.package_id);
            return { ...r, destination: p?.destination, start_date: p?.start_date, end_date: p?.end_date };
        }).sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    } else if (s.includes('from reservations r') && s.includes('join users u') && s.includes('admin')) {
        let list = [...db.reservations];
        let pi = 0;
        if (s.includes('and r.status =')) list = list.filter((r) => r.status === params[pi++]);
        rows = list.map((r) => {
            const u = db.users.find((x) => x.id === r.user_id);
            const p = db.travel_packages.find((pkg) => pkg.id === r.package_id);
            return {
                ...r, user_name: u?.name, user_email: u?.email,
                destination: p?.destination, start_date: p?.start_date, end_date: p?.end_date,
            };
        }).sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    } else if (s.includes("update reservations set status = 'completed'")) {
        const r = db.reservations.find((x) => x.id === params[0]);
        if (r) { r.status = 'completed'; r.updated_at = now(); saveDb(db); }
    } else if (s.includes("update reservations set status = 'confirmed'")) {
        const r = db.reservations.find((x) => x.id === params[0]);
        if (r) { r.status = 'confirmed'; r.updated_at = now(); saveDb(db); }
    } else if (s.includes("update reservations set status = 'refunded'") && s.includes('refund_transaction_hash')) {
        const r = db.reservations.find((x) => x.id === params[1]);
        if (r) { r.status = 'refunded'; r.refund_transaction_hash = params[0]; r.updated_at = now(); saveDb(db); }
    } else if (s.includes("update reservations set status = 'refunded'")) {
        const r = db.reservations.find((x) => x.id === params[0]);
        if (r) { r.status = 'refunded'; r.updated_at = now(); saveDb(db); }
    } else if (s.includes("update reservations set status = 'confirmed'") && s.includes('payment_transaction_hash')) {
        const r = db.reservations.find((x) => x.id === params[1]);
        if (r) { r.status = 'confirmed'; r.payment_transaction_hash = params[0]; r.updated_at = now(); saveDb(db); }
    } else if (s.includes('update reservations set contract_reservation_id =')) {
        const r = db.reservations.find((x) => x.id === params[1]);
        if (r) { r.contract_reservation_id = params[0]; saveDb(db); }
    } else if (s.includes("update reservations set status = 'confirmed'") === false && s.includes('update reservations set status')) {
        const r = db.reservations.find((x) => x.id === params[params.length - 1]);
        if (r) { r.status = params[0]; saveDb(db); }
    }

    // --- PAYMENT LOG ---
    else if (s.startsWith('insert into payment_log')) {
        if (params.length === 4) {
            db.payment_log.push({
                id: crypto.randomUUID(),
                reservation_id: params[0],
                transaction_type: params[1],
                amount: params[2],
                status: params[3],
                transaction_hash: null,
                created_at: now(),
            });
        } else {
            db.payment_log.push({
                id: crypto.randomUUID(),
                reservation_id: params[0],
                transaction_type: params[1],
                amount: params[2],
                status: 'completed',
                transaction_hash: null,
                created_at: now(),
            });
        }
        saveDb(db);
    } else if (s.includes("update payment_log set status = 'completed'") && s.includes('transaction_hash')) {
        db.payment_log.forEach((pl) => {
            if (pl.reservation_id === params[1] && pl.transaction_type === 'deposit' && pl.status === 'pending') {
                pl.status = 'completed';
                pl.transaction_hash = params[0];
            }
        });
        saveDb(db);
    } else if (s.includes("update payment_log set status = 'completed'")) {
        db.payment_log.forEach((pl) => {
            if (pl.reservation_id === params[0] && pl.transaction_type === 'deposit' && pl.status === 'pending') {
                pl.status = 'completed';
            }
        });
        saveDb(db);
    }

    // --- REVIEWS ---
    else if (s.startsWith('insert into reviews')) {
        const [id, user_id, package_id, reservation_id, rating, comment] = params;
        const review = { id, user_id, package_id, reservation_id, rating, comment, created_at: now() };
        db.reviews.push(review);
        saveDb(db);
        rows = [review];
    } else if (s.includes('select * from reviews where id =')) {
        rows = db.reviews.filter((r) => r.id === params[0]);
    } else if (s.includes('from reviews r') && s.includes('join users u')) {
        rows = db.reviews
            .filter((r) => r.package_id === params[0])
            .map((r) => {
                const u = db.users.find((x) => x.id === r.user_id);
                return { rating: r.rating, comment: r.comment, created_at: r.created_at, user_name: u?.name };
            })
            .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    }

    // --- FAVORITES ---
    else if (s.startsWith('insert into favorites')) {
        const [id, user_id, package_id] = params;
        const fav = { id, user_id, package_id, created_at: now() };
        if (!db.favorites.some((f) => f.user_id === user_id && f.package_id === package_id)) {
            db.favorites.push(fav);
            saveDb(db);
        }
        rows = [fav];
    } else if (s.includes('select * from favorites where id =')) {
        rows = db.favorites.filter((f) => f.id === params[0]);
    } else if (s.includes('from favorites f') && s.includes('join travel_packages p')) {
        rows = db.favorites
            .filter((f) => f.user_id === params[0])
            .map((f) => {
                const p = db.travel_packages.find((pkg) => pkg.id === f.package_id);
                return { ...p, favorited_at: f.created_at, favorite_id: f.id };
            })
            .sort((a, b) => new Date(b.favorited_at) - new Date(a.favorited_at));
    } else if (s.includes('delete from favorites where user_id =')) {
        db.favorites = db.favorites.filter(
            (f) => !(f.user_id === params[0] && f.package_id === params[1])
        );
        saveDb(db);
    }

    // --- WEBAUTHN ---
    else if (s.includes('from webauthn_credentials where user_id =') && s.includes('count(*)')) {
        rows = [{ n: db.webauthn_credentials.filter((c) => c.user_id === params[0]).length }];
    } else if (s.includes('select id, credential_id, public_key, counter, transports from webauthn_credentials')) {
        rows = db.webauthn_credentials
            .filter((c) => c.user_id === params[0])
            .map(({ id, credential_id, public_key, counter, transports }) => ({
                id, credential_id, public_key, counter, transports,
            }));
    } else if (s.includes('select id, device_name, created_at, last_used_at from webauthn_credentials')) {
        rows = db.webauthn_credentials
            .filter((c) => c.user_id === params[0])
            .map(({ id, device_name, created_at, last_used_at }) => ({ id, device_name, created_at, last_used_at }));
    } else if (s.startsWith('insert into webauthn_credentials')) {
        const [id, user_id, credential_id, public_key, counter, device_name, transports] = params;
        db.webauthn_credentials.push({
            id, user_id, credential_id, public_key, counter,
            device_name, transports, created_at: now(), last_used_at: null,
        });
        saveDb(db);
    } else if (s.includes('from webauthn_credentials c') && s.includes('join users u')) {
        const c = db.webauthn_credentials.find((x) => x.credential_id === params[0]);
        if (c) {
            const u = db.users.find((x) => x.id === c.user_id);
            rows = [{
                ...c, uid: u.id, name: u.name, email: u.email,
                stellar_address: u.stellar_address, loyalty_points: u.loyalty_points,
            }];
        }
    } else if (s.includes('update webauthn_credentials set counter =')) {
        const c = db.webauthn_credentials.find((x) => x.id === params[1]);
        if (c) { c.counter = params[0]; c.last_used_at = now(); saveDb(db); }
    } else if (s.includes('delete from webauthn_credentials where id =')) {
        db.webauthn_credentials = db.webauthn_credentials.filter(
            (c) => !(c.id === params[0] && c.user_id === params[1])
        );
        saveDb(db);
    }

    // --- ADMIN AGGREGATES ---
    else if (s.includes('from users u') && s.includes('left join reservations')) {
        rows = db.users.map((u) => {
            const userRes = db.reservations.filter((r) => r.user_id === u.id);
            return {
                id: u.id, name: u.name, email: u.email, stellar_address: u.stellar_address,
                loyalty_points: u.loyalty_points, created_at: u.created_at,
                total_reservations: userRes.length,
                completed_reservations: userRes.filter((r) => r.status === 'completed').length,
            };
        }).sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    } else if (s.includes('from travel_packages p') && s.includes('left join reservations')) {
        rows = db.travel_packages.map((p) => {
            const pkgRes = db.reservations.filter((r) => r.package_id === p.id);
            return {
                ...p,
                total_reservations: pkgRes.length,
                active_reservations: pkgRes.filter((r) => ['confirmed', 'completed'].includes(r.status)).length,
            };
        }).sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    }

    return [rows];
}

module.exports = {
    query,
    mode: 'web3',
    storageLabel: 'JSON local + Soroban (Web3)',
};
