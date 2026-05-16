# Turismo Blockchain - Plataforma de Reservas con Stellar/Soroban

## Descripción General

Plataforma descentralizada de reservas turísticas que utiliza un contrato inteligente en la red **Stellar (Soroban)** para gestionar paquetes de viaje, reservaciones, pagos en escrow, reembolsos y un sistema de puntos de lealtad. El backend en **Node.js/Express** interactúa con el contrato (vía `stellar contract invoke`) y una base de datos **MySQL** para ofrecer una API REST completa.

**Tecnologías:**
- **Rust + Soroban SDK v26** - Contrato inteligente
- **Node.js + Express** - API Backend
- **MySQL** - Base de datos relacional
- **JWT + bcrypt** - Autenticación
- **Stellar CLI** - Invocación del contrato desde el backend

---

## Contrato Inteligente

**ID del Contrato (Testnet):** `CCK5C6NBWBPMATNCGL5O6DI6QRELKK5K3KUXZOOSJXJM4OL6KZQTINS4`

**WASM Hash:** `d6bbbe5db789d4d0dce53a03bf6e5379c653e39c2ce22036d996dffdb929574e`

### Ver en Stellar Explorer
- **Stellar Expert:** https://stellar.expert/explorer/testnet/contract/CCK5C6NBWBPMATNCGL5O6DI6QRELKK5K3KUXZOOSJXJM4OL6KZQTINS4
- **Stellar Lab:** https://lab.stellar.org/r/testnet/contract/CCK5C6NBWBPMATNCGL5O6DI6QRELKK5K3KUXZOOSJXJM4OL6KZQTINS4

### Funciones del Contrato

| Función | Parámetros | Retorno | Descripción |
|---------|------------|---------|-------------|
| `init` | `admin: Address` | - | Inicializa el contrato con administrador |
| `create_package` | `destination: String, price: i128, capacity: u32, deposit_percent: u32` | `u64` | Crea paquete de viaje (solo admin) |
| `get_package` | `package_id: u64` | `Option<TravelPackage>` | Consulta paquete por ID |
| `create_reservation` | `traveler: Address, package_id: u64` | `u64` | Crea reservación (viajero) |
| `get_reservation` | `reservation_id: u64` | `Option<Reservation>` | Consulta reservación |
| `confirm_payment` | `reservation_id: u64` | - | Confirma pago (solo admin) |
| `confirm_service` | `reservation_id: u64` | - | Marca servicio completado + otorga 10 pts lealtad (admin) |
| `process_refund` | `reservation_id: u64` | - | Procesa reembolso (solo admin) |
| `cancel_reservation` | `reservation_id: u64` | - | Cancela reservación (viajero, solo si está Pending) |
| `get_loyalty_balance` | `user: Address` | `i128` | Consulta puntos de lealtad |
| `get_reservations_by_user` | `user: Address` | `Vec<Reservation>` | Lista reservaciones de usuario |

### Tipos de Datos

**ReservationStatus:** `Pending`, `Confirmed`, `Completed`, `Refunded`, `Cancelled`

**TravelPackage:** `package_id`, `destination`, `price`, `capacity`, `available`, `deposit_percent`

**Reservation:** `reservation_id`, `traveler`, `package_id`, `price`, `deposit`, `status`, `created_at`

---

## API Backend (Node.js/Express)

**Puerto:** 3000 (configurable via `PORT`)

### Endpoints

#### Autenticación
| Método | Endpoint | Body | Auth | Descripción |
|--------|----------|------|------|-------------|
| POST | `/api/auth/register` | `{name, email, password, stellar_address?}` | No | Registrar usuario |
| POST | `/api/auth/login` | `{email, password}` | No | Login, retorna JWT (7 días) |

#### Paquetes
| Método | Endpoint | Query Params | Auth | Descripción |
|--------|----------|--------------|------|-------------|
| GET | `/api/packages` | `destination, min_price, max_price, active` | No | Listar paquetes |
| GET | `/api/packages/:id` | - | No | Detalle paquete |
| POST | `/api/packages` | `{destination, description, start_date, end_date, capacity, price, deposit_percent?, image_url?}` | Sí | Crear paquete (invoca contrato) |

