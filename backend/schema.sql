-- =============================================
-- TURISMO BLOCKCHAIN - MySQL Schema
-- =============================================

CREATE DATABASE IF NOT EXISTS turismo_blockchain;
USE turismo_blockchain;

-- =============================================
-- USERS TABLE
-- =============================================
CREATE TABLE IF NOT EXISTS users (
    id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
    name VARCHAR(100) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    stellar_address VARCHAR(56) DEFAULT NULL,
    loyalty_points BIGINT DEFAULT 0,
    biometric_enabled BOOLEAN DEFAULT FALSE,
    pin_hash VARCHAR(255) DEFAULT NULL,
    pin_enabled BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- =============================================
-- TRAVEL PACKAGES TABLE
-- =============================================
CREATE TABLE IF NOT EXISTS travel_packages (
    id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
    contract_package_id BIGINT DEFAULT NULL,
    destination VARCHAR(200) NOT NULL,
    description TEXT DEFAULT NULL,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    capacity INT NOT NULL,
    available_slots INT NOT NULL,
    price DECIMAL(12, 2) NOT NULL,
    deposit_percent INT DEFAULT 20,
    image_url VARCHAR(500) DEFAULT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_destination (destination),
    INDEX idx_active (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- =============================================
-- RESERVATIONS TABLE
-- =============================================
CREATE TABLE IF NOT EXISTS reservations (
    id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
    contract_reservation_id BIGINT DEFAULT NULL,
    user_id CHAR(36) NOT NULL,
    package_id CHAR(36) NOT NULL,
    total_price DECIMAL(12, 2) NOT NULL,
    deposit_amount DECIMAL(12, 2) NOT NULL,
    status VARCHAR(20) DEFAULT 'pending',
    payment_transaction_hash VARCHAR(128) DEFAULT NULL,
    refund_transaction_hash VARCHAR(128) DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT chk_status CHECK (status IN ('pending', 'confirmed', 'completed', 'refunded', 'cancelled')),
    CONSTRAINT fk_reservations_user FOREIGN KEY (user_id) REFERENCES users(id),
    CONSTRAINT fk_reservations_package FOREIGN KEY (package_id) REFERENCES travel_packages(id),
    INDEX idx_reservations_user (user_id),
    INDEX idx_reservations_package (package_id),
    INDEX idx_reservations_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- =============================================
-- REVIEWS TABLE
-- =============================================
CREATE TABLE IF NOT EXISTS reviews (
    id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
    user_id CHAR(36) NOT NULL,
    package_id CHAR(36) NOT NULL,
    reservation_id CHAR(36) DEFAULT NULL,
    rating INT NOT NULL,
    comment TEXT DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_rating CHECK (rating >= 1 AND rating <= 5),
    CONSTRAINT fk_reviews_user FOREIGN KEY (user_id) REFERENCES users(id),
    CONSTRAINT fk_reviews_package FOREIGN KEY (package_id) REFERENCES travel_packages(id),
    CONSTRAINT fk_reviews_reservation FOREIGN KEY (reservation_id) REFERENCES reservations(id),
    INDEX idx_reviews_package (package_id),
    INDEX idx_reviews_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- =============================================
-- FAVORITES TABLE
-- =============================================
CREATE TABLE IF NOT EXISTS favorites (
    id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
    user_id CHAR(36) NOT NULL,
    package_id CHAR(36) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_user_package UNIQUE (user_id, package_id),
    CONSTRAINT fk_favorites_user FOREIGN KEY (user_id) REFERENCES users(id),
    CONSTRAINT fk_favorites_package FOREIGN KEY (package_id) REFERENCES travel_packages(id),
    INDEX idx_favorites_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- =============================================
-- PAYMENT_LOG TABLE (Escrow tracking)
-- =============================================
CREATE TABLE IF NOT EXISTS payment_log (
    id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
    reservation_id CHAR(36) NOT NULL,
    transaction_type VARCHAR(20) NOT NULL,
    transaction_hash VARCHAR(128) DEFAULT NULL,
    amount DECIMAL(12, 2) NOT NULL,
    status VARCHAR(20) DEFAULT 'pending',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_transaction_type CHECK (transaction_type IN ('deposit', 'full_payment', 'refund', 'loyalty_reward')),
    CONSTRAINT fk_payment_log_reservation FOREIGN KEY (reservation_id) REFERENCES reservations(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- =============================================
-- WEBAUTHN / BIOMETRÍA (huella, Face ID, Windows Hello)
-- =============================================
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
