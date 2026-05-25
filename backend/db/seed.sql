-- Datos de ejemplo para desarrollo (Web 3.0 Turismo Blockchain)
USE turismo_blockchain;

INSERT INTO travel_packages (
    id, destination, description, start_date, end_date,
    capacity, available_slots, price, deposit_percent, image_url, is_active
) VALUES
(
    'a1000001-0000-4000-8000-000000000001',
    'Cancún',
    'Playa, arrecife y cultura maya. Paquete todo incluido.',
    '2026-07-01', '2026-07-07', 40, 40, 1250.00, 20,
    'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=800',
    TRUE
),
(
    'a1000001-0000-4000-8000-000000000002',
    'Ciudad de México',
    'Historia, gastronomía y museos en la capital.',
    '2026-08-15', '2026-08-20', 30, 30, 890.00, 15,
    'https://images.unsplash.com/photo-1518654090668-93fc06ada88e?w=800',
    TRUE
),
(
    'a1000001-0000-4000-8000-000000000003',
    'Cartagena',
    'Ciudad amurallada, Caribe y arquitectura colonial.',
    '2026-09-10', '2026-09-17', 25, 25, 1100.00, 25,
    'https://images.unsplash.com/photo-1580654712600-7f5f7d0b8f0e?w=800',
    TRUE
),
(
    'a1000001-0000-4000-8000-000000000004',
    'Patagonia',
    'Glaciares, trekking y naturaleza en el sur.',
    '2026-11-01', '2026-11-10', 15, 15, 2400.00, 30,
    'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=800',
    TRUE
)
ON DUPLICATE KEY UPDATE destination = VALUES(destination);