#### Reservaciones
| Método | Endpoint | Query/Body | Auth | Descripción |
|--------|----------|------------|------|-------------|
| POST | `/api/reservations` | `{package_id}` | Sí | Crear reservación (invoca contrato, resta 1 slot) |
| GET | `/api/reservations` | `status?` | Sí | Mis reservaciones |
| GET | `/api/reservations/:id` | - | Sí | Detalle reservación |

#### Pagos
| Método | Endpoint | Body | Auth | Descripción |
|--------|----------|------|------|-------------|
| POST | `/api/payments/confirm` | `{reservation_id, transaction_hash?}` | Sí | Confirmar pago (cambia status a 'confirmed') |

#### Reembolsos
| Método | Endpoint | Body | Auth | Descripción |
|--------|----------|------|------|-------------|
| POST | `/api/refunds` | `{reservation_id, reason?}` | Sí | Procesar reembolso (solo si no está 'completed' ni 'refunded') |

#### Reseñas
| Método | Endpoint | Body/Params | Auth | Descripción |
|--------|----------|-------------|------|-------------|
| POST | `/api/reviews` | `{package_id, rating, comment?, reservation_id?}` | Sí | Crear reseña (rating 1-5) |
| GET | `/api/reviews/package/:package_id` | - | No | Reseñas de paquete (incluye promedio) |

#### Favoritos
| Método | Endpoint | Body/Params | Auth | Descripción |
|--------|----------|-------------|------|-------------|
| POST | `/api/favorites` | `{package_id}` | Sí | Agregar a favoritos |
| GET | `/api/favorites` | - | Sí | Mis favoritos |
| DELETE | `/api/favorites/:package_id` | - | Sí | Quitar de favoritos |

#### Lealtad
| Método | Endpoint | Auth | Descripción |
|--------|----------|------|-------------|
| GET | `/api/loyalty` | Sí | Puntos de lealtad del usuario (desde DB) |

#### Admin
| Método | Endpoint | Body | Auth | Descripción |
|--------|----------|------|------|-------------|
| POST | `/api/admin/confirm-service` | `{reservation_id}` | Sí | Confirmar servicio completado + otorga 10 pts lealtad |

---

## Base de Datos MySQL

### Crear la base de datos

```bash
mysql -u root -p < backend/schema.sql
```

### Tablas creadas por schema.sql

| Tabla | Propósito |
|-------|-----------|
| `users` | Usuarios con `id` (UUID), `name`, `email`, `password_hash`, `stellar_address`, `loyalty_points` |
| `travel_packages` | Paquetes de viaje con `contract_package_id`, `destination`, `description`, `start_date`, `end_date`, `capacity`, `available_slots`, `price`, `deposit_percent`, `image_url`, `is_active` |
| `reservations` | Reservaciones con `contract_reservation_id`, `total_price`, `deposit_amount`, `status`, `payment_transaction_hash`, `refund_transaction_hash` |
| `reviews` | Reseñas de usuarios (rating 1-5, opcionalmente ligadas a una reservación) |
| `favorites` | Paquetes favoritos de usuarios (unique constraint user+package) |
| `payment_log` | Historial de pagos/depósitos/reembolsos con `transaction_type`, `amount`, `status` |

### Configurar variables de entorno

El backend lee la configuración desde variables de entorno (`process.env`). Puedes exportarlas manualmente o usar un archivo `.env` con un cargador como `dotenv` (no incluido):

```bash
# Opción 1: Exportar variables directamente
export DB_HOST=localhost
export DB_USER=root
export DB_PASSWORD=tu_password
export DB_NAME=turismo_blockchain
export JWT_SECRET=tu_secreto_seguro
export CONTRACT_ID=CCK5C6NBWBPMATNCGL5O6DI6QRELKK5K3KUXZOOSJXJM4OL6KZQTINS4
export STELLAR_NETWORK=testnet
npm start

# Opción 2: Usar archivo .env con dotenv (instalar: npm install dotenv)
cp backend/.env.example backend/.env
# Editar backend/.env con tus credenciales reales
node -r dotenv/config backend/index.js
```

### Iniciar el backend

```bash
cd backend
npm install
npm start
```

---

## Pruebas del Contrato

### Ejecutar tests unitarios (Rust)

```bash
cd mi-contrato
cargo test
```

**Resultado esperado:** 5 tests passed
- `test_init_and_create_package`
- `test_create_reservation`
- `test_confirm_and_complete`
- `test_refund`
- `test_cancel_reservation`

### Invocar funciones directamente con Stellar CLI

