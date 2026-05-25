-- Autenticación biométrica (WebAuthn: huella, Face ID, Windows Hello)
USE turismo_blockchain;

CREATE TABLE IF NOT EXISTS webauthn_credentials (
    id CHAR(36) PRIMARY KEY,
    user_id CHAR(36) NOT NULL,
    credential_id VARCHAR(512) NOT NULL,
    public_key TEXT NOT NULL,
    counter BIGINT UNSIGNED NOT NULL DEFAULT 0,
    device_name VARCHAR(100) DEFAULT 'Biometría',
    transports JSON DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_used_at TIMESTAMP NULL,
    CONSTRAINT uq_webauthn_credential UNIQUE (credential_id),
    CONSTRAINT fk_webauthn_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_webauthn_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Si users ya existe sin biometric_enabled, ejecuta manualmente:
-- ALTER TABLE users ADD COLUMN biometric_enabled BOOLEAN DEFAULT FALSE;
