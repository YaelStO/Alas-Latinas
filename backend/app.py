import os
import json
import subprocess
import pymysql
import bcrypt
import jwt
from functools import wraps
from datetime import datetime, timedelta
from flask import Flask, request, jsonify
from flask_cors import CORS
from contextlib import contextmanager
from dotenv import load_dotenv
load_dotenv()
app = Flask(__name__)
CORS(app)
PORT = int(os.environ.get('PORT', 3000))
JWT_SECRET = os.environ.get('JWT_SECRET', 'your-secret-key-change-in-production')
JWT_EXPIRATION_DAYS = 7
CONTRACT_ID = os.environ.get('CONTRACT_ID', 'CCK5C6NBWBPMATNCGL5O6DI6QRELKK5K3KUXZOOSJXJM4OL6KZQTINS4')
NETWORK = os.environ.get('STELLAR_NETWORK', 'testnet')
DB_CONFIG = {
    'host': os.environ.get('DB_HOST', 'localhost'),
    'user': os.environ.get('DB_USER', 'root'),
    'password': os.environ.get('DB_PASSWORD', ''),
    'database': os.environ.get('DB_NAME', 'turismo_blockchain'),
    'cursorclass': pymysql.cursors.DictCursor,
    'autocommit': False,
}
@contextmanager
def get_db_connection():
    conn = pymysql.connect(**DB_CONFIG)
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()
def invoke_contract(function_name, args_list):
    try:
        cmd = ['stellar', 'contract', 'invoke',
               '--id', CONTRACT_ID,
               '--network', NETWORK,
               '--fn', function_name]
        for arg in args_list:
            cmd.append(arg)
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
        if result.returncode == 0:
            return result.stdout.strip()
        else:
            raise Exception(result.stderr.strip())
    except subprocess.TimeoutExpired:
        raise Exception('Contract invocation timed out')
    except FileNotFoundError:
        raise Exception('Stellar CLI not found. Ensure it is installed and in PATH.')