```bash
# Inicializar contrato
stellar contract invoke \
  --id CCK5C6NBWBPMATNCGL5O6DI6QRELKK5K3KUXZOOSJXJM4OL6KZQTINS4 \
  --source user --network testnet \
  -- init --arg-addr $(stellar keys address user)

# Crear paquete
stellar contract invoke \
  --id CCK5C6NBWBPMATNCGL5O6DI6QRELKK5K3KUXZOOSJXJM4OL6KZQTINS4 \
  --source user --network testnet \
  -- create_package --arg-string "Cancun" --arg-i128 1000 --arg-u32 50 --arg-u32 20

# Consultar paquete
stellar contract invoke \
  --id CCK5C6NBWBPMATNCGL5O6DI6QRELKK5K3KUXZOOSJXJM4OL6KZQTINS4 \
  --source user --network testnet \
  -- get_package --arg-u64 1
```

---

## Pruebas en Postman

### Configuración

1. Crea una **Collection** llamada `Turismo Blockchain API`
2. Crea una **Variable de colección** `base_url` = `http://localhost:3000`
3. Header global: `Content-Type: application/json`

### Flujo completo de pruebas

#### 1. Registrar Usuario
```
POST {{base_url}}/api/auth/register
Body (JSON):
{
  "name": "Juan Perez",
  "email": "juan@test.com",
  "password": "123456",
  "stellar_address": "GA...tu_stellar_address_aqui"
}
Response: { user: {...}, token: "eyJ..." }
```
→ **Guarda el token** para los siguientes requests.

#### 2. Login
```
POST {{base_url}}/api/auth/login
Body (JSON):
{
  "email": "juan@test.com",
  "password": "123456"
}
Response: { user: {...}, token: "eyJ..." }
```

#### 3. Listar Paquetes (sin auth)
```
GET {{base_url}}/api/packages
Response: { packages: [] }
```

#### 4. Crear Paquete (requiere auth)
```
POST {{base_url}}/api/packages
Headers: Authorization: Bearer {{token}}
Body (JSON):
{
  "destination": "Cancun",
  "description": "Playa paradisíaca",
  "start_date": "2026-07-01",
  "end_date": "2026-07-07",
  "capacity": 50,
  "price": 1000.00,
  "deposit_percent": 20
}
Response: { package: {...} }
```
→ **Guarda el package.id** para crear reservaciones.

#### 5. Crear Reservación
```
POST {{base_url}}/api/reservations
Headers: Authorization: Bearer {{token}}
Body (JSON):
{
  "package_id": "uuid_del_paquete"
}
Response: { reservation: {...} }
```
→ **Guarda el reservation.id**.

#### 6. Confirmar Pago
```
POST {{base_url}}/api/payments/confirm
Headers: Authorization: Bearer {{token}}
Body (JSON):
{
  "reservation_id": "uuid_de_la_reservacion",
  "transaction_hash": "hash_opcional"
}
Response: { message: "Payment confirmed", reservation_id: "..." }
```

#### 7. Confirmar Servicio (Admin)
```
POST {{base_url}}/api/admin/confirm-service
Headers: Authorization: Bearer {{token}}
Body (JSON):
{
  "reservation_id": "uuid_de_la_reservacion"
}
Response: { message: "Service confirmed as completed", reservation_id: "..." }
```

#### 8. Consultar Puntos de Lealtad
```
GET {{base_url}}/api/loyalty
Headers: Authorization: Bearer {{token}}
Response: { loyalty_points: 10 }
```

#### 9. Procesar Reembolso
```
POST {{base_url}}/api/refunds
Headers: Authorization: Bearer {{token}}
Body (JSON):
{
  "reservation_id": "uuid_de_la_reservacion",
  "reason": "Cancelación por clima"
}
Response: { message: "Refund processed", reservation_id: "..." }
```

#### 10. Crear Reseña
```
POST {{base_url}}/api/reviews
Headers: Authorization: Bearer {{token}}
Body (JSON):
{
  "package_id": "uuid_del_paquete",
  "rating": 5,
  "comment": "Increíble experiencia",
  "reservation_id": "uuid_de_la_reservacion"
}
Response: { review: {...} }
```

#### 11. Favoritos
```
POST {{base_url}}/api/favorites
Headers: Authorization: Bearer {{token}}
Body (JSON):
{
  "package_id": "uuid_del_paquete"
}

GET {{base_url}}/api/favorites
Headers: Authorization: Bearer {{token}}

DELETE {{base_url}}/api/favorites/:package_id
Headers: Authorization: Bearer {{token}}
```

