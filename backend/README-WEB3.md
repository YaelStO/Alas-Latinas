# Arquitectura Web 3.0

## ¿Dónde están los datos?

| Dato | Dónde vive |
|------|------------|
| Paquetes, reservas, pagos, lealtad | **Contrato Soroban** (blockchain Stellar testnet) |
| Sesión / perfil básico | **Wallet Stellar** (dirección G...) |
| Reseñas, favoritos, login email | **JSON local** (`backend/data/app.json`) — caché off-chain |
| Biometría | Credenciales WebAuthn en JSON local |

**MySQL no es obligatorio.** Por defecto `STORAGE_MODE=web3`.

## Modos de almacenamiento

```env
# .env — Web3 (predeterminado)
STORAGE_MODE=web3

# .env — MySQL (opcional, proyectos híbridos)
STORAGE_MODE=mysql
```

## Arrancar sin MySQL

```powershell
cd backend
npm run dev
```

Verás: `Almacenamiento: JSON local + Soroban (Web3)`

## Usuario demo

- `admin@admin.com` / `123456`

## Contrato en testnet

`CCK5C6NBWBPMATNCGL5O6DI6QRELKK5K3KUXZOOSJXJM4OL6KZQTINS4`