def authenticate_token(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        auth_header = request.headers.get('Authorization')
        if not auth_header or not auth_header.startswith('Bearer '):
            return jsonify({'error': 'Authentication required'}), 401
        token = auth_header.split(' ')[1]
        try:
            decoded = jwt.decode(token, JWT_SECRET, algorithms=['HS256'])
            request.user = decoded
            return f(*args, **kwargs)
        except jwt.ExpiredSignatureError:
            return jsonify({'error': 'Token has expired'}), 403
        except jwt.InvalidTokenError:
            return jsonify({'error': 'Invalid token'}), 403
    return decorated
@app.route('/api/auth/register', methods=['POST'])
def register():
    data = request.get_json()
    if not data:
        return jsonify({'error': 'Request body is required'}), 400
    name = data.get('name')
    email = data.get('email')
    password = data.get('password')
    stellar_address = data.get('stellar_address')
    if not name or not email or not password:
        return jsonify({'error': 'Name, email, and password are required'}), 400
    try:
        with get_db_connection() as conn:
            with conn.cursor() as cursor:
                cursor.execute('SELECT id FROM users WHERE email = %s', [email])
                if cursor.fetchone():
                    return jsonify({'error': 'Email already registered'}), 409
                password_hash = bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')
                cursor.execute(
                    'INSERT INTO users (name, email, password_hash, stellar_address) VALUES (%s, %s, %s, %s)',
                    [name, email, password_hash, stellar_address]
                )
                # FIX: Buscar por email en vez de lastrowid (las tablas usan UUID como PK)
                cursor.execute(
                    'SELECT id, name, email, stellar_address, loyalty_points FROM users WHERE email = %s',
                    [email]
                )
                user = cursor.fetchone()
                if not user:
                    return jsonify({'error': 'Failed to retrieve created user'}), 500
                token = jwt.encode(
                    {
                        'id': str(user['id']),
                        'email': user['email'],
                        'exp': datetime.utcnow() + timedelta(days=JWT_EXPIRATION_DAYS)
                    },
                    JWT_SECRET,
                    algorithm='HS256'
                )
                user['loyalty_points'] = int(user['loyalty_points']) if user['loyalty_points'] else 0
                return jsonify({'user': user, 'token': token}), 201
    except pymysql.MySQLError as e:
        print(f'Register error: {e}')
        return jsonify({'error': 'Internal server error'}), 500
@app.route('/api/auth/login', methods=['POST'])
def login():
    data = request.get_json()
    if not data:
        return jsonify({'error': 'Request body is required'}), 400
    email = data.get('email')
    password = data.get('password')
    if not email or not password:
        return jsonify({'error': 'Email and password are required'}), 400
    try:
        with get_db_connection() as conn:
            with conn.cursor() as cursor:
                cursor.execute('SELECT * FROM users WHERE email = %s', [email])
                user = cursor.fetchone()
                if not user:
                    return jsonify({'error': 'Invalid credentials'}), 401
                if not bcrypt.checkpw(password.encode('utf-8'), user['password_hash'].encode('utf-8')):
                    return jsonify({'error': 'Invalid credentials'}), 401
                token = jwt.encode(
                    {
                        'id': str(user['id']),
                        'email': user['email'],
                        'exp': datetime.utcnow() + timedelta(days=JWT_EXPIRATION_DAYS)
                    },
                    JWT_SECRET,
                    algorithm='HS256'
                )
                return jsonify({
                    'user': {
                        'id': str(user['id']),
                        'name': user['name'],
                        'email': user['email'],
                        'stellar_address': user['stellar_address'],
                        'loyalty_points': int(user['loyalty_points']) if user['loyalty_points'] else 0,
                    },
                    'token': token,
                }), 200
    except pymysql.MySQLError as e:
        print(f'Login error: {e}')
        return jsonify({'error': 'Internal server error'}), 500
@app.route('/api/packages', methods=['GET'])
def get_packages():
    try:
        destination = request.args.get('destination')
        min_price = request.args.get('min_price')
        max_price = request.args.get('max_price')
        active = request.args.get('active')
        query = 'SELECT * FROM travel_packages WHERE 1=1'
        params = []
        if destination:
            params.append(f'%{destination}%')
            query += ' AND destination LIKE %s'
        if min_price:
            params.append(min_price)
            query += ' AND price >= %s'
        if max_price:
            params.append(max_price)
            query += ' AND price <= %s'
        if active is not None:
            params.append(1 if active.lower() == 'true' else 0)
            query += ' AND is_active = %s'
        query += ' ORDER BY start_date ASC'
        with get_db_connection() as conn:
            with conn.cursor() as cursor:
                cursor.execute(query, params)
                rows = cursor.fetchall()
                for row in rows:
                    row['price'] = float(row['price'])
                return jsonify({'packages': rows}), 200
    except pymysql.MySQLError as e:
        print(f'Get packages error: {e}')
        return jsonify({'error': 'Internal server error'}), 500
@app.route('/api/packages/<package_id>', methods=['GET'])
def get_package(package_id):
    try:
        with get_db_connection() as conn:
            with conn.cursor() as cursor:
                cursor.execute('SELECT * FROM travel_packages WHERE id = %s', [package_id])
                pkg = cursor.fetchone()
                if not pkg:
                    return jsonify({'error': 'Package not found'}), 404
                pkg['price'] = float(pkg['price'])
                return jsonify({'package': pkg}), 200
    except pymysql.MySQLError as e:
        print(f'Get package error: {e}')
        return jsonify({'error': 'Internal server error'}), 500
@app.route('/api/packages', methods=['POST'])
@authenticate_token
def create_package():
    data = request.get_json()
    if not data:
        return jsonify({'error': 'Request body is required'}), 400
    destination = data.get('destination')
    description = data.get('description')
    start_date = data.get('start_date')
    end_date = data.get('end_date')
    capacity = data.get('capacity')
    price = data.get('price')
    deposit_percent = data.get('deposit_percent', 20)
    image_url = data.get('image_url')
    if not destination or not start_date or not end_date or capacity is None or price is None:
        return jsonify({'error': 'Missing required fields'}), 400
    try:
        with get_db_connection() as conn:
            with conn.cursor() as cursor:
                cursor.execute(
                    '''INSERT INTO travel_packages
                       (destination, description, start_date, end_date, capacity, available_slots, price, deposit_percent, image_url)
                       VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)''',
                    [destination, description, start_date, end_date, int(capacity), int(capacity),
                     float(price), int(deposit_percent), image_url]
                )
                pkg_id = cursor.lastrowid
                # FIX: Buscar por el ID numérico (que sí funciona para el lookup intermedio)
                cursor.execute('SELECT * FROM travel_packages WHERE id = (SELECT id FROM travel_packages ORDER BY created_at DESC LIMIT 1)')
                pkg = cursor.fetchone()
                pkg['price'] = float(pkg['price'])
                try:
                    price_i128 = int(float(price) * 100)
                    contract_pkg_id = invoke_contract('create_package', [
                        '--arg-string', str(destination),
                        '--arg-i128', str(price_i128),
                        '--arg-u32', str(capacity),
                        '--arg-u32', str(deposit_percent),
                    ])
                    cursor.execute(
                        'UPDATE travel_packages SET contract_package_id = %s WHERE id = %s',
                        [contract_pkg_id, pkg['id']]
                    )
                    conn.commit()
                    pkg['contract_package_id'] = contract_pkg_id
                except Exception as ce:
                    print(f'Contract package creation warning: {ce}')
                    conn.commit()
                return jsonify({'package': pkg}), 201
    except pymysql.MySQLError as e:
        print(f'Create package error: {e}')
        return jsonify({'error': 'Internal server error'}), 500
@app.route('/api/reservations', methods=['POST'])
@authenticate_token
def create_reservation():
    data = request.get_json()
    if not data:
        return jsonify({'error': 'Request body is required'}), 400
    package_id = data.get('package_id')
    if not package_id:
        return jsonify({'error': 'Package ID is required'}), 400
    try:
        with get_db_connection() as conn:
            with conn.cursor() as cursor:
                cursor.execute(
                    'SELECT * FROM travel_packages WHERE id = %s AND is_active = TRUE',
                    [package_id]
                )
                pkg = cursor.fetchone()
                if not pkg:
                    return jsonify({'error': 'Package not found or inactive'}), 404
                if int(pkg['available_slots']) <= 0:
                    return jsonify({'error': 'No available slots'}), 400
                total_price = float(pkg['price'])
                deposit_amount = total_price * float(pkg['deposit_percent']) / 100
                cursor.execute(
                    '''INSERT INTO reservations (user_id, package_id, total_price, deposit_amount, status)
                       VALUES (%s, %s, %s, %s, 'pending')''',
                    [request.user['id'], package_id, total_price, deposit_amount]
                )
                cursor.execute('UPDATE travel_packages SET available_slots = available_slots - 1 WHERE id = %s', [package_id])
                # FIX: Buscar la reserva recién creada por user_id + orden descendente
                cursor.execute(
                    'SELECT * FROM reservations WHERE user_id = %s ORDER BY created_at DESC LIMIT 1',
                    [request.user['id']]
                )
                reservation = cursor.fetchone()
                reservation['total_price'] = float(reservation['total_price'])
                reservation['deposit_amount'] = float(reservation['deposit_amount'])
                try:
                    user_address = data.get('stellar_address') or request.user.get('stellar_address', 'GAA...')
                    contract_pkg_id = pkg.get('contract_package_id') or 1
                    contract_res_id = invoke_contract('create_reservation', [
                        '--arg-addr', str(user_address),
                        '--arg-u64', str(contract_pkg_id),
                    ])
                    cursor.execute(
                        'UPDATE reservations SET contract_reservation_id = %s WHERE id = %s',
                        [contract_res_id, reservation['id']]
                    )
                    conn.commit()
                    reservation['contract_reservation_id'] = contract_res_id
                except Exception as ce:
                    print(f'Contract reservation creation warning: {ce}')
                    conn.commit()
                cursor.execute(
                    'INSERT INTO payment_log (reservation_id, transaction_type, amount, status) VALUES (%s, %s, %s, %s)',
                    [reservation['id'], 'deposit', deposit_amount, 'pending']
                )
                conn.commit()
                return jsonify({'reservation': reservation}), 201
    except pymysql.MySQLError as e:
        print(f'Create reservation error: {e}')
        return jsonify({'error': 'Internal server error'}), 500
@app.route('/api/reservations', methods=['GET'])
@authenticate_token
def get_reservations():
    try:
        status_filter = request.args.get('status')
        query = '''SELECT r.*, p.destination, p.start_date, p.end_date
                   FROM reservations r
                   JOIN travel_packages p ON r.package_id = p.id
                   WHERE r.user_id = %s'''
        params = [request.user['id']]
        if status_filter:
            params.append(status_filter)
            query += ' AND r.status = %s'
        query += ' ORDER BY r.created_at DESC'
        with get_db_connection() as conn:
            with conn.cursor() as cursor:
                cursor.execute(query, params)
                rows = cursor.fetchall()
                for row in rows:
                    row['total_price'] = float(row['total_price'])
                    row['deposit_amount'] = float(row['deposit_amount'])
                return jsonify({'reservations': rows}), 200
    except pymysql.MySQLError as e:
        print(f'Get reservations error: {e}')
        return jsonify({'error': 'Internal server error'}), 500
@app.route('/api/reservations/<reservation_id>', methods=['GET'])
@authenticate_token
def get_reservation(reservation_id):
    try:
        with get_db_connection() as conn:
            with conn.cursor() as cursor:
                cursor.execute(
                    '''SELECT r.*, p.destination, p.start_date, p.end_date, p.description
                       FROM reservations r
                       JOIN travel_packages p ON r.package_id = p.id
                       WHERE r.id = %s AND r.user_id = %s''',
                    [reservation_id, request.user['id']]
                )
                reservation = cursor.fetchone()
                if not reservation:
                    return jsonify({'error': 'Reservation not found'}), 404
                reservation['total_price'] = float(reservation['total_price'])
                reservation['deposit_amount'] = float(reservation['deposit_amount'])
                return jsonify({'reservation': reservation}), 200
    except pymysql.MySQLError as e:
        print(f'Get reservation error: {e}')
        return jsonify({'error': 'Internal server error'}), 500
@app.route('/api/payments/confirm', methods=['POST'])
@authenticate_token
def confirm_payment():
    data = request.get_json()
    if not data:
        return jsonify({'error': 'Request body is required'}), 400
    reservation_id = data.get('reservation_id')
    if not reservation_id:
        return jsonify({'error': 'Reservation ID is required'}), 400
    transaction_hash = data.get('transaction_hash')
    try:
        with get_db_connection() as conn:
            with conn.cursor() as cursor:
                cursor.execute(
                    'SELECT * FROM reservations WHERE id = %s AND user_id = %s',
                    [reservation_id, request.user['id']]
                )
                reservation = cursor.fetchone()
                if not reservation:
                    return jsonify({'error': 'Reservation not found'}), 404
                if reservation['status'] != 'pending':
                    return jsonify({'error': 'Reservation is not pending payment'}), 400
                cursor.execute(
                    'UPDATE reservations SET status = %s, payment_transaction_hash = %s WHERE id = %s',
                    ['confirmed', transaction_hash, reservation_id]
                )
                cursor.execute(
                    '''UPDATE payment_log SET status = %s, transaction_hash = %s
                       WHERE reservation_id = %s AND transaction_type = %s AND status = %s''',
                    ['completed', transaction_hash, reservation_id, 'deposit', 'pending']
                )
                conn.commit()
                try:
                    contract_res_id = reservation.get('contract_reservation_id') or 1
                    invoke_contract('confirm_payment', [
                        '--arg-u64', str(contract_res_id),
                    ])
                except Exception as ce:
                    print(f'Contract payment confirmation warning: {ce}')
                return jsonify({'message': 'Payment confirmed', 'reservation_id': str(reservation_id)}), 200
    except pymysql.MySQLError as e:
        print(f'Confirm payment error: {e}')
        return jsonify({'error': 'Internal server error'}), 500
@app.route('/api/refunds', methods=['POST'])
@authenticate_token
def process_refund():
    data = request.get_json()
    if not data:
        return jsonify({'error': 'Request body is required'}), 400
    reservation_id = data.get('reservation_id')
    if not reservation_id:
        return jsonify({'error': 'Reservation ID is required'}), 400
    try:
        with get_db_connection() as conn:
            with conn.cursor() as cursor:
                cursor.execute(
                    'SELECT * FROM reservations WHERE id = %s AND user_id = %s',
                    [reservation_id, request.user['id']]
                )
                reservation = cursor.fetchone()
                if not reservation:
                    return jsonify({'error': 'Reservation not found'}), 404
                if reservation['status'] == 'completed':
                    return jsonify({'error': 'Cannot refund completed reservation'}), 400
                if reservation['status'] == 'refunded':
                    return jsonify({'error': 'Reservation already refunded'}), 400
                cursor.execute(
                    'UPDATE reservations SET status = %s WHERE id = %s',
                    ['refunded', reservation_id]
                )
                cursor.execute(
                    'UPDATE travel_packages SET available_slots = available_slots + 1 WHERE id = %s',
                    [reservation['package_id']]
                )
                cursor.execute(
                    'INSERT INTO payment_log (reservation_id, transaction_type, amount, status) VALUES (%s, %s, %s, %s)',
                    [reservation_id, 'refund', float(reservation['deposit_amount']), 'completed']
                )
                conn.commit()
                try:
                    contract_res_id = reservation.get('contract_reservation_id') or 1
                    invoke_contract('process_refund', [
                        '--arg-u64', str(contract_res_id),
                    ])
                except Exception as ce:
                    print(f'Contract refund warning: {ce}')
                return jsonify({'message': 'Refund processed', 'reservation_id': str(reservation_id)}), 200
    except pymysql.MySQLError as e:
        print(f'Refund error: {e}')
        return jsonify({'error': 'Internal server error'}), 500
@app.route('/api/reviews', methods=['POST'])
@authenticate_token
def create_review():
    data = request.get_json()
    if not data:
        return jsonify({'error': 'Request body is required'}), 400
    package_id = data.get('package_id')
    rating = data.get('rating')
    comment = data.get('comment')
    reservation_id = data.get('reservation_id')
    if not package_id or rating is None:
        return jsonify({'error': 'Package ID and rating are required'}), 400
    if rating < 1 or rating > 5:
        return jsonify({'error': 'Rating must be between 1 and 5'}), 400
    if reservation_id:
        try:
            with get_db_connection() as conn:
                with conn.cursor() as cursor:
                    cursor.execute(
                        'SELECT * FROM reservations WHERE id = %s AND user_id = %s',
                        [reservation_id, request.user['id']]
                    )
                    res_row = cursor.fetchone()
                    if not res_row or res_row['status'] != 'completed':
                        return jsonify({'error': 'Can only review completed reservations'}), 400
        except pymysql.MySQLError as e:
            print(f'Review reservation check error: {e}')
            return jsonify({'error': 'Internal server error'}), 500
    try:
        with get_db_connection() as conn:
            with conn.cursor() as cursor:
                cursor.execute(
                    'INSERT INTO reviews (user_id, package_id, reservation_id, rating, comment) VALUES (%s, %s, %s, %s, %s)',
                    [request.user['id'], package_id, reservation_id, int(rating), comment]
                )
                review_id = cursor.lastrowid
                cursor.execute('SELECT * FROM reviews WHERE id = %s', [review_id])
                review = cursor.fetchone()
                return jsonify({'review': review}), 201
    except pymysql.MySQLError as e:
        print(f'Create review error: {e}')
        return jsonify({'error': 'Internal server error'}), 500
@app.route('/api/reviews/package/<package_id>', methods=['GET'])
def get_package_reviews(package_id):
    try:
        with get_db_connection() as conn:
            with conn.cursor() as cursor:
                cursor.execute(
                    '''SELECT r.rating, r.comment, r.created_at, u.name as user_name
                       FROM reviews r
                       JOIN users u ON r.user_id = u.id
                       WHERE r.package_id = %s
                       ORDER BY r.created_at DESC''',
                    [package_id]
                )
                reviews = cursor.fetchall()
                if reviews:
                    avg_rating = sum(r['rating'] for r in reviews) / len(reviews)
                else:
                    avg_rating = 0
                return jsonify({
                    'reviews': reviews,
                    'average_rating': round(float(avg_rating), 2),
                    'total': len(reviews),
                }), 200
    except pymysql.MySQLError as e:
        print(f'Get reviews error: {e}')
        return jsonify({'error': 'Internal server error'}), 500
@app.route('/api/favorites', methods=['POST'])
@authenticate_token
def add_favorite():
    data = request.get_json()
    if not data:
        return jsonify({'error': 'Request body is required'}), 400
    package_id = data.get('package_id')
    if not package_id:
        return jsonify({'error': 'Package ID is required'}), 400
    try:
        with get_db_connection() as conn:
            with conn.cursor() as cursor:
                try:
                    cursor.execute(
                        'INSERT INTO favorites (user_id, package_id) VALUES (%s, %s)',
                        [request.user['id'], package_id]
                    )
                    conn.commit()
                    cursor.execute(
                        'SELECT * FROM favorites WHERE user_id = %s AND package_id = %s ORDER BY created_at DESC LIMIT 1',
                        [request.user['id'], package_id]
                    )
                    favorite = cursor.fetchone()
                    return jsonify({'favorite': favorite}), 201
                except pymysql.err.IntegrityError:
                    return jsonify({'message': 'Already in favorites'}), 200
    except pymysql.MySQLError as e:
        print(f'Add favorite error: {e}')
        return jsonify({'error': 'Internal server error'}), 500
@app.route('/api/favorites/<package_id>', methods=['DELETE'])
@authenticate_token
def remove_favorite(package_id):
    try:
        with get_db_connection() as conn:
            with conn.cursor() as cursor:
                cursor.execute(
                    'DELETE FROM favorites WHERE user_id = %s AND package_id = %s',
                    [request.user['id'], package_id]
                )
                conn.commit()
                return jsonify({'message': 'Favorite removed'}), 200
    except pymysql.MySQLError as e:
        print(f'Remove favorite error: {e}')
        return jsonify({'error': 'Internal server error'}), 500
@app.route('/api/favorites', methods=['GET'])
@authenticate_token
def get_favorites():
    try:
        with get_db_connection() as conn:
            with conn.cursor() as cursor:
                cursor.execute(
                    '''SELECT p.*, f.created_at as favorited_at
                       FROM favorites f
                       JOIN travel_packages p ON f.package_id = p.id
                       WHERE f.user_id = %s
                       ORDER BY f.created_at DESC''',
                    [request.user['id']]
                )
                favorites = cursor.fetchall()
                for fav in favorites:
                    fav['price'] = float(fav['price'])
                return jsonify({'favorites': favorites}), 200
    except pymysql.MySQLError as e:
        print(f'Get favorites error: {e}')
        return jsonify({'error': 'Internal server error'}), 500
@app.route('/api/loyalty', methods=['GET'])
@authenticate_token
def get_loyalty():
    try:
        with get_db_connection() as conn:
            with conn.cursor() as cursor:
                cursor.execute('SELECT loyalty_points FROM users WHERE id = %s', [request.user['id']])
                row = cursor.fetchone()
                points = int(row['loyalty_points']) if row and row['loyalty_points'] else 0
                return jsonify({'loyalty_points': points}), 200
    except pymysql.MySQLError as e:
        print(f'Get loyalty error: {e}')
        return jsonify({'error': 'Internal server error'}), 500
@app.route('/api/admin/confirm-service', methods=['POST'])
@authenticate_token
def confirm_service():
    data = request.get_json()
    if not data:
        return jsonify({'error': 'Request body is required'}), 400
    reservation_id = data.get('reservation_id')
    if not reservation_id:
        return jsonify({'error': 'Reservation ID is required'}), 400
    try:
        with get_db_connection() as conn:
            with conn.cursor() as cursor:
                cursor.execute('SELECT * FROM reservations WHERE id = %s', [reservation_id])
                reservation = cursor.fetchone()
                if not reservation:
                    return jsonify({'error': 'Reservation not found'}), 404
                if reservation['status'] != 'confirmed':
                    return jsonify({'error': 'Reservation must be confirmed first'}), 400
                cursor.execute("UPDATE reservations SET status = 'completed' WHERE id = %s", [reservation_id])
                cursor.execute('UPDATE users SET loyalty_points = loyalty_points + 10 WHERE id = %s', [reservation['user_id']])
                conn.commit()
                try:
                    contract_res_id = reservation.get('contract_reservation_id') or 1
                    invoke_contract('confirm_service', [
                        '--arg-u64', str(contract_res_id),
                    ])
                except Exception as ce:
                    print(f'Contract service confirmation warning: {ce}')
                return jsonify({'message': 'Service confirmed as completed', 'reservation_id': str(reservation_id)}), 200
    except pymysql.MySQLError as e:
        print(f'Confirm service error: {e}')
        return jsonify({'error': 'Internal server error'}), 500
if __name__ == '__main__':
    print(f'Tourism Blockchain API running on http://localhost:{PORT}')
    print('Available endpoints:')
    print('  POST   /api/auth/register')
    print('  POST   /api/auth/login')
    print('  GET    /api/packages')
    print('  GET    /api/packages/<id>')
    print('  POST   /api/packages')
    print('  POST   /api/reservations')
    print('  GET    /api/reservations')
    print('  GET    /api/reservations/<id>')
    print('  POST   /api/payments/confirm')
    print('  POST   /api/refunds')
    print('  POST   /api/reviews')
    print('  GET    /api/reviews/package/<package_id>')
    print('  POST   /api/favorites')
    print('  GET    /api/favorites')
    print('  DELETE /api/favorites/<package_id>')
    print('  GET    /api/loyalty')
    print('  POST   /api/admin/confirm-service')
    print('Presiona Ctrl+C para detener')
    app.run(host='0.0.0.0', port=PORT, debug=False)
    