### Colección Postman (Importar)

```json
{
  "info": {
    "name": "Turismo Blockchain API",
    "schema": "https://schema.getpostman.com/json/collection/v2.1.0/collection.json"
  },
  "variable": [
    { "key": "base_url", "value": "http://localhost:3000" }
  ],
  "item": [
    {
      "name": "Auth",
      "item": [
        {
          "name": "Register",
          "request": {
            "method": "POST",
            "header": [{ "key": "Content-Type", "value": "application/json" }],
            "body": {
              "mode": "raw",
              "raw": "{\n  \"name\": \"Test User\",\n  \"email\": \"test@example.com\",\n  \"password\": \"123456\",\n  \"stellar_address\": \"GAXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX\"\n}"
            },
            "url": "{{base_url}}/api/auth/register"
          }
        },
        {
          "name": "Login",
          "request": {
            "method": "POST",
            "header": [{ "key": "Content-Type", "value": "application/json" }],
            "body": {
              "mode": "raw",
              "raw": "{\n  \"email\": \"test@example.com\",\n  \"password\": \"123456\"\n}"
            },
            "url": "{{base_url}}/api/auth/login"
          }
        }
      ]
    },
    {
      "name": "Packages",
      "item": [
        {
          "name": "List Packages",
          "request": {
            "method": "GET",
            "url": "{{base_url}}/api/packages"
          }
        },
        {
          "name": "Create Package",
          "request": {
            "method": "POST",
            "header": [
              { "key": "Content-Type", "value": "application/json" },
              { "key": "Authorization", "value": "Bearer {{token}}" }
            ],
            "body": {
              "mode": "raw",
              "raw": "{\n  \"destination\": \"Cancun\",\n  \"description\": \"Playa hermosa\",\n  \"start_date\": \"2026-07-01\",\n  \"end_date\": \"2026-07-07\",\n  \"capacity\": 50,\n  \"price\": 1000.00,\n  \"deposit_percent\": 20\n}"
            },
            "url": "{{base_url}}/api/packages"
          }
        }
      ]
    },
    {
      "name": "Reservations",
      "item": [
        {
          "name": "Create Reservation",
          "request": {
            "method": "POST",
            "header": [
              { "key": "Content-Type", "value": "application/json" },
              { "key": "Authorization", "value": "Bearer {{token}}" }
            ],
            "body": {
              "mode": "raw",
              "raw": "{\n  \"package_id\": \"PACKAGE_UUID\"\n}"
            },
            "url": "{{base_url}}/api/reservations"
          }
        },
        {
          "name": "My Reservations",
          "request": {
            "method": "GET",
            "header": [{ "key": "Authorization", "value": "Bearer {{token}}" }],
            "url": "{{base_url}}/api/reservations"
          }
        }
      ]
    },
    {
      "name": "Payments",
      "item": [
        {
          "name": "Confirm Payment",
          "request": {
            "method": "POST",
            "header": [
              { "key": "Content-Type", "value": "application/json" },
              { "key": "Authorization", "value": "Bearer {{token}}" }
            ],
            "body": {
              "mode": "raw",
              "raw": "{\n  \"reservation_id\": \"RESERVATION_UUID\"\n}"
            },
            "url": "{{base_url}}/api/payments/confirm"
          }
        }
      ]
    },
    {
      "name": "Admin",
      "item": [
        {
          "name": "Confirm Service",
          "request": {
            "method": "POST",
            "header": [
              { "key": "Content-Type", "value": "application/json" },
              { "key": "Authorization", "value": "Bearer {{token}}" }
            ],
            "body": {
              "mode": "raw",
              "raw": "{\n  \"reservation_id\": \"RESERVATION_UUID\"\n}"
            },
            "url": "{{base_url}}/api/admin/confirm-service"
          }
        }
      ]
    },
    {
      "name": "Loyalty",
      "item": [
        {
          "name": "Get Loyalty Points",
          "request": {
            "method": "GET",
            "header": [{ "key": "Authorization", "value": "Bearer {{token}}" }],
            "url": "{{base_url}}/api/loyalty"
          }
        }
      ]
    },
    {
      "name": "Refunds",
      "item": [
        {
          "name": "Process Refund",
          "request": {
            "method": "POST",
            "header": [
              { "key": "Content-Type", "value": "application/json" },
              { "key": "Authorization", "value": "Bearer {{token}}" }
            ],
            "body": {
              "mode": "raw",
              "raw": "{\n  \"reservation_id\": \"RESERVATION_UUID\"\n}"
            },
            "url": "{{base_url}}/api/refunds"
          }
        }
      ]
    },
    {
      "name": "Reviews",
      "item": [
        {
          "name": "Create Review",
          "request": {
            "method": "POST",
            "header": [
              { "key": "Content-Type", "value": "application/json" },
              { "key": "Authorization", "value": "Bearer {{token}}" }
            ],
            "body": {
              "mode": "raw",
              "raw": "{\n  \"package_id\": \"PACKAGE_UUID\",\n  \"rating\": 5,\n  \"comment\": \"Excelente\"\n}"
            },
            "url": "{{base_url}}/api/reviews"
          }
        },
        {
          "name": "Get Package Reviews",
          "request": {
            "method": "GET",
            "url": "{{base_url}}/api/reviews/package/PACKAGE_UUID"
          }
        }
      ]
    },
    {
      "name": "Favorites",
      "item": [
        {
          "name": "Add Favorite",
          "request": {
            "method": "POST",
            "header": [
              { "key": "Content-Type", "value": "application/json" },
              { "key": "Authorization", "value": "Bearer {{token}}" }
            ],
            "body": {
              "mode": "raw",
              "raw": "{\n  \"package_id\": \"PACKAGE_UUID\"\n}"
            },
            "url": "{{base_url}}/api/favorites"
          }
        },
        {
          "name": "Get Favorites",
          "request": {
            "method": "GET",
            "header": [{ "key": "Authorization", "value": "Bearer {{token}}" }],
            "url": "{{base_url}}/api/favorites"
          }
        }
      ]
    }
  ]
}
```

