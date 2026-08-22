INSERT INTO users (id, email, role)
VALUES
    (gen_random_uuid(), 'customer@example.com', 'CUSTOMER'),
    (gen_random_uuid(), 'operator@example.com', 'OPERATOR')
ON CONFLICT (email) DO UPDATE SET role = EXCLUDED.role;

INSERT INTO concerts (slug, name, status, starts_at)
VALUES (
    'summer-festival-2026',
    'Summer Festival 2026',
    'PUBLISHED',
    '2026-12-31T12:00:00Z'
)
ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name, status = EXCLUDED.status, starts_at = EXCLUDED.starts_at;

INSERT INTO ticket_categories (concert_id, code, name, price)
SELECT c.id, seed.code, seed.name, seed.price
FROM concerts c
CROSS JOIN (VALUES
    ('VIP', 'VIP', 150.00::NUMERIC),
    ('STANDARD', 'Standard', 50.00::NUMERIC)
) AS seed(code, name, price)
WHERE c.slug = 'summer-festival-2026'
ON CONFLICT (concert_id, code) DO UPDATE SET name = EXCLUDED.name, price = EXCLUDED.price;

INSERT INTO ticket_inventories (ticket_category_id, total_quantity, available_quantity)
SELECT tc.id,
       CASE tc.code WHEN 'VIP' THEN 10 ELSE 1000 END,
       CASE tc.code WHEN 'VIP' THEN 10 ELSE 1000 END
FROM ticket_categories tc
JOIN concerts c ON c.id = tc.concert_id
WHERE c.slug = 'summer-festival-2026'
ON CONFLICT (ticket_category_id) DO UPDATE SET
    total_quantity = EXCLUDED.total_quantity,
    available_quantity = EXCLUDED.available_quantity,
    updated_at = NOW();

INSERT INTO vouchers (id, code, discount_type, discount_value, usage_limit, used_count, status, starts_at, expires_at)
VALUES
    (gen_random_uuid(), 'FLASH10', 'PERCENT', 10.00, 100, 0, 'ACTIVE', '2026-01-01T00:00:00Z', '2027-01-01T00:00:00Z'),
    (gen_random_uuid(), 'EXHAUSTED', 'PERCENT', 20.00, 1, 1, 'ACTIVE', '2026-01-01T00:00:00Z', '2027-01-01T00:00:00Z'),
    (gen_random_uuid(), 'EXPIRED', 'FIXED', 5.00, 100, 0, 'EXPIRED', '2025-01-01T00:00:00Z', '2025-12-31T00:00:00Z')
ON CONFLICT (code) DO UPDATE SET status = EXCLUDED.status, usage_limit = EXCLUDED.usage_limit, used_count = EXCLUDED.used_count;
