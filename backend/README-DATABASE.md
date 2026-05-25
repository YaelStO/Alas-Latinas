# Base de datos — Turismo Blockchain (Web 3.0)

## MySQL con Docker (recomendado)

```powershell
cd backend
copy .env.example .env
npm install
npm run db:up
# Espera ~15 segundos a que MySQL arranque
npm run db:seed
npm run dev
```

## Credenciales por defecto (Docker)

| Variable | Valor |
|----------|--------|
| DB_HOST | localhost |
| DB_USER | turismo |
| DB_PASSWORD | turismo_dev |
| DB_NAME | turismo_blockchain |

## Usuario demo

- **Admin:** `admin@admin.com` / `123456` (panel `/admin`)
- **Paquetes:** 4 destinos precargados (Cancún, CDMX, Cartagena, Patagonia)

## Tablas

- `users` — usuarios y wallet Stellar
- `travel_packages` — paquetes turísticos
- `reservations` — reservas
- `reviews` — reseñas
- `favorites` — favoritos
- `payment_log` — historial de pagos/escrow

## Biometría (WebAuthn)

- Huella, Face ID o Windows Hello
- Activar: Dashboard → **Activar huella / Face ID** (tras iniciar sesión)
- Login: pantalla de login → **Entrar con huella / Face ID**
- Tabla: `webauthn_credentials`

Variables en `.env`:
```
WEBAUTHN_RP_ID=localhost
WEBAUTHN_ORIGIN=http://localhost:5173
```

## Comprobar conexión

`GET http://localhost:3000/api/health`