### cURL commands rápidos

```bash
BASE_URL="http://localhost:3000"

# Register
curl -X POST "$BASE_URL/api/auth/register" \
  -H "Content-Type: application/json" \
  -d '{"name":"Test","email":"test@test.com","password":"123456"}'

# Login (guarda el token)
TOKEN=$(curl -s -X POST "$BASE_URL/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"test@test.com","password":"123456"}' | grep -o '"token":"[^"]*"' | cut -d'"' -f4)

# Create Package
curl -X POST "$BASE_URL/api/packages" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"destination":"Cancun","start_date":"2026-07-01","end_date":"2026-07-07","capacity":50,"price":1000}'

# List Packages
curl "$BASE_URL/api/packages"

# Create Reservation (necesitas el package_id)
curl -X POST "$BASE_URL/api/reservations" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"package_id":"PACKAGE_UUID"}'

# Confirm Payment
curl -X POST "$BASE_URL/api/payments/confirm" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"reservation_id":"RESERVATION_UUID"}'

# Confirm Service (admin)
curl -X POST "$BASE_URL/api/admin/confirm-service" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"reservation_id":"RESERVATION_UUID"}'

# Check Loyalty
curl "$BASE_URL/api/loyalty" \
  -H "Authorization: Bearer $TOKEN"
```

---

## Estructura del Proyecto

```
Proyecto_AplicacionesD/
├── backend/
│   ├── index.js            # API Node.js/Express con MySQL (principal)
│   ├── app.py              # API Python/Flask (legacy)
│   ├── schema.sql          # Schema MySQL (6 tablas)
│   ├── package.json        # Dependencias NPM (express, mysql2, bcrypt, jsonwebtoken)
│   ├── .env                # Variables de entorno actuales
│   ├── .env.example        # Template de variables de entorno
│   └── requirements.txt    # Dependencias Python (legacy)
├── mi-contrato/
│   ├── src/
│   │   └── lib.rs          # Contrato inteligente TourismContract (Rust/Soroban)
│   ├── contracts/
│   │   └── hello-world/    # Contrato ejemplo de Soroban
│   ├── Cargo.toml          # Dependencias Rust (soroban-sdk 26.0.0-rc.1, wee_alloc)
│   ├── Cargo.lock
│   ├── CONTRACT_ID         # ID del contrato desplegado en testnet
│   ├── test_snapshots/     # Snapshots de pruebas
│   └── target/             # Compilación WASM
└── DOCUMENTATION.md        # Este archivo
```